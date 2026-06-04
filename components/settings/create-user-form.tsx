"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";

export function CreateUserForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        user?: { username: string };
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not create account.");
      }

      setUsername("");
      setPassword("");
      setNotice(`Created account ${payload?.user?.username ?? "user"}.`);
      window.dispatchEvent(new Event("picloud:users-changed"));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-background text-accent">
          <UserPlus className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">Create local account</h2>
          <p className="text-sm text-muted">Admin-only local user creation.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            autoComplete="off"
            placeholder="new-user"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
          Create account
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
          <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
          {notice}
        </div>
      ) : null}
    </form>
  );
}
