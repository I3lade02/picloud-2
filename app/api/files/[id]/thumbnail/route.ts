import { createReadStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPreviewKind } from "@/lib/files";
import { ensureThumbnailDir, getStoredFilePath, getStoredThumbnailPath } from "@/lib/storage";
import { fileIdSchema } from "@/lib/validation";

export const runtime = "nodejs";

const thumbnailSize = 220;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function streamFile(fullPath: string) {
  return Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>;
}

async function ensureThumbnail(sourcePath: string, thumbnailPath: string) {
  const [sourceStat, thumbnailStat] = await Promise.all([
    stat(sourcePath).catch(() => null),
    stat(thumbnailPath).catch(() => null),
  ]);

  if (!sourceStat?.isFile()) {
    return false;
  }

  if (thumbnailStat?.isFile() && thumbnailStat.mtimeMs >= sourceStat.mtimeMs) {
    return true;
  }

  await ensureThumbnailDir();

  const temporaryPath = `${thumbnailPath}.${Date.now()}.tmp`;

  try {
    await sharp(sourcePath)
      .rotate()
      .resize({
        width: thumbnailSize,
        height: thumbnailSize,
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toFile(temporaryPath);
    await rename(temporaryPath, thumbnailPath);

    return true;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    console.error(error);

    return false;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = fileIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json({ message: "Invalid file id." }, { status: 400 });
  }

  const file = await db.file.findFirst({
    where: {
      id: parsedId.data,
      userId: user.id,
    },
    select: {
      storedName: true,
      mimeType: true,
      extension: true,
    },
  });

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  if (getPreviewKind(file.mimeType, file.extension) !== "image") {
    return NextResponse.json({ message: "Thumbnails are available for image files only." }, { status: 415 });
  }

  const sourcePath = getStoredFilePath(file.storedName);
  const thumbnailPath = getStoredThumbnailPath(file.storedName);
  const isReady = await ensureThumbnail(sourcePath, thumbnailPath);

  if (!isReady) {
    return NextResponse.json({ message: "Could not create thumbnail." }, { status: 500 });
  }

  const thumbnailStat = await stat(thumbnailPath).catch(() => null);

  if (!thumbnailStat?.isFile()) {
    return NextResponse.json({ message: "Thumbnail is missing." }, { status: 404 });
  }

  return new Response(streamFile(thumbnailPath), {
    headers: {
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(thumbnailStat.size),
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
