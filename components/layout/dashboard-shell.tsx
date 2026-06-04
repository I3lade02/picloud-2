import Link from "next/link";
import { Cloud, Files, HardDrive, Settings } from "lucide-react";

import type { CurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/layout/logout-button";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: HardDrive },
  { href: "/dashboard/files", label: "Files", icon: Files },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type DashboardShellProps = {
  children: React.ReactNode;
  user: CurrentUser;
};

export function DashboardShell({ children, user }: DashboardShellProps) {
  return (
    <div className="min-h-dvh w-full bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Cloud className="size-5 text-accent" aria-hidden="true" />
            PiCloud
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] w-full md:min-h-dvh md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden h-dvh border-r border-border bg-card px-4 py-6 md:sticky md:top-0 md:block">
          <Link href="/dashboard" className="mb-8 flex items-center gap-3 font-semibold">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-background">
              <Cloud className="size-5" aria-hidden="true" />
            </span>
            PiCloud 2.0
          </Link>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted transition hover:bg-background hover:text-foreground"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted">Signed in as</p>
            <p className="mt-1 truncate text-sm font-medium">{user.username}</p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6 md:px-8 xl:px-10">
          <div className="mb-6 hidden items-center justify-end md:flex">
            <LogoutButton />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
