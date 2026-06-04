import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeFoldersForClient } from "@/lib/folders";
import { createFolderSchema } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const [folders, sizeGroups] = await Promise.all([
    db.folder.findMany({
      where: { userId: user.id },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            files: true,
            children: true,
          },
        },
      },
    }),
    db.file.groupBy({
      by: ["folderId"],
      where: {
        userId: user.id,
        folderId: { not: null },
      },
      _sum: { size: true },
    }),
  ]);

  return NextResponse.json({
    folders: serializeFoldersForClient(folders, sizeGroups),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createFolderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid folder name." },
      { status: 400 },
    );
  }

  const parentId = parsed.data.parentId === "root" ? null : (parsed.data.parentId ?? null);

  if (parentId) {
    const parentFolder = await db.folder.findFirst({
      where: {
        id: parentId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!parentFolder) {
      return NextResponse.json({ message: "Parent folder not found." }, { status: 404 });
    }
  }

  const existingFolder = await db.folder.findFirst({
    where: {
      userId: user.id,
      name: parsed.data.name,
      parentId,
    },
    select: { id: true },
  });

  if (existingFolder) {
    return NextResponse.json({ message: "A folder with that name already exists in this location." }, { status: 409 });
  }

  const folder = await db.folder.create({
    data: {
      name: parsed.data.name,
      userId: user.id,
      parentId,
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      folder: {
        ...folder,
        fileCount: 0,
        childCount: 0,
        size: 0,
        sizeFormatted: "0 B",
        totalFileCount: 0,
        totalSize: 0,
        totalSizeFormatted: "0 B",
        depth: 0,
        path: [{ id: folder.id, name: folder.name }],
      },
    },
    { status: 201 },
  );
}
