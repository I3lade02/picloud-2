import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";
import { createUserSchema } from "@/lib/validation";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ message: "Only the admin account can view users." }, { status: 403 });
  }

  const [users, sizeGroups] = await Promise.all([
    db.user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        isDisabled: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            files: true,
            folders: true,
          },
        },
      },
    }),
    db.file.groupBy({
      by: ["userId"],
      _sum: { size: true },
    }),
  ]);

  const sizesByUser = new Map(sizeGroups.map((group) => [group.userId, group._sum.size ?? 0]));

  return NextResponse.json({
    users: users.map((account) => {
      const usedBytes = sizesByUser.get(account.id) ?? 0;

      return {
        id: account.id,
        username: account.username,
        isAdmin: account.username === env.DEFAULT_ADMIN_USERNAME,
        isCurrentUser: account.id === user.id,
        isDisabled: account.isDisabled,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        fileCount: account._count.files,
        folderCount: account._count.folders,
        usedBytes,
        usedFormatted: formatBytes(usedBytes),
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ message: "Only the admin account can create users." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid user." },
      { status: 400 },
    );
  }

  const existingUser = await db.user.findUnique({
    where: { username: parsed.data.username },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json({ message: "A user with that username already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const createdUser = await db.user.create({
    data: {
      username: parsed.data.username,
      passwordHash,
    },
    select: {
      id: true,
      username: true,
      isDisabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: createdUser }, { status: 201 });
}
