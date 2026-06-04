import { NextResponse } from "next/server";

import { getCurrentUser, isAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { getDiskStats } from "@/lib/disk";
import { ensureUploadDir, getUploadDir } from "@/lib/storage";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Not authenticated." }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json({ message: "Only the admin account can view disk health." }, { status: 403 });
  }

  await ensureUploadDir();

  const uploadDir = getUploadDir();
  const [disk, aggregate, fileCount] = await Promise.all([
    getDiskStats(uploadDir),
    db.file.aggregate({ _sum: { size: true } }),
    db.file.count(),
  ]);
  const piCloudUsedBytes = aggregate._sum.size ?? 0;

  return NextResponse.json({
    uploadDir,
    disk,
    piCloud: {
      usedBytes: piCloudUsedBytes,
      usedFormatted: formatBytes(piCloudUsedBytes),
      fileCount,
      percentOfDisk: disk.totalBytes > 0 ? Number(((piCloudUsedBytes / disk.totalBytes) * 100).toFixed(2)) : 0,
    },
  });
}
