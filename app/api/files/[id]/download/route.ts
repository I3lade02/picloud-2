import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStoredFilePath } from "@/lib/storage";
import { fileIdSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getContentDisposition(fileName: string) {
  const asciiFallback = fileName
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/[\\"]/g, "_")
    .slice(0, 180);
  const fallback = asciiFallback || "download";

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
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
      originalName: true,
      storedName: true,
      mimeType: true,
      size: true,
    },
  });

  if (!file) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const fullPath = getStoredFilePath(file.storedName);
  const fileStat = await stat(fullPath).catch(() => null);

  if (!fileStat?.isFile()) {
    return NextResponse.json({ message: "Stored file is missing." }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>;

  return new Response(stream, {
    headers: {
      "Content-Disposition": getContentDisposition(file.originalName),
      "Content-Length": String(fileStat.size || file.size),
      "Content-Type": file.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
