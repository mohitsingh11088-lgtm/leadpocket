"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  Database,
  LeadSourceChannel,
} from "@/lib/supabase/database.types";
import SignOutButton from "./components/sign-out-button";
import {
  LayoutDashboard,
  Users,
  Contact,
  KanbanSquare,
  CheckSquare,
  Activity,
  Settings,
  Search,
  Bell,
  Plus,
  TrendingUp,
  ArrowUpRight,
  CalendarDays,
  Menu,
  X,
  Sparkles,
  Webhook,
} from "lucide-react";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: Users, count: "24" },
  { name: "Contacts", href: "/contacts", icon: Contact },
  { name: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { name: "Tasks", href: "/tasks", icon: CheckSquare, count: "5" },
  { name: "Activities", href: "/activities", icon: Activity },
  { name: "Integrations", href: "/integrations", icon: Webhook },
];

const activities = [
  {
    title: "Follow-up with Rahul Sharma",
    detail: "Discuss pricing and requirements",
    time: "10:30 AM"
  },
  {
    title: "Meeting with Priya Mehta",
    detail: "Product demonstration",
    time: "12:00 PM"
  },
  {
    title: "New lead assigned",
    detail: "Amit Verma · CloudWorks",
    time: "Yesterday"
  },
];

const statusStyles: Record<string, string> = {
  New: "bg-blue-50 text-blue-700",
  Qualified: "bg-purple-50 text-purple-700",
  Meeting: "bg-amber-50 text-amber-700",
  Proposal: "bg-orange-50 text-orange-700",
  Won: "bg-emerald-50 text-emerald-700",
};

const avatarTones = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
];

