import path from "node:path";

export const fileCategories = ["images", "documents", "videos", "audio", "archives", "other"] as const;

export type FileCategory = (typeof fileCategories)[number];

export type PreviewKind = "image" | "pdf" | "text" | "audio" | "video";

export const editableTextMaxBytes = 1024 * 1024;

const archiveExtensions = new Set([".zip", ".rar", ".7z", ".tar", ".gz"]);
const documentExtensions = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".xls", ".xlsx", ".ppt", ".pptx"]);
const imagePreviewExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".ico"]);
const audioPreviewExtensions = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".webm"]);
const videoPreviewExtensions = new Set([".mp4", ".webm", ".ogg", ".mov", ".m4v"]);
const textPreviewExtensions = new Set([".txt", ".md", ".csv", ".json", ".log", ".xml", ".yaml", ".yml"]);

export function normalizeOriginalName(fileName: string) {
  const normalizedSeparators = fileName.replaceAll("\\", "/");
  const baseName = path.basename(normalizedSeparators).trim();
  const withoutControlChars = baseName.replace(/[\x00-\x1F\x7F]/g, "");

  if (!withoutControlChars || withoutControlChars === "." || withoutControlChars === "..") {
    return "upload";
  }

  return withoutControlChars;
}

export function getSafeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return extension.length > 1 && extension.length <= 16 ? extension : "";
}

export function getFileCategory(mimeType: string, extension: string | null | undefined): FileCategory {
  if (mimeType.startsWith("image/")) {
    return "images";
  }

  if (mimeType.startsWith("video/")) {
    return "videos";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  const normalizedExtension = extension?.toLowerCase() ?? "";

  if (archiveExtensions.has(normalizedExtension)) {
    return "archives";
  }

  if (mimeType.includes("pdf") || mimeType.includes("document") || documentExtensions.has(normalizedExtension)) {
    return "documents";
  }

  return "other";
}

export function getPreviewKind(mimeType: string, extension: string | null | undefined): PreviewKind | null {
  const normalizedExtension = extension?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || normalizedExtension === ".pdf") {
    return "pdf";
  }

  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    return "image";
  }

  if (imagePreviewExtensions.has(normalizedExtension)) {
    return "image";
  }

  if (mimeType.startsWith("audio/") || audioPreviewExtensions.has(normalizedExtension)) {
    return "audio";
  }

  if (mimeType.startsWith("video/") || videoPreviewExtensions.has(normalizedExtension)) {
    return "video";
  }

  if (mimeType.startsWith("text/") || textPreviewExtensions.has(normalizedExtension)) {
    return "text";
  }

  return null;
}

export function getPreviewContentType(mimeType: string, previewKind: PreviewKind) {
  if (previewKind === "text") {
    return "text/plain; charset=utf-8";
  }

  if (previewKind === "pdf") {
    return "application/pdf";
  }

  return mimeType || "application/octet-stream";
}

export function isEditableTextFile(mimeType: string, extension: string | null | undefined) {
  return getPreviewKind(mimeType, extension) === "text";
}

export function serializeFileForClient(file: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  extension: string | null;
  folderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const category = getFileCategory(file.mimeType, file.extension);
  const previewKind = getPreviewKind(file.mimeType, file.extension);

  return {
    ...file,
    category,
    isImage: category === "images",
    previewKind,
  };
}
