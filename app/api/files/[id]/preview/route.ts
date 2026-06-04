import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPreviewContentType, getPreviewKind, type PreviewKind } from "@/lib/files";
import { getStoredFilePath } from "@/lib/storage";
import { fileIdSchema } from "@/lib/validation";

export const runtime = "nodejs";

const textPreviewMaxBytes = 512 * 1024;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ByteRange = {
  start: number;
  end: number;
};

function getInlineContentDisposition(fileName: string) {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\\"]/g, "_")
    .slice(0, 180);
  const fallback = asciiFallback || "preview";

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function parseRangeHeader(rangeHeader: string | null, size: number): ByteRange | null {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null;
  }

  const [rawStart, rawEnd] = rangeHeader.replace("bytes=", "").split("-");
  const start = rawStart ? Number(rawStart) : 0;
  const end = rawEnd ? Number(rawEnd) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

function streamFile(fullPath: string, range: ByteRange | null) {
  const stream = range ? createReadStream(fullPath, range) : createReadStream(fullPath);

  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

function getPreviewHeaders(fileName: string, contentType: string, size: number, previewKind: PreviewKind) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": getInlineContentDisposition(fileName),
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  if (previewKind === "text" && size > textPreviewMaxBytes) {
    headers.set("X-PiCloud-Preview-Truncated", "true");
  }

  return headers;
}

export async function GET(request: Request, context: RouteContext) {
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
      originalName: true,
      storedName: true,
      mimeType: true,
      extension: true,
    },
  });

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const previewKind = getPreviewKind(file.mimeType, file.extension);

  if (!previewKind) {
    return NextResponse.json({ message: "Preview is not available for this file type." }, { status: 415 });
  }

  const fullPath = getStoredFilePath(file.storedName);
  const fileStat = await stat(fullPath).catch(() => null);

  if (!fileStat?.isFile()) {
    return NextResponse.json({ message: "Stored file is missing." }, { status: 404 });
  }

  const contentType = getPreviewContentType(file.mimeType, previewKind);
  const headers = getPreviewHeaders(file.originalName, contentType, fileStat.size, previewKind);

  if (previewKind === "text") {
    if (fileStat.size === 0) {
      headers.set("Content-Length", "0");

      return new Response("", { headers });
    }

    const end = Math.max(0, Math.min(fileStat.size, textPreviewMaxBytes) - 1);
    headers.set("Content-Length", String(Math.min(fileStat.size, textPreviewMaxBytes)));

    return new Response(streamFile(fullPath, { start: 0, end }), { headers });
  }

  const range = parseRangeHeader(request.headers.get("range"), fileStat.size);

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileStat.size}`);

    return new Response(streamFile(fullPath, range), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(fileStat.size));

  return new Response(streamFile(fullPath, null), { headers });
}
