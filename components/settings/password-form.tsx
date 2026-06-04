"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not update password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not update password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-background text-accent">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">Change password</h2>
          <p className="text-sm text-muted">Use at least 12 characters.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Current password</span>
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            type="password"
            autoComplete="current-password"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">New password</span>
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            type="password"
            autoComplete="new-password"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium">Confirm password</span>
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            type="password"
            autoComplete="new-password"
          />
        </label>
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
        Update password
      </button>
    </form>
  );
}
