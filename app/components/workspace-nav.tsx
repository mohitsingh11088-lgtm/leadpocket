"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import SignOutButton from "./sign-out-button";

const links = [
  { label: "Dashboard", href: "/" },
  { label: "Leads", href: "/leads" },
  { label: "Contacts", href: "/contacts" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Tasks", href: "/tasks" },
  { label: "Activities", href: "/activities" },
  { label: "Integrations", href: "/integrations" },
  { label: "Settings", href: "/settings" },
];

export default function WorkspaceNav({ active }: { active: string }) {
  return (
    <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="flex shrink-0 items-center gap-2 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles size={18} />
        </span>
        <span className="font-bold text-slate-800">LeadPocket</span>
      </Link>

      <nav aria-label="Workspace" className="w-full overflow-x-auto sm:w-auto">
        <div className="flex min-w-max items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active === link.label ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active === link.label
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="flex shrink-0 justify-end">
        <SignOutButton />
      </div>
    </header>
  );
}
