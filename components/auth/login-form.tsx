"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cloud, Loader2, LogIn } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;

    if (!response.ok) {
      setError(payload?.message ?? "Could not log in.");
      setIsSubmitting(false);
      return;
    }

    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <div className="mb-8 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-background">
          <Cloud className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">PiCloud 2.0</h1>
          <p className="text-sm text-muted">Sign in to your personal cloud.</p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            autoComplete="username"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            type="password"
            autoComplete="current-password"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogIn className="size-4" aria-hidden="true" />
        )}
        Sign in
      </button>
    </form>
  );
}
