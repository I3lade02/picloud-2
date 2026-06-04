import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { createSessionToken, getSessionCookieOptions, sessionCookieName } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid login request." },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (!user || user.isDisabled || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id, username: user.username });
  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
    },
  });

  response.cookies.set(sessionCookieName, token, getSessionCookieOptions());

  return response;
}
