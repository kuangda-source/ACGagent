"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ask", label: "Ask" },
  { href: "/recommend", label: "Recommend" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" }
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <Link href="/dashboard" className="brand">
            <span className="brand-mark">A</span>
            <span>ACGagent</span>
          </Link>
          <nav className="nav" aria-label="Primary">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn("nav-link")}
                data-active={pathname === link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell page">{children}</main>
    </>
  );
}
