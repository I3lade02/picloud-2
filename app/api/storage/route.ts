import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  const [fileCount, aggregate] = await Promise.all([
    db.file.count({
      where: { userId: user.id },
    }),
    db.file.aggregate({
      where: { userId: user.id },
      _sum: { size: true },
    }),
  ]);

  const usedBytes = aggregate._sum.size ?? 0;

  return NextResponse.json({
    usedBytes,
    usedFormatted: formatBytes(usedBytes),
    fileCount,
    maxUploadSizeBytes: env.MAX_UPLOAD_SIZE_BYTES,
    maxUploadSizeFormatted: formatBytes(env.MAX_UPLOAD_SIZE_BYTES),
  });
}
