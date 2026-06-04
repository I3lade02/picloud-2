import { randomUUID } from "node:crypto";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { TextDecoder } from "node:util";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editableTextMaxBytes, getSafeExtension, isEditableTextFile, serializeFileForClient } from "@/lib/files";
import { formatBytes } from "@/lib/format";
import { getStoredFilePath, getStoredThumbnailPath } from "@/lib/storage";
import { editTextFileSchema, fileIdSchema, moveFileSchema, renameFileSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type OwnedFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  extension: string | null;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function invalidFileIdResponse() {
  return NextResponse.json({ message: "Invalid file id." }, { status: 400 });
}

function textFileTooLargeResponse() {
  return NextResponse.json(
    { message: `Text editing is limited to files up to ${formatBytes(editableTextMaxBytes)}.` },
    { status: 413 },
  );
}

function unsupportedTextEditResponse() {
  return NextResponse.json({ message: "Only UTF-8 text files can be edited in the browser." }, { status: 415 });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findOwnedFile(fileId: string, userId: string): Promise<OwnedFile | null> {
  return db.file.findFirst({
    where: {
      id: fileId,
      userId,
    },
    select: {
      id: true,
      originalName: true,
      storedName: true,
      mimeType: true,
      size: true,
      extension: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

function serializeEditableTextResponse(file: OwnedFile, content: string) {
  return {
    file: serializeFileForClient(file),
    content,
    maxEditableSizeBytes: editableTextMaxBytes,
    maxEditableSizeFormatted: formatBytes(editableTextMaxBytes),
  };
}

async function validateTargetFolder(folderId: string, userId: string) {
  if (folderId === "root") {
    return null;
  }

  const folder = await db.folder.findFirst({
    where: {
      id: folderId,
      userId,
    },
    select: { id: true },
  });

  return folder?.id ?? undefined;
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = fileIdSchema.safeParse(id);

  if (!parsedId.success) {
    return invalidFileIdResponse();
  }

  const file = await findOwnedFile(parsedId.data, user.id);

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  if (!isEditableTextFile(file.mimeType, file.extension)) {
    return unsupportedTextEditResponse();
  }

  const fullPath = getStoredFilePath(file.storedName);
  const fileStat = await stat(fullPath).catch(() => null);

  if (!fileStat?.isFile()) {
    return NextResponse.json({ message: "Stored file is missing." }, { status: 404 });
  }

  if (fileStat.size > editableTextMaxBytes) {
    return textFileTooLargeResponse();
  }

  let fileBuffer: Buffer;

  try {
    fileBuffer = await readFile(fullPath);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Could not read text file." }, { status: 500 });
  }

  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(fileBuffer);

    return NextResponse.json(serializeEditableTextResponse({ ...file, size: fileStat.size }, content));
  } catch {
    return unsupportedTextEditResponse();
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = fileIdSchema.safeParse(id);

  if (!parsedId.success) {
    return invalidFileIdResponse();
  }

  const body = await request.json().catch(() => null);

  if (isObject(body) && "content" in body) {
    const parsedBody = editTextFileSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: parsedBody.error.issues[0]?.message ?? "Invalid text content." },
        { status: 400 },
      );
    }

    const nextSize = Buffer.byteLength(parsedBody.data.content, "utf8");

    if (nextSize > editableTextMaxBytes) {
      return textFileTooLargeResponse();
    }

    const file = await findOwnedFile(parsedId.data, user.id);

    if (!file) {
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    }

    if (!isEditableTextFile(file.mimeType, file.extension)) {
      return unsupportedTextEditResponse();
    }

    const fullPath = getStoredFilePath(file.storedName);
    const fileStat = await stat(fullPath).catch(() => null);

    if (!fileStat?.isFile()) {
      return NextResponse.json({ message: "Stored file is missing." }, { status: 404 });
    }

    if (fileStat.size > editableTextMaxBytes) {
      return textFileTooLargeResponse();
    }

    const temporaryPath = `${fullPath}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporaryPath, parsedBody.data.content, { encoding: "utf8", flag: "wx" });
      await rename(temporaryPath, fullPath);

      const updatedStat = await stat(fullPath);
      const updatedFile = await db.file.update({
        where: { id: file.id },
        data: { size: updatedStat.size },
        select: {
          id: true,
          originalName: true,
          storedName: true,
          mimeType: true,
          size: true,
          extension: true,
          folderId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json(serializeEditableTextResponse(updatedFile, parsedBody.data.content));
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      console.error(error);

      return NextResponse.json({ message: "Could not save text file. Please try again." }, { status: 500 });
    }
  }

  if (isObject(body) && "folderId" in body) {
    const parsedBody = moveFileSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: parsedBody.error.issues[0]?.message ?? "Invalid folder id." },
        { status: 400 },
      );
    }

    const file = await findOwnedFile(parsedId.data, user.id);

    if (!file) {
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    }

    const targetFolderId = await validateTargetFolder(parsedBody.data.folderId, user.id);

    if (targetFolderId === undefined) {
      return NextResponse.json({ message: "Target folder not found." }, { status: 404 });
    }

    const updatedFile = await db.file.update({
      where: { id: file.id },
      data: { folderId: targetFolderId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        extension: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ file: serializeFileForClient(updatedFile) });
  }

  const parsedBody = renameFileSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: parsedBody.error.issues[0]?.message ?? "Invalid file name." },
      { status: 400 },
    );
  }

  const file = await findOwnedFile(parsedId.data, user.id);

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const updatedFile = await db.file.update({
    where: { id: parsedId.data },
    data: {
      originalName: parsedBody.data.originalName,
      extension: getSafeExtension(parsedBody.data.originalName) || null,
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      extension: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ file: serializeFileForClient(updatedFile) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = fileIdSchema.safeParse(id);

  if (!parsedId.success) {
    return invalidFileIdResponse();
  }

  const file = await findOwnedFile(parsedId.data, user.id);

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  try {
    await Promise.all([
      rm(getStoredFilePath(file.storedName), { force: true }),
      rm(getStoredThumbnailPath(file.storedName), { force: true }),
    ]);
    await db.file.delete({ where: { id: file.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Could not delete file. Please try again." }, { status: 500 });
  }
}
