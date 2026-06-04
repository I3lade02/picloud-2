import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSafeExtension, normalizeOriginalName, serializeFileForClient } from "@/lib/files";
import { ensureUploadDir, getStoredFilePath } from "@/lib/storage";
import { folderLocationSchema } from "@/lib/validation";

export const runtime = "nodejs";

type PendingUpload = {
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  extension: string | null;
  path: string;
  fullPath: string;
};

class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function contentLengthExceedsLimit(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (!contentLength) {
    return false;
  }

  const parsed = Number(contentLength);

  return Number.isFinite(parsed) && parsed > env.MAX_UPLOAD_SIZE_BYTES;
}

async function cleanupUploads(uploads: PendingUpload[]) {
  await Promise.allSettled(uploads.map((upload) => rm(upload.fullPath, { force: true })));
}

async function parseMultipartUpload(request: Request) {
  const contentType = request.headers.get("content-type");

  if (!contentType?.includes("multipart/form-data")) {
    throw new UploadError("Upload request must be multipart form data.", 400);
  }

  if (!request.body) {
    throw new UploadError("Upload request body is empty.", 400);
  }

  const uploads: PendingUpload[] = [];
  const writeTasks: Promise<void>[] = [];
  let totalBytes = 0;

  await new Promise<void>((resolve, reject) => {
    const parser = busboy({
      headers: {
        "content-type": contentType,
      },
      limits: {
        fileSize: env.MAX_UPLOAD_SIZE_BYTES,
        files: 25,
      },
    });

    const rejectOnce = (error: Error) => {
      parser.destroy(error);
      reject(error);
    };

    parser.on("file", (fieldName, fileStream, fileInfo) => {
      if (fieldName !== "file") {
        fileStream.resume();
        return;
      }

      const originalName = normalizeOriginalName(fileInfo.filename);
      const extension = getSafeExtension(originalName);
      const storedName = `${randomUUID()}${extension}`;
      const fullPath = getStoredFilePath(storedName);
      const pendingUpload: PendingUpload = {
        originalName,
        storedName,
        mimeType: fileInfo.mimeType || "application/octet-stream",
        size: 0,
        extension: extension || null,
        path: storedName,
        fullPath,
      };
      const writeStream = createWriteStream(fullPath, { flags: "wx" });

      uploads.push(pendingUpload);

      fileStream.on("data", (chunk: Buffer) => {
        pendingUpload.size += chunk.length;
        totalBytes += chunk.length;

        if (totalBytes > env.MAX_UPLOAD_SIZE_BYTES) {
          rejectOnce(new UploadError("Upload exceeds the configured size limit.", 413));
        }
      });

      fileStream.on("limit", () => {
        rejectOnce(new UploadError("A file exceeds the configured size limit.", 413));
      });

      const writeTask = new Promise<void>((resolveWrite, rejectWrite) => {
        writeStream.on("finish", resolveWrite);
        writeStream.on("error", rejectWrite);
        fileStream.on("error", rejectWrite);
      });

      writeTasks.push(writeTask);
      fileStream.pipe(writeStream);
    });

    parser.on("filesLimit", () => {
      rejectOnce(new UploadError("Too many files in one upload.", 400));
    });

    parser.on("error", reject);

    parser.on("finish", async () => {
      try {
        await Promise.all(writeTasks);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>).pipe(parser);
  });

  if (uploads.length === 0) {
    throw new UploadError("Choose at least one file to upload.", 400);
  }

  return uploads;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  if (contentLengthExceedsLimit(request)) {
    return NextResponse.json({ message: "Upload exceeds the configured size limit." }, { status: 413 });
  }

  const url = new URL(request.url);
  const parsedFolderId = folderLocationSchema.optional().safeParse(url.searchParams.get("folderId") ?? undefined);

  if (!parsedFolderId.success) {
    return NextResponse.json({ message: "Invalid folder id." }, { status: 400 });
  }

  const folderId = parsedFolderId.data === "root" ? null : (parsedFolderId.data ?? null);

  if (folderId) {
    const folder = await db.folder.findFirst({
      where: {
        id: folderId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!folder) {
      return NextResponse.json({ message: "Folder not found." }, { status: 404 });
    }
  }

  let uploads: PendingUpload[] = [];

  try {
    await ensureUploadDir();
    uploads = await parseMultipartUpload(request);

    const createdFiles = await db.$transaction(
      uploads.map((upload) =>
        db.file.create({
          data: {
            originalName: upload.originalName,
            storedName: upload.storedName,
            mimeType: upload.mimeType,
            size: upload.size,
            extension: upload.extension,
            path: upload.path,
            userId: user.id,
            folderId,
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
        }),
      ),
    );

    return NextResponse.json({ files: createdFiles.map(serializeFileForClient) });
  } catch (error) {
    await cleanupUploads(uploads);

    if (error instanceof UploadError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);
    return NextResponse.json({ message: "Upload failed. Please try again." }, { status: 500 });
  }
}
