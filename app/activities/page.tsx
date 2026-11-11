"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  MessageSquareText,
  PhoneCall,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import WorkspaceNav from "../components/workspace-nav";

type Activity = Database["public"]["Tables"]["activities"]["Row"];

const activityPresentation: Record<
  Activity["activity_type"],
  { label: string; icon: typeof PhoneCall; color: string }
> = {
  call: {
    label: "Call",
    icon: PhoneCall,
    color: "bg-blue-50 text-blue-600",
  },
  meeting: {
    label: "Meeting",
    icon: Video,
    color: "bg-violet-50 text-violet-600",
  },
  note: {
    label: "Note",
    icon: MessageSquareText,
    color: "bg-emerald-50 text-emerald-600",
  },
  reminder: {
    label: "Reminder",
    icon: CalendarDays,
    color: "bg-orange-50 text-orange-600",
  },
  whatsapp_message: {
    label: "WhatsApp",
    icon: MessageSquareText,
    color: "bg-emerald-50 text-emerald-600",
  },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leadNames, setLeadNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .order("occurred_at", { ascending: false })
          .limit(100);
        if (error) {
          throw error;
        }
        if (!active) {
          return;
        }
        setActivities(data);

        const leadIds = Array.from(new Set(data.map((activity) => activity.lead_id)));
        if (leadIds.length === 0) {
          setLeadNames({});
          return;
        }
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("id, name")
          .in("id", leadIds);
        if (leadsError) {
          throw leadsError;
        }
        if (active) {
          setLeadNames(
            Object.fromEntries(leads.map((lead) => [lead.id, lead.name]))
          );
        }
      } catch (error) {
        if (active) {
          setErrorMessage(`Could not load Activities. ${getErrorMessage(error)}`);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadActivities();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1200px] p-4 sm:p-8">
        <WorkspaceNav active="Activities" />
        <header className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Records
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Activities</h1>
          <p className="mt-2 text-sm text-slate-500">
            Conversations and other activity linked to your leads.
          </p>
        </header>

        {errorMessage && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading Activities…
          </p>
        ) : activities.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <MessageSquareText className="mx-auto text-slate-400" size={24} />
            <p className="mt-3 text-sm font-medium text-slate-700">
              No Activities yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Incoming WhatsApp messages will appear here with their lead.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activities.map((activity) => {
              const presentation = activityPresentation[activity.activity_type];
              const Icon = presentation.icon;
              const occurredAt = new Date(activity.occurred_at);
              return (
                <article
                  key={activity.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${presentation.color}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          {presentation.label}
                        </p>
                        <h2 className="mt-1 truncate text-lg font-bold text-slate-800">
                          {activity.title}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {leadNames[activity.lead_id] || "Lead"}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                          {activity.details}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                      <Clock3 size={12} />
                      <time dateTime={activity.occurred_at}>
                        {Number.isNaN(occurredAt.getTime())
                          ? "Unknown time"
                          : occurredAt.toLocaleString()}
                      </time>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
