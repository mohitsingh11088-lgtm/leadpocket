"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Database,
  LeadSourceChannel,
} from "@/lib/supabase/database.types";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Download,
  DollarSign,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import WorkspaceNav from "../components/workspace-nav";
import {
  createWhatsAppUrl,
  DEFAULT_WHATSAPP_MESSAGE,
  personalizeWhatsAppMessage,
} from "@/lib/whatsapp";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadStage = Lead["stage"];

type LeadFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  enquiry: string;
  source: string;
  stage: LeadStage;
  amount: string;
};

const leadStages: LeadStage[] = ["New", "Qualified", "Meeting", "Proposal", "Won"];
const stages = ["All stages", ...leadStages] as const;

const tasks = [
  "Send pricing deck to Rahul",
  "Follow-up with Priya",
  "Confirm meeting with Amit",
];

const avatarTones = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
];

const stageStyles: Record<LeadStage, string> = {
  New: "bg-blue-50 text-blue-700",
  Qualified: "bg-purple-50 text-purple-700",
  Meeting: "bg-amber-50 text-amber-700",
  Proposal: "bg-orange-50 text-orange-700",
  Won: "bg-emerald-50 text-emerald-700",
};

const sourceChannelLabels: Record<LeadSourceChannel, string> = {
  manual: "Manual",
  website: "Website",
  whatsapp: "WhatsApp",
  facebook_lead_ads: "Facebook Lead Ads",
  instagram: "Instagram",
  google_forms: "Google Forms",
  email: "Email",
  phone: "Phone",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function createEmptyForm(): LeadFormValues {
  return {
    name: "",
    company: "",
    email: "",
    phone: "",
    enquiry: "",
    source: "Other",
    stage: "New",
    amount: "",
  };
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dataMessage, setDataMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeStage, setActiveStage] = useState("All stages");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormValues>(createEmptyForm);
  const [formError, setFormError] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState(DEFAULT_WHATSAPP_MESSAGE);

  useEffect(() => {
    let active = true;

    const loadLeads = async () => {
      try {
        const supabase = createClient();
        const [{ data, error }, settingsResult] = await Promise.all([
          supabase
          .from("leads")
          .select("*")
          .order("updated_at", { ascending: false }),
          supabase
            .from("whatsapp_click_to_chat_settings")
            .select("default_message")
            .maybeSingle(),
        ]);

        if (error) {
          throw error;
        }

        if (active) {
          setLeads(data);
          if (settingsResult.error) {
            setDataMessage(
              `Could not load your WhatsApp message template. Lead data is available; WhatsApp links will use the default message. ${settingsResult.error.message}`
            );
          } else if (settingsResult.data?.default_message) {
            setWhatsAppMessage(settingsResult.data.default_message);
          }
        }
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "The database request failed.";
        if (active) {
          setDataMessage(`Could not load leads. ${reason}`);
        }
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    };

    void loadLeads();
    return () => {
      active = false;
    };
  }, []);

  const openNewLeadForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
    setFormError("");
    setFormOpen(true);
  };

  const openEditLeadForm = (lead: Lead) => {
    setEditingId(lead.id);
    setForm({
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      enquiry: lead.enquiry,
      source: lead.source,
      stage: lead.stage,
      amount: String(lead.amount),
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleLeadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const amount = form.amount.trim() === "" ? 0 : Number(form.amount);

    if (!name) {
      setFormError("Please enter the lead's name.");
      return;
    }

    if (!Number.isFinite(amount) || amount < 0) {
      setFormError("Enter a valid deal value of zero or more.");
      return;
    }

    const leadInput = {
      name,
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      enquiry: form.enquiry.trim(),
      source: form.source.trim() || "Other",
      stage: form.stage,
      amount,
    };

    setIsSaving(true);
    setDataMessage("");

    try {
      const supabase = createClient();
      const result = editingId
        ? await supabase
            .from("leads")
            .update(leadInput)
            .eq("id", editingId)
            .select("*")
            .single()
        : await supabase
            .from("leads")
            .insert({ ...leadInput, source_channel: "manual" })
            .select("*")
            .single();

      if (result.error) {
        throw result.error;
      }

      setLeads((current) =>
        editingId
          ? current.map((lead) => (lead.id === editingId ? result.data : lead))
          : [result.data, ...current]
      );
      if (!editingId) {
        setActiveStage("All stages");
      }
      setFormOpen(false);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "The database request failed.";
      setDataMessage(`Could not save this lead. ${reason}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLead = async (lead: Lead) => {
    if (!window.confirm(`Delete ${lead.name} from your leads?`)) {
      return;
    }

    setDataMessage("");

    try {
      const { error } = await createClient().from("leads").delete().eq("id", lead.id);

      if (error) {
        throw error;
      }

      setLeads((current) => current.filter((item) => item.id !== lead.id));
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "The database request failed.";
      setDataMessage(`Could not delete this lead. ${reason}`);
    }
  };

  const exportLeads = () => {
    const escapeCsv = (value: string) => {
      const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return `"${safeValue.replaceAll('"', '""')}"`;
    };

    try {
      const rows = [
        [
          "Name",
          "Company",
          "Email",
          "Phone",
          "Enquiry",
          "Source",
          "Source channel",
          "Stage",
          "Deal value",
        ],
        ...filteredLeads.map((lead) => [
          lead.name,
          lead.company,
          lead.email,
          lead.phone,
          lead.enquiry,
          lead.source,
          sourceChannelLabels[lead.source_channel],
          lead.stage,
          String(lead.amount),
        ]),
      ];
      const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");

      link.href = url;
      link.download = "leadpocket-leads.csv";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "The browser could not create the file.";
      setDataMessage(`Could not export leads. ${reason}`);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      `${lead.name} ${lead.company} ${lead.email} ${lead.phone} ${lead.enquiry} ${lead.source} ${sourceChannelLabels[lead.source_channel]}`
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesStage =
      activeStage === "All stages" || lead.stage === activeStage;

    return matchesSearch && matchesStage;
  });

  const stats = [
    {
      label: "Total leads",
      value: leads.length.toLocaleString(),
      detail: "All saved leads",
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Qualified",
      value: leads.filter((lead) => lead.stage === "Qualified").length.toLocaleString(),
      detail: "Ready for the next step",
      icon: TrendingUp,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Booked meetings",
      value: leads.filter((lead) => lead.stage === "Meeting").length.toLocaleString(),
      detail: "In the meeting stage",
      icon: CalendarDays,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Won revenue",
      value: formatCurrency(
        leads
          .filter((lead) => lead.stage === "Won")
          .reduce((total, lead) => total + lead.amount, 0)
      ),
      detail: "From won leads",
      icon: DollarSign,
      color: "bg-orange-50 text-orange-600",
    },
  ];

  const pipeline = leadStages.map((stage) => ({
    label: stage,
    count: leads.filter((lead) => lead.stage === stage).length,
  }));
  const largestPipelineStage = Math.max(...pipeline.map((item) => item.count), 1);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1500px] p-4 sm:p-8">
        <WorkspaceNav active="Leads" />
        <header className="mb-7 flex flex-col gap-4 border-b border-slate-200 bg-white/70 px-4 py-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Workspace / Leads
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Lead pipeline
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 sm:w-auto">
              <Search size={16} />
              <input
                aria-label="Search leads"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:w-36"
              />
            </div>

            <button
              aria-label="Notifications"
              className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 transition hover:bg-slate-50"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
            </button>

            <button
              onClick={openNewLeadForm}
              disabled={!isLoaded}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={18} />
              Add lead
            </button>
          </div>
        </header>

        {dataMessage && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {dataMessage}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                    <Icon size={18} />
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <h3 className="text-3xl font-bold tracking-tight">{item.value}</h3>
                </div>

                <p className="mt-2 text-xs text-slate-400">{item.detail}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[1.9fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Lead list</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {filteredLeads.length} records this week
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportLeads}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  <Download size={15} />
                  Export
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {stages.map((stage) => (
                <button
                  key={stage}
                  onClick={() => setActiveStage(stage)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    activeStage === stage
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Lead</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Stage</th>
                      <th className="px-4 py-3 font-medium">Value</th>
                      <th className="px-4 py-3 font-medium">Last updated</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.map((lead, index) => {
                      const whatsappUrl = createWhatsAppUrl(
                        lead.phone,
                        personalizeWhatsAppMessage(whatsAppMessage, {
                          name: lead.name,
                          company: lead.company,
                        })
                      );

                      return (
                      <tr key={lead.id} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${avatarTones[index % avatarTones.length]}`}>
                              {getInitials(lead.name)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800">{lead.name}</p>
                              <p className="text-xs text-slate-400">{lead.company || "No company"}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 text-slate-600">
                          <span className="block">{lead.source}</span>
                          <span className="text-xs text-slate-400">
                            {sourceChannelLabels[lead.source_channel]}
                          </span>
                          {lead.enquiry && (
                            <span
                              className="mt-1 block max-w-xs truncate text-xs text-slate-400"
                              title={lead.enquiry}
                            >
                              {lead.enquiry}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${stageStyles[lead.stage]}`}>
                            {lead.stage}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-semibold text-slate-800">{formatCurrency(lead.amount)}</td>

                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-700">{formatDate(lead.updated_at)}</p>
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            {whatsappUrl && (
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Message ${lead.name} on WhatsApp`}
                                  title={`Message ${lead.name} on WhatsApp`}
                                  className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-700 transition hover:bg-emerald-50"
                                >
                                  <MessageCircle size={15} />
                                </a>
                            )}
                            <button
                              onClick={() => openEditLeadForm(lead)}
                              aria-label={`Edit ${lead.name}`}
                              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-100"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => deleteLead(lead)}
                              aria-label={`Delete ${lead.name}`}
                              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                          {leads.length === 0
                            ? "No leads yet. Add your first lead to get started."
                            : "No leads match your search and stage filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-bold">Pipeline overview</h3>
                <span className="text-xs text-slate-400">{leads.length} total</span>
              </div>

              <div className="space-y-4">
                {pipeline.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm text-slate-600">
                      <span>{item.label}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full bg-blue-600 transition-all"
                        style={{
                          width: `${(item.count / largestPipelineStage) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Today&apos;s focus</h3>
                <button className="rounded-lg bg-blue-50 p-2 text-blue-600 hover:bg-blue-100">
                  <ArrowUpRight size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 size={12} />
                    </span>
                    <p className="text-sm text-slate-700">{task}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold">Quick contact</h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: "rahul@techvision.in", icon: Mail },
                  { label: "+91 98765 43210", icon: Phone },
                ].map((contact) => {
                  const Icon = contact.icon;

                  return (
                    <div
                      key={contact.label}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500">
                        <Icon size={16} />
                      </span>
                      {contact.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>

        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
            <button
              aria-label="Close lead form"
              onClick={() => setFormOpen(false)}
              className="fixed inset-0 cursor-default bg-slate-950/50"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-form-title"
              className="relative z-10 my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 id="lead-form-title" className="text-xl font-bold">
                    {editingId ? "Edit lead" : "Add a new lead"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Keep the important customer details together.
                  </p>
                </div>
                <button
                  onClick={() => setFormOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleLeadSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Name *
                    <input
                      required
                      autoFocus
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Company
                    <input
                      value={form.company}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, company: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Phone
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Enquiry / message
                    <textarea
                      rows={3}
                      maxLength={4000}
                      value={form.enquiry}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          enquiry: event.target.value,
                        }))
                      }
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Source
                    <input
                      value={form.source}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, source: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="text-sm font-medium text-slate-700">
                    Stage
                    <select
                      value={form.stage}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          stage:
                            leadStages.find((stage) => stage === event.target.value) ??
                            "New",
                        }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      {leadStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Deal value (USD)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, amount: event.target.value }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>

                {formError && (
                  <p role="alert" className="text-sm text-red-600">
                    {formError}
                  </p>
                )}

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isLoaded || isSaving}
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving
                      ? "Saving..."
                      : editingId
                        ? "Save changes"
                        : "Add lead"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
