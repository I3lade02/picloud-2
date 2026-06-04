import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
    },
  });
}
