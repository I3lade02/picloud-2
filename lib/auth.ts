import "server-only";

import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sessionCookieName, verifySessionToken } from "@/lib/session";

export type CurrentUser = {
  id: string;
  username: string;
  isDisabled: boolean;
  createdAt: Date;
};

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return null;
  }

  return db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      isDisabled: true,
      createdAt: true,
    },
  }).then((user) => (user?.isDisabled ? null : user));
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export function isAdminUser(user: Pick<CurrentUser, "username">) {
  return user.username === env.DEFAULT_ADMIN_USERNAME;
}
