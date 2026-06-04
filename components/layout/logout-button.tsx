"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
    >
      <LogOut className="size-4" aria-hidden="true" />
      Logout
    </button>
  );
}
