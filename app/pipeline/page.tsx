"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, DollarSign, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import WorkspaceNav from "../components/workspace-nav";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadStage = Lead["stage"];

const stages: LeadStage[] = ["New", "Qualified", "Meeting", "Proposal", "Won"];

const stageStyles: Record<LeadStage, { bar: string; badge: string }> = {
  New: { bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700" },
  Qualified: { bar: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  Meeting: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  Proposal: { bar: "bg-orange-500", badge: "bg-orange-50 text-orange-700" },
  Won: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState("");

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
          const reason =
            error instanceof Error ? error.message : "The database request failed.";
          setDataMessage(`Could not load the sales pipeline. ${reason}`);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadLeads();
    return () => {
      active = false;
    };
  }, []);

  const updateLeadStage = async (lead: Lead, stage: LeadStage) => {
    if (lead.stage === stage) {
      return;
    }

    setSavingLeadId(lead.id);
    setDataMessage("");

    try {
      const { data, error } = await createClient()
        .from("leads")
        .update({ stage })
        .eq("id", lead.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setLeads((currentLeads) =>
        currentLeads.map((currentLead) =>
          currentLead.id === data.id ? data : currentLead
        )
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "The database request failed.";
      setDataMessage(`Could not update ${lead.name}'s stage. ${reason}`);
    } finally {
      setSavingLeadId(null);
    }
  };

  const stageCounts = stages.map((stage) => ({
    stage,
    count: leads.filter((lead) => lead.stage === stage).length,
  }));
  const highestStageCount = Math.max(1, ...stageCounts.map(({ count }) => count));
  const openLeads = leads.filter((lead) => lead.stage !== "Won");
  const wonLeads = leads.filter((lead) => lead.stage === "Won");
  const pipelineValue = openLeads.reduce((total, lead) => total + lead.amount, 0);
  const wonValue = wonLeads.reduce((total, lead) => total + lead.amount, 0);
  const averageDealSize = leads.length
    ? leads.reduce((total, lead) => total + lead.amount, 0) / leads.length
    : 0;
  const winRate = leads.length ? Math.round((wonLeads.length / leads.length) * 100) : 0;
  const topOpportunities = [...openLeads]
    .sort((first, second) => second.amount - first.amount)
    .slice(0, 5);

  const summaryCards = [
    {
      label: "Open pipeline value",
      value: formatCurrency(pipelineValue),
      icon: DollarSign,
      iconStyle: "bg-blue-50 text-blue-600",
    },
    {
      label: "Won revenue",
      value: formatCurrency(wonValue),
      icon: CheckCircle2,
      iconStyle: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Average deal size",
      value: formatCurrency(averageDealSize),
      icon: BriefcaseBusiness,
      iconStyle: "bg-violet-50 text-violet-600",
    },
    {
      label: "Win rate",
      value: `${winRate}%`,
      icon: Users,
      iconStyle: "bg-orange-50 text-orange-600",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-8">
        <WorkspaceNav active="Pipeline" />

        <header className="mb-7 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Sales
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Visual sales pipeline
            </h1>
          </div>
          <Link
            href="/leads"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Manage leads <ArrowRight size={16} />
          </Link>
        </header>

        {dataMessage && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dataMessage}
          </p>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconStyle}`}
                  >
                    <Icon size={18} />
                  </span>
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  {isLoading ? "—" : card.value}
                </h2>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold">Sales funnel</h2>
              <p className="mt-1 text-sm text-slate-500">
                Leads grouped by their current stage
              </p>
            </div>

            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Loading your pipeline…
              </p>
            ) : leads.length === 0 ? (
              <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm text-slate-600">Your pipeline is empty.</p>
                <Link
                  href="/leads"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  Add your first lead <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {stageCounts.map(({ stage, count }) => (
                  <div key={stage}>
                    <div className="mb-1.5 flex items-center justify-between text-sm text-slate-600">
                      <span>{stage}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`${stage} leads`}
                      aria-valuemin={0}
                      aria-valuemax={highestStageCount}
                      aria-valuenow={count}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${stageStyles[stage].bar}`}
                        style={{
                          width: `${(count / highestStageCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold">Top opportunities</h2>
              <p className="mt-1 text-sm text-slate-500">
                Open leads with the highest deal value
              </p>
            </div>

            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Loading opportunities…
              </p>
            ) : topOpportunities.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No open opportunities yet.
              </p>
            ) : (
              <div className="space-y-3">
                {topOpportunities.map((lead) => (
                  <article key={lead.id} className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">
                          {lead.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {lead.company || lead.email || "No company or email"}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-slate-800">
                        {formatCurrency(lead.amount)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${stageStyles[lead.stage].badge}`}
                      >
                        {lead.stage}
                      </span>
                      <label className="sr-only" htmlFor={`stage-${lead.id}`}>
                        Update stage for {lead.name}
                      </label>
                      <select
                        id={`stage-${lead.id}`}
                        value={lead.stage}
                        disabled={savingLeadId === lead.id}
                        onChange={(event) => {
                          const selectedStage = stages.find(
                            (stage) => stage === event.currentTarget.value
                          );

                          if (selectedStage) {
                            void updateLeadStage(lead, selectedStage);
                          }
                        }}
                        className="max-w-[150px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 disabled:cursor-wait disabled:opacity-60"
                      >
                        {stages.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
