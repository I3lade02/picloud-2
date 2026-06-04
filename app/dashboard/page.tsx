import Link from "next/link";
import { Files, HardDrive, Upload } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const [fileCount, aggregate] = await Promise.all([
    db.file.count({ where: { userId: user.id } }),
    db.file.aggregate({
      where: { userId: user.id },
      _sum: { size: true },
    }),
  ]);
  const usedBytes = aggregate._sum.size ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Personal server dashboard</p>
        <h1 className="mt-1 text-2xl font-semibold">Overview</h1>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <HardDrive className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Storage used</p>
          <p className="mt-2 text-2xl font-semibold">{formatBytes(usedBytes)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Files className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Files</p>
          <p className="mt-2 text-2xl font-semibold">{fileCount}</p>
        </div>
        <Link
          href="/dashboard/files"
          className="rounded-lg border border-dashed border-border bg-card p-5 transition hover:border-accent"
        >
          <Upload className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Next step</p>
          <p className="mt-2 font-semibold">Add file upload</p>
        </Link>
      </section>
    </div>
  );
}
