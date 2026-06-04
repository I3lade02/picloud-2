import "server-only";

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

export function getUploadDir() {
  if (path.isAbsolute(env.UPLOAD_DIR)) {
    return env.UPLOAD_DIR;
  }

  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.UPLOAD_DIR);
}

export function getThumbnailDir() {
  return path.resolve(path.dirname(getUploadDir()), "thumbnails");
}

export async function ensureUploadDir() {
  await mkdir(getUploadDir(), { recursive: true });
}

export async function ensureThumbnailDir() {
  await mkdir(getThumbnailDir(), { recursive: true });
}

export function getStoredFilePath(storedName: string) {
  const uploadDir = getUploadDir();
  const fullPath = path.resolve(uploadDir, storedName);
  const relativePath = path.relative(uploadDir, fullPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved upload path escaped the upload directory.");
  }

  return fullPath;
}

export function getStoredThumbnailPath(storedName: string) {
  const thumbnailDir = getThumbnailDir();
  const fullPath = path.resolve(thumbnailDir, `${storedName}.webp`);
  const relativePath = path.relative(thumbnailDir, fullPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Resolved thumbnail path escaped the thumbnail directory.");
  }

  return fullPath;
}
