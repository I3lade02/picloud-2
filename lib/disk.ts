import "server-only";

import { statfs } from "node:fs/promises";

import { formatBytes } from "@/lib/format";

export type DiskStats = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  totalFormatted: string;
  freeFormatted: string;
  usedFormatted: string;
};

function toDiskStats(totalBytes: number, freeBytes: number): DiskStats {
  const safeTotal = Math.max(0, totalBytes);
  const safeFree = Math.max(0, freeBytes);
  const usedBytes = Math.max(0, safeTotal - safeFree);
  const usedPercent = safeTotal > 0 ? Math.round((usedBytes / safeTotal) * 100) : 0;

  return {
    totalBytes: safeTotal,
    freeBytes: safeFree,
    usedBytes,
    usedPercent,
    totalFormatted: formatBytes(safeTotal),
    freeFormatted: formatBytes(safeFree),
    usedFormatted: formatBytes(usedBytes),
  };
}

export async function getDiskStats(path: string) {
  const stats = await statfs(path);
  const totalBytes = stats.blocks * stats.bsize;
  const freeBytes = stats.bavail * stats.bsize;

  return toDiskStats(totalBytes, freeBytes);
}