const sourceChannels: {
  channel: LeadSourceChannel;
  label: string;
  color: string;
  hex: string;
}[] = [
  { channel: "website", label: "Website", color: "bg-blue-600", hex: "#2563eb" },
  { channel: "whatsapp", label: "WhatsApp", color: "bg-emerald-500", hex: "#10b981" },
  { channel: "facebook_lead_ads", label: "Facebook Lead Ads", color: "bg-indigo-500", hex: "#6366f1" },
  { channel: "instagram", label: "Instagram", color: "bg-pink-500", hex: "#ec4899" },
  { channel: "google_forms", label: "Google Forms", color: "bg-amber-500", hex: "#f59e0b" },
  { channel: "email", label: "Email", color: "bg-violet-500", hex: "#8b5cf6" },
  { channel: "phone", label: "Phone", color: "bg-orange-500", hex: "#f97316" },
  { channel: "manual", label: "Manual / other", color: "bg-slate-400", hex: "#94a3b8" },
];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Home() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dataMessage, setDataMessage] = useState("");
  const [active, setActive] = useState("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    const loadLeads = async () => {
      try {
        const { data, error } = await createClient()
          .from("leads")
          .select("*")
          .order("updated_at", { ascending: false });

        if (error) {
          throw error;
        }

        if (active) {
          setLeads(data);
        }
      } catch (error) {
        if (active) {
          setDataMessage(
            `Could not load dashboard leads. ${
              error instanceof Error ? error.message : "The database request failed."
            }`
          );
        }
      }
    };

    void loadLeads();
    return () => {
      active = false;
    };
  }, []);

  const filteredLeads = leads.filter((lead) =>
    `${lead.name} ${lead.company} ${lead.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const wonLeads = leads.filter((lead) => lead.stage === "Won");
  const openLeads = leads.filter((lead) => lead.stage !== "Won");
  const dashboardStats = [
    {
      label: "Total Leads",
      value: leads.length.toLocaleString(),
      detail: "Across all stages",
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Conversions",
      value: wonLeads.length.toLocaleString(),
      detail: "Won leads",
      icon: CheckSquare,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Won revenue",
      value: formatCurrency(wonLeads.reduce((total, lead) => total + lead.amount, 0)),
      detail: "From converted leads",
      icon: TrendingUp,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Open pipeline",
      value: formatCurrency(openLeads.reduce((total, lead) => total + lead.amount, 0)),
      detail: "Potential revenue",
      icon: Activity,
      color: "bg-orange-50 text-orange-600",
    },
  ];
  const sourceBreakdown = sourceChannels.map((source) => ({
    ...source,
    count: leads.filter((lead) => lead.source_channel === source.channel).length,
  }));
  let sourcePercentage = 0;
  const sourceChartBackground = leads.length
    ? `conic-gradient(${sourceBreakdown
        .filter((source) => source.count > 0)
        .map((source) => {
          const start = sourcePercentage;
          sourcePercentage += (source.count / leads.length) * 100;
          return `${source.hex} ${start}% ${sourcePercentage}%`;
        })
        .join(", ")})`
    : "conic-gradient(#e2e8f0 0% 100%)";

  const renderSidebar = () => (
    <aside className="flex h-full flex-col bg-[#111827] text-white">

      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
          <Sparkles size={21} />
        </div>

        <div>
          <h1 className="text-xl font-bold">LeadPocket</h1>
          <p className="text-[10px] tracking-[2px] text-slate-400">
            GROW YOUR BUSINESS
          </p>
        </div>
      </div>

      <div className="px-4 pt-8">
        <p className="mb-3 px-3 text-[10px] font-bold tracking-[2px] text-slate-500">
          WORKSPACE
        </p>

        <nav className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = active === item.name;

            return (
              <button
                key={item.name}
                onClick={() => {
                  setActive(item.name);
                  setMobileOpen(false);
                  router.push(item.href);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm transition ${
                  selected
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={18} />
                  {item.name}
                </span>

                {"count" in item && (
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs">
                    {item.name === "Leads" ? leads.length : item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4">

        <button
          onClick={() => {
            setActive("Settings");
            router.push("/settings");
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
        >
          <Settings size={18} />
          Settings
        </button>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-blue-400" />
            Free workspace
          </div>

          <p className="mb-3 text-xs leading-5 text-slate-400">
            You&apos;re all set to organize your business leads.
          </p>

          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 w-1/4 rounded-full bg-blue-500" />
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            Getting started
          </p>
        </div>

      </div>
    </aside>
  );
   return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">

      <div className="flex min-h-screen">

        <div className="hidden w-[250px] shrink-0 lg:block">
          <div className="sticky top-0 h-screen">
            {renderSidebar()}
          </div>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">

            <button
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />

            <div className="relative h-full w-[270px]">

              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-5 z-10 text-white"
              >
                <X size={22} />
              </button>

              {renderSidebar()}

            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">

          <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:px-8">

            <div className="flex items-center gap-3">

              <button
                className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>

              <div>
                <p className="text-xs text-slate-400">
                  Workspace / {active}
                </p>

                <h2 className="text-lg font-bold">{active}</h2>
              </div>

            </div>

            <div className="flex items-center gap-3 sm:gap-5">

              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">

                <Search size={16} className="text-slate-400" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads..."
                  className="w-32 bg-transparent text-sm outline-none"
                />

              </div>

              <button
                aria-label="Notifications"
                className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <Bell size={19} />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
              </button>

              <div className="flex items-center gap-2 border-l border-slate-200 pl-3 sm:pl-5">

                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  MS
                </div>

                <div className="hidden sm:block">
                  <p className="text-sm font-semibold">My Workspace</p>
                  <p className="text-[11px] text-slate-400">Administrator</p>
                </div>

                <SignOutButton />

              </div>

            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-7 p-4 sm:p-8">

            <div className="flex flex-wrap items-center justify-between gap-4">

              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Good morning! 👋
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Here&apos;s what&apos;s happening with your business today.
                </p>
              </div>

              <button
                onClick={() => router.push("/leads")}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                <Plus size={18} />
                Add new lead
              </button>

            </div>

            {dataMessage && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {dataMessage}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

              {dashboardStats.map((stat) => {

                const Icon = stat.icon;

                return (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-500">
                        {stat.label}
                      </p>

                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color}`}>
                        <Icon size={19} />
                      </div>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-2">
                      <h3 className="text-3xl font-bold tracking-tight">
                        {stat.value}
                      </h3>
                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                      {stat.detail}
                    </p>

                  </div>
                );
              })}

            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm xl:col-span-2 sm:p-6">

                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">

                  <div>
                    <h3 className="font-bold">Lead Overview</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Your lead generation performance
                    </p>
                  </div>

                  <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none">
                    <option>Last 7 days</option>
                    <option>Last 30 days</option>
                    <option>Last 90 days</option>
                  </select>

                </div>

                <div className="flex h-[210px] items-end justify-between gap-2 border-b border-slate-100 pb-2">

                  {[38, 55, 43, 72, 57, 88, 68, 95, 64, 78, 55, 86].map((height, i) => (
                    <div
                      key={i}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                    >

                      <div
                        className="relative w-full max-w-8 rounded-t-lg bg-blue-100 transition hover:bg-blue-200"
                        style={{ height: `${height}%` }}
                      >
                        <div
                          className="absolute bottom-0 w-full rounded-t-lg bg-blue-600 group-hover:bg-purple-600"
                          style={{ height: "68%" }}
                        />
                      </div>

                    </div>
                  ))}

                </div>

                <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="mt-5 flex gap-5 text-xs text-slate-500">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                    New leads
                  </span>

                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-100" />
                    Previous period
                  </span>
                </div>

              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-5">
                  <h3 className="font-bold">Lead Sources</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Where leads come from
                  </p>
                </div>

                <div className="flex justify-center py-3">

                  <div
                    className="relative flex h-40 w-40 items-center justify-center rounded-full"
                    style={{
                      background: sourceChartBackground
                    }}
                  >

                    <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white">
                      <span className="text-2xl font-bold">{leads.length.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400">Total leads</span>
                    </div>

                  </div>

                </div>

                <div className="mt-4 space-y-3">

                  {sourceBreakdown.filter((source) => source.count > 0).map((source) => (

                    <div key={source.channel} className="flex items-center justify-between text-xs">

                      <span className="flex items-center gap-2 text-slate-500">
                        <span className={`h-2.5 w-2.5 rounded-full ${source.color}`} />
                        {source.label}
                      </span>

                      <span className="font-semibold text-slate-700">
                        {`${Math.round((source.count / leads.length) * 100)}%`}
                      </span>

                    </div>

                  ))}

                </div>

              </section>

            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:col-span-2">

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">

                  <div>
                    <h3 className="font-bold">Recent Leads</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Keep track of your latest prospects
                    </p>
                  </div>

                  <button
                    onClick={() => setActive("Leads")}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600"
                  >
                    View all <ArrowUpRight size={14} />
                  </button>

                </div>

                <div className="overflow-x-auto">

                  <table className="w-full min-w-[650px] text-left">

                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="px-6 py-4 font-semibold">Contact</th>
                        <th className="px-4 py-4 font-semibold">Company</th>
                        <th className="px-4 py-4 font-semibold">Status</th>
                        <th className="px-4 py-4 font-semibold">Source</th>
                        <th className="px-4 py-4 font-semibold">Added</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">

                      {filteredLeads.map((lead, index) => (

                        <tr key={lead.id} className="transition hover:bg-slate-50/80">

                          <td className="px-6 py-4">

                            <div className="flex items-center gap-3">

                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTones[index % avatarTones.length]}`}>
                                {getInitials(lead.name)}
                              </div>

                              <div>
                                <p className="text-sm font-semibold">{lead.name}</p>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  {lead.email}
                                </p>
                              </div>

                            </div>

                          </td>

                          <td className="px-4 py-4 text-xs text-slate-600">
                            {lead.company || "—"}
                          </td>

                          <td className="px-4 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles[lead.stage]}`}>
                              {lead.stage}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-xs text-slate-500">
                            {lead.source}
                          </td>

                          <td className="px-4 py-4 text-xs text-slate-400">
                            {formatDate(lead.created_at)}
                          </td>

                        </tr>

                      ))}

                      {filteredLeads.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                            {search
                              ? "No matching leads found."
                              : "No leads yet. Add your first lead to get started."}
                          </td>
                        </tr>
                      )}

                    </tbody>

                  </table>

                </div>

              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-6 flex items-center justify-between">

                  <div>
                    <h3 className="font-bold">Upcoming Activities</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Your schedule at a glance
                    </p>
                  </div>

                  <CalendarDays size={18} className="text-slate-400" />

                </div>

                <div className="space-y-5">

                  {activities.map((activity, index) => (

                    <div key={activity.title} className="flex gap-3">

                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        index === 0
                          ? "bg-blue-50 text-blue-600"
                          : index === 1
                          ? "bg-purple-50 text-purple-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}>
                        {index === 0
                          ? <Contact size={17} />
                          : index === 1
                          ? <CalendarDays size={17} />
                          : <Users size={17} />
                        }
                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="text-xs font-semibold leading-5">
                          {activity.title}
                        </p>

                        <p className="mt-1 text-[11px] text-slate-400">
                          {activity.detail}
                        </p>

                        <p className="mt-2 text-[10px] font-semibold text-blue-600">
                          {activity.time}
                        </p>

                      </div>

                    </div>

                  ))}

                </div>

                <button
                  onClick={() => setActive("Tasks")}
                  className="mt-6 w-full rounded-xl border border-slate-200 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  View all activities
                </button>

              </section>

            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-5 text-[11px] text-slate-400">
              <p>© 2026 LeadPocket. All rights reserved.</p>
              <p>Made for growing businesses ✨</p>
            </footer>

          </div>

        </main>

      </div>

    </div>
  );
}