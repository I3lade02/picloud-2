import { KeyRound, Server } from "lucide-react";

import { CreateUserForm } from "@/components/settings/create-user-form";
import { DiskHealthPanel } from "@/components/settings/disk-health-panel";
import { PasswordForm } from "@/components/settings/password-form";
import { UserManagementPanel } from "@/components/settings/user-management-panel";
import { isAdminUser, requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatBytes } from "@/lib/format";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Local server configuration</p>
        <h1 className="mt-1 text-2xl font-semibold">Settings</h1>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <KeyRound className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Account</p>
          <p className="mt-2 font-semibold">{user.username}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Server className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Max upload size</p>
          <p className="mt-2 font-semibold">{formatBytes(env.MAX_UPLOAD_SIZE_BYTES)}</p>
        </div>
      </section>

      <PasswordForm />

      {isAdminUser(user) ? (
        <>
          <DiskHealthPanel />
          <CreateUserForm />
          <UserManagementPanel />
        </>
      ) : null}
    </div>
  );
}
