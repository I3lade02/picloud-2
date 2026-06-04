import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeFileForClient } from "@/lib/files";
import { fileListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = fileListQuerySchema.parse({
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    folderId: url.searchParams.get("folderId") ?? undefined,
  });

  if (query.folderId && query.folderId !== "root") {
    const folder = await db.folder.findFirst({
      where: {
        id: query.folderId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!folder) {
      return NextResponse.json({ message: "Folder not found." }, { status: 404 });
    }
  }

  const files = await db.file.findMany({
    where: {
      userId: user.id,
      ...(query.folderId
        ? {
            folderId: query.folderId === "root" ? null : query.folderId,
          }
        : {}),
      ...(query.q
        ? {
            originalName: {
              contains: query.q,
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
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

  const serializedFiles = files
    .map(serializeFileForClient)
    .filter((file) => (query.type ? file.category === query.type : true));

  return NextResponse.json({ files: serializedFiles });
}
