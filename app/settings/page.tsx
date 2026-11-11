"use client";

import { BellRing, Building2, Lock, UserCircle2 } from "lucide-react";
import WorkspaceNav from "../components/workspace-nav";

const settings = [
  {
    title: "Profile",
    description: "Update company information and your personal details",
    icon: UserCircle2,
  },
  {
    title: "Business settings",
    description: "Manage business name, timezone, and brand preferences",
    icon: Building2,
  },
  {
    title: "Notifications",
    description: "Set daily reminders and email alerts",
    icon: BellRing,
  },
  {
    title: "Security",
    description: "Password, access control, and login settings",
    icon: Lock,
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1100px] p-4 sm:p-8">
        <WorkspaceNav active="Settings" />
        <header className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            System
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {settings.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={20} />
                  </div>

                  <div>
                    <h3 className="text-lg font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
