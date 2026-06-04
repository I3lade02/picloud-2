import bcrypt from "bcrypt";
import { NextResponse } from "next/server";

import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid password change request." },
      { status: 400 },
    );
  }

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, passwordHash: true },
  });

  if (!account) {
    return NextResponse.json({ message: "Account not found." }, { status: 404 });
  }

  const passwordMatches = await verifyPassword(parsed.data.currentPassword, account.passwordHash);

  if (!passwordMatches) {
    return NextResponse.json({ message: "Current password is incorrect." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await db.user.update({
    where: { id: account.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
