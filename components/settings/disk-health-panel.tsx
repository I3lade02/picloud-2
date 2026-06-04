"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Loader2, RefreshCcw } from "lucide-react";

type DiskHealth = {
  uploadDir: string;
  disk: {
    totalFormatted: string;
    freeFormatted: string;
    usedFormatted: string;
    usedPercent: number;
  };
  piCloud: {
    usedFormatted: string;
    fileCount: number;
    percentOfDisk: number;
  };
};

export function DiskHealthPanel() {
  const [diskHealth, setDiskHealth] = useState<DiskHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDiskHealth = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/system/disk");
      const payload = (await response.json().catch(() => null)) as DiskHealth | { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "message" in payload ? payload.message : "Could not load disk health.");
      }

      setDiskHealth(payload as DiskHealth);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load disk health.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDiskHealth();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadDiskHealth]);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-background text-accent">
            <HardDrive className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold">Disk health</h2>
            <p className="text-sm text-muted">Local storage space for uploads.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadDiskHealth()}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
          title="Refresh disk health"
          aria-label="Refresh disk health"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {diskHealth ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Disk total</p>
              <p className="mt-1 font-semibold">{diskHealth.disk.totalFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Disk free</p>
              <p className="mt-1 font-semibold">{diskHealth.disk.freeFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Disk used</p>
              <p className="mt-1 font-semibold">{diskHealth.disk.usedFormatted}</p>
            </div>
            <div>
              <p className="text-xs text-muted">PiCloud files</p>
              <p className="mt-1 font-semibold">{diskHealth.piCloud.usedFormatted}</p>
            </div>
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs text-muted">
              <span>Disk usage</span>
              <span>{diskHealth.disk.usedPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-background">
              <div className="h-2 rounded-full bg-accent" style={{ width: `${diskHealth.disk.usedPercent}%` }} />
            </div>
          </div>
          <p className="truncate text-xs text-muted">Upload directory: {diskHealth.uploadDir}</p>
        </div>
      ) : null}
    </section>
  );
}
