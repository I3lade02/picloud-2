import { rm } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeFileForClient } from "@/lib/files";
import { getStoredFilePath, getStoredThumbnailPath } from "@/lib/storage";
import { bulkFilesSchema, bulkMoveFilesSchema } from "@/lib/validation";

export const runtime = "nodejs";

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

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bulkMoveFilesSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: parsedBody.error.issues[0]?.message ?? "Invalid bulk move request." },
      { status: 400 },
    );
  }

  const files = await db.file.findMany({
    where: {
      id: { in: parsedBody.data.fileIds },
      userId: user.id,
    },
    select: { id: true },
  });

  if (files.length !== parsedBody.data.fileIds.length) {
    return NextResponse.json({ message: "One or more selected files were not found." }, { status: 404 });
  }

  const targetFolderId = await validateTargetFolder(parsedBody.data.folderId, user.id);

  if (targetFolderId === undefined) {
    return NextResponse.json({ message: "Target folder not found." }, { status: 404 });
  }

  await db.file.updateMany({
    where: {
      id: { in: parsedBody.data.fileIds },
      userId: user.id,
    },
    data: { folderId: targetFolderId },
  });

  const updatedFiles = await db.file.findMany({
    where: {
      id: { in: parsedBody.data.fileIds },
      userId: user.id,
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

  return NextResponse.json({
    files: updatedFiles.map(serializeFileForClient),
    movedCount: updatedFiles.length,
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bulkFilesSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: parsedBody.error.issues[0]?.message ?? "Invalid bulk delete request." },
      { status: 400 },
    );
  }

  const files = await db.file.findMany({
    where: {
      id: { in: parsedBody.data.fileIds },
      userId: user.id,
    },
    select: {
      id: true,
      storedName: true,
    },
  });

  if (files.length !== parsedBody.data.fileIds.length) {
    return NextResponse.json({ message: "One or more selected files were not found." }, { status: 404 });
  }

  try {
    await Promise.all(
      files.flatMap((file) => [
        rm(getStoredFilePath(file.storedName), { force: true }),
        rm(getStoredThumbnailPath(file.storedName), { force: true }),
      ]),
    );
    const result = await db.file.deleteMany({
      where: {
        id: { in: parsedBody.data.fileIds },
        userId: user.id,
      },
    });

    return NextResponse.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Could not delete selected files. Please try again." }, { status: 500 });
  }
}
