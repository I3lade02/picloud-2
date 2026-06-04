"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCcw, Shield, Trash2, UserCog } from "lucide-react";

type ManagedUser = {
  id: string;
  username: string;
  isAdmin: boolean;
  isCurrentUser: boolean;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  folderCount: number;
  usedFormatted: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/users");
      const payload = (await response.json().catch(() => null)) as { users?: ManagedUser[]; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not load users.");
      }

      setUsers(payload?.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers();
    }, 0);

    function onUsersChanged() {
      void loadUsers();
    }

    window.addEventListener("picloud:users-changed", onUsersChanged);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("picloud:users-changed", onUsersChanged);
    };
  }, [loadUsers]);

  async function updateUser(userId: string, body: { password?: string; isDisabled?: boolean }) {
    setError("");
    setNotice("");
    setBusyUserId(userId);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not update user.");
      }

      setNotice("User updated.");
      await loadUsers();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update user.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`Delete user "${user.username}" and their files?`)) {
      return;
    }

    setError("");
    setNotice("");
    setBusyUserId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not delete user.");
      }

      setNotice("User deleted.");
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete user.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    await updateUser(user.id, { password: resetPassword });
    setResetPassword("");
    setResetUserId(null);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-background text-accent">
            <UserCog className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold">User management</h2>
            <p className="text-sm text-muted">Reset passwords, disable accounts, and review usage.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers()}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
          title="Refresh users"
          aria-label="Refresh users"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-foreground">
          {notice}
        </div>
      ) : null}

      <div className="divide-y divide-border rounded-md border border-border">
        {users.map((user) => {
          const isBusy = busyUserId === user.id;

          return (
            <div key={user.id} className="space-y-4 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{user.username}</p>
                    {user.isAdmin ? <Shield className="size-4 text-accent" aria-label="Admin account" /> : null}
                    {user.isDisabled ? (
                      <span className="rounded-md border border-red-400/40 px-2 py-0.5 text-xs text-red-500">Disabled</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {user.fileCount} files, {user.folderCount} folders, {user.usedFormatted} - created {formatDate(user.createdAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetUserId(resetUserId === user.id ? null : user.id);
                      setResetPassword("");
                    }}
                    className="h-9 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || user.isCurrentUser}
                    onClick={() => void updateUser(user.id, { isDisabled: !user.isDisabled })}
                    className="h-9 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {user.isDisabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || user.isAdmin}
                    onClick={() => void deleteUser(user)}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                    Delete
                  </button>
                </div>
              </div>

              {resetUserId === user.id ? (
                <form
                  onSubmit={(event) => void submitPasswordReset(event, user)}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    type="password"
                    placeholder="New password"
                    className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                    autoComplete="new-password"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                    Save password
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
