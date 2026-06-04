import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { folderIdSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = folderIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json({ message: "Invalid folder id." }, { status: 400 });
  }

  const folder = await db.folder.findFirst({
    where: {
      id: parsedId.data,
      userId: user.id,
    },
    select: {
      id: true,
      _count: {
        select: {
          files: true,
          children: true,
        },
      },
    },
  });

  if (!folder) {
    return NextResponse.json({ message: "Folder not found." }, { status: 404 });
  }

  if (folder._count.files > 0 || folder._count.children > 0) {
    return NextResponse.json({ message: "Only folders without files or subfolders can be deleted." }, { status: 400 });
  }

  await db.folder.delete({ where: { id: folder.id } });

  return NextResponse.json({ ok: true });
}
