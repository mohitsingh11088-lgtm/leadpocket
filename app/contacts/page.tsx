"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Mail,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import WorkspaceNav from "../components/workspace-nav";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadStage = Lead["stage"];

const avatarTones = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
];

const stageStyles: Record<LeadStage, string> = {
  New: "bg-blue-50 text-blue-700",
  Qualified: "bg-violet-50 text-violet-700",
  Meeting: "bg-amber-50 text-amber-700",
  Proposal: "bg-orange-50 text-orange-700",
  Won: "bg-emerald-50 text-emerald-700",
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [dataMessage, setDataMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadContacts = async () => {
      try {
        const { data, error } = await createClient()
          .from("leads")
          .select("*")
          .order("name", { ascending: true });

        if (error) {
          throw error;
        }

        if (active) {
          setContacts(data);
        }
      } catch (error) {
        if (active) {
          const reason =
            error instanceof Error ? error.message : "The database request failed.";
          setDataMessage(`Could not load contacts. ${reason}`);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadContacts();
    return () => {
      active = false;
    };
  }, []);

  const filteredContacts = contacts.filter((contact) =>
    `${contact.name} ${contact.company} ${contact.email} ${contact.phone} ${contact.source}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const companies = new Set(
    contacts.map((contact) => contact.company.trim()).filter(Boolean)
  );
  const wonCount = contacts.filter((contact) => contact.stage === "Won").length;
  const summaryCards = [
    {
      label: "Total contacts",
      value: isLoading ? "—" : contacts.length.toLocaleString(),
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Won customers",
      value: isLoading ? "—" : wonCount.toLocaleString(),
      icon: Users,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Companies",
      value: isLoading ? "—" : companies.size.toLocaleString(),
      icon: Building2,
      color: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-8">
        <WorkspaceNav active="Contacts" />
        <header className="mb-7 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Customers
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Customer database
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Contacts are managed alongside leads in your workspace.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search contacts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-40"
              />
            </label>

            <Link
              href="/leads"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              <Plus size={18} />
              Add contact
            </Link>
          </div>
        </header>

        {dataMessage && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dataMessage}
          </p>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {summaryCards.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}
                  >
                    <Icon size={18} />
                  </div>
                </div>
                <h2 className="mt-4 text-3xl font-bold">{item.value}</h2>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">All contacts</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {isLoading ? "Loading…" : `${filteredContacts.length} items`}
            </span>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-slate-500">
              Loading your contacts…
            </p>
          ) : filteredContacts.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-10 text-center">
              <p className="text-sm text-slate-600">
                {search
                  ? "No contacts match your search."
                  : "No contacts yet. Add a lead to build your contact list."}
              </p>
              {!search && (
                <Link
                  href="/leads"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  <Plus size={16} />
                  Add your first contact
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredContacts.map((contact, index) => (
                <article
                  key={contact.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarTones[index % avatarTones.length]}`}
                      >
                        {getInitials(contact.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">
                          {contact.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {contact.company || "No company"}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${stageStyles[contact.stage]}`}
                    >
                      {contact.stage}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex min-w-0 items-center gap-2">
                      <Mail size={14} className="shrink-0 text-slate-400" />
                      {contact.email ? (
                        <a
                          href={`mailto:${contact.email}`}
                          className="truncate hover:text-blue-600"
                        >
                          {contact.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">No email</span>
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <Phone size={14} className="shrink-0 text-slate-400" />
                      {contact.phone ? (
                        <a
                          href={`tel:${contact.phone}`}
                          className="truncate hover:text-blue-600"
                        >
                          {contact.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">No phone</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">
                        {contact.source || "Other"} source
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
