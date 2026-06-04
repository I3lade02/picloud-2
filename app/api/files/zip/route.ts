import * as archiverModule from "archiver";
import type { Archiver } from "archiver";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeOriginalName } from "@/lib/files";
import { getStoredFilePath } from "@/lib/storage";
import { fileIdsSchema, folderLocationSchema } from "@/lib/validation";

export const runtime = "nodejs";

type ZipFile = {
  id: string;
  originalName: string;
  storedName: string;
  folderId: string | null;
};

type FolderRecord = {
  id: string;
  name: string;
  parentId: string | null;
};

type ZipArchiveConstructor = new (options?: { zlib?: { level?: number } }) => Archiver;

const ZipArchive = (archiverModule as unknown as { ZipArchive: ZipArchiveConstructor }).ZipArchive;

function getAttachmentName(fileName: string) {
  const normalized = normalizeOriginalName(fileName).replace(/\.zip$/i, "");
  const asciiFallback = normalized
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\\"]/g, "_")
    .slice(0, 160);
  const fallback = `${asciiFallback || "picloud-files"}.zip`;
  const utf8Name = `${normalized || "picloud-files"}.zip`;

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

function sanitizeZipPart(value: string, fallback: string) {
  const normalized = normalizeOriginalName(value).replaceAll("\\", "_").replaceAll("/", "_");

  return normalized && normalized !== "." && normalized !== ".." ? normalized : fallback;
}

function getUniqueEntryName(desiredName: string, usedNames: Set<string>) {
  const parsed = path.posix.parse(desiredName);
  let candidate = desiredName;
  let index = 2;

  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = path.posix.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }

  usedNames.add(candidate.toLocaleLowerCase());

  return candidate;
}

function getDescendantFolderIds(parentId: string | null, folders: FolderRecord[]) {
  const childrenByParent = new Map<string | null, FolderRecord[]>();
  const folderIds = new Set<string>();

  for (const folder of folders) {
    const children = childrenByParent.get(folder.parentId) ?? [];
    children.push(folder);
    childrenByParent.set(folder.parentId, children);
  }

  function visit(folderId: string | null) {
    for (const child of childrenByParent.get(folderId) ?? []) {
      folderIds.add(child.id);
      visit(child.id);
    }
  }

  if (parentId) {
    folderIds.add(parentId);
  }

  visit(parentId);

  return Array.from(folderIds);
}

function getFolderPathParts(folderId: string | null, foldersById: Map<string, FolderRecord>) {
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = folderId ? foldersById.get(folderId) : undefined;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(sanitizeZipPart(current.name, "folder"));
    current = current.parentId ? foldersById.get(current.parentId) : undefined;
  }

  return parts;
}

function parseSelectedFileIds(url: URL) {
  const commaIds = url.searchParams
    .get("fileIds")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const repeatedIds = url.searchParams.getAll("fileId").map((id) => id.trim()).filter(Boolean);
  const ids = [...new Set([...(commaIds ?? []), ...repeatedIds])];

  return ids.length > 0 ? fileIdsSchema.safeParse(ids) : null;
}

async function getSelectedFiles(userId: string, fileIds: string[]) {
  const files = await db.file.findMany({
    where: {
      id: { in: fileIds },
      userId,
    },
    select: {
      id: true,
      originalName: true,
      storedName: true,
      folderId: true,
    },
  });

  if (files.length !== fileIds.length) {
    return undefined;
  }

  return {
    files,
    folders: [] as FolderRecord[],
    zipName: "picloud-selection",
    includeFolderPaths: false,
  };
}

async function getFolderFiles(userId: string, folderId: string) {
  const normalizedFolderId = folderId === "root" ? null : folderId;
  const folders = await db.folder.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      parentId: true,
    },
  });
  const folder = normalizedFolderId ? folders.find((item) => item.id === normalizedFolderId) : null;

  if (normalizedFolderId && !folder) {
    return undefined;
  }

  const descendantFolderIds = getDescendantFolderIds(normalizedFolderId, folders);
  const files = await db.file.findMany({
    where: {
      userId,
      OR: [
        ...(normalizedFolderId === null ? [{ folderId: null }] : []),
        ...(descendantFolderIds.length > 0 ? [{ folderId: { in: descendantFolderIds } }] : []),
      ],
    },
    select: {
      id: true,
      originalName: true,
      storedName: true,
      folderId: true,
    },
    orderBy: { originalName: "asc" },
  });

  return {
    files,
    folders,
    zipName: folder?.name ?? "picloud-root",
    includeFolderPaths: true,
  };
}

async function addFilesToArchive(archive: Archiver, files: ZipFile[], folders: FolderRecord[], includeFolderPaths: boolean) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const usedNames = new Set<string>();
  let addedCount = 0;

  for (const file of files) {
    const fullPath = getStoredFilePath(file.storedName);
    const fileStat = await stat(fullPath).catch(() => null);

    if (!fileStat?.isFile()) {
      continue;
    }

    const fileName = sanitizeZipPart(file.originalName, "file");
    const folderParts = includeFolderPaths ? getFolderPathParts(file.folderId, foldersById) : [];
    const entryName = getUniqueEntryName(path.posix.join(...folderParts, fileName), usedNames);

    archive.file(fullPath, { name: entryName });
    addedCount += 1;
  }

  return addedCount;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const selectedFileIds = parseSelectedFileIds(url);
  const rawFolderId = url.searchParams.get("folderId") ?? undefined;

  if (selectedFileIds && rawFolderId) {
    return NextResponse.json({ message: "Choose selected files or a folder, not both." }, { status: 400 });
  }

  if (selectedFileIds && !selectedFileIds.success) {
    return NextResponse.json(
      { message: selectedFileIds.error.issues[0]?.message ?? "Invalid selected file ids." },
      { status: 400 },
    );
  }

  const parsedFolderId = rawFolderId ? folderLocationSchema.safeParse(rawFolderId) : null;

  if (parsedFolderId && !parsedFolderId.success) {
    return NextResponse.json({ message: "Invalid folder id." }, { status: 400 });
  }

  const zipSource = selectedFileIds?.success
    ? await getSelectedFiles(user.id, selectedFileIds.data)
    : parsedFolderId?.success
      ? await getFolderFiles(user.id, parsedFolderId.data)
      : null;

  if (!zipSource) {
    return NextResponse.json({ message: "Files or folder not found." }, { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const addedCount = await addFilesToArchive(
    archive,
    zipSource.files,
    zipSource.folders,
    zipSource.includeFolderPaths,
  );

  if (addedCount === 0) {
    return NextResponse.json({ message: "No stored files were available for ZIP download." }, { status: 404 });
  }

  archive.on("warning", (error: Error) => {
    console.warn(error);
  });
  archive.on("error", (error: Error) => {
    console.error(error);
    archive.destroy(error);
  });

  void archive.finalize();

  const body = Readable.toWeb(archive as unknown as Readable) as unknown as BodyInit;

  return new Response(body, {
    headers: {
      "Content-Disposition": getAttachmentName(zipSource.zipName),
      "Content-Type": "application/zip",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
