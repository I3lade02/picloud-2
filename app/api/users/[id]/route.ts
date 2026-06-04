import bcrypt from "bcrypt";
import { rm } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStoredFilePath, getStoredThumbnailPath } from "@/lib/storage";
import { updateUserSchema, userIdSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ message: "Not authenticated." }, { status: 401 }),
    };
  }

  if (!isAdminUser(user)) {
    return {
      user,
      response: NextResponse.json({ message: "Only the admin account can manage users." }, { status: 403 }),
    };
  }

  return { user, response: null };
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireAdmin();

  if (response) {
    return response;
  }

  const { id } = await context.params;
  const parsedId = userIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json({ message: "Invalid user id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid user update." },
      { status: 400 },
    );
  }

  const targetUser = await db.user.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      username: true,
    },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  if (targetUser.id === user.id && parsed.data.isDisabled === true) {
    return NextResponse.json({ message: "The admin account cannot disable itself." }, { status: 400 });
  }

  const data: {
    passwordHash?: string;
    isDisabled?: boolean;
  } = {};

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  if (parsed.data.isDisabled !== undefined) {
    data.isDisabled = parsed.data.isDisabled;
  }

  const updatedUser = await db.user.update({
    where: { id: targetUser.id },
    data,
    select: {
      id: true,
      username: true,
      isDisabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { user, response } = await requireAdmin();

  if (response) {
    return response;
  }

  const { id } = await context.params;
  const parsedId = userIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json({ message: "Invalid user id." }, { status: 400 });
  }

  if (parsedId.data === user.id) {
    return NextResponse.json({ message: "The admin account cannot delete itself." }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { id: parsedId.data },
    select: {
      id: true,
      username: true,
      files: {
        select: {
          storedName: true,
        },
      },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  await db.user.delete({ where: { id: targetUser.id } });
  await Promise.allSettled(
    targetUser.files.flatMap((file) => [
      rm(getStoredFilePath(file.storedName), { force: true }),
      rm(getStoredThumbnailPath(file.storedName), { force: true }),
    ]),
  );

  return NextResponse.json({ ok: true });
}
