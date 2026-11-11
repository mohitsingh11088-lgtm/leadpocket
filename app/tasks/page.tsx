"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Plus, Search, Sparkles, TimerReset } from "lucide-react";
import WorkspaceNav from "../components/workspace-nav";

const initialTasks = [
  { title: "Follow up with Rahul", due: "Today", done: false, priority: "High" },
  { title: "Send pricing deck to Priya", due: "Tomorrow", done: false, priority: "Medium" },
  { title: "Confirm meeting with Amit", due: "Today", done: true, priority: "High" },
  { title: "Update CRM notes for Sneha", due: "This week", done: false, priority: "Low" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");

  const filteredTasks = tasks.filter((task) =>
    task.title.toLowerCase().includes(search.toLowerCase())
  );

  const toggleTask = (index: number) => {
    setTasks((current) =>
      current.map((task, i) =>
        i === index ? { ...task, done: !task.done } : task
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1200px] p-4 sm:p-8">
        <WorkspaceNav active="Tasks" />
        <header className="mb-7 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Workflow
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Tasks & follow-ups</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <button className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
              <Plus size={18} />
              New task
            </button>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "Open tasks", value: tasks.filter((task) => !task.done).length, icon: TimerReset, color: "bg-blue-50 text-blue-600" },
            { label: "Done today", value: tasks.filter((task) => task.done).length, icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
            { label: "Priority", value: "High", icon: Sparkles, color: "bg-violet-50 text-violet-600" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <h3 className="mt-4 text-3xl font-bold">{item.value}</h3>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-5 text-xl font-bold">Follow-up checklist</h2>

          <div className="space-y-3">
            {filteredTasks.map((task, index) => (
              <div
                key={`${task.title}-${index}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleTask(index)} aria-label={`Toggle ${task.title}`}>
                    {task.done ? (
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    ) : (
                      <Circle size={22} className="text-slate-400" />
                    )}
                  </button>

                  <div>
                    <p className={`font-medium ${task.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500">Due: {task.due}</p>
                  </div>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    task.priority === "High"
                      ? "bg-red-50 text-red-600"
                      : task.priority === "Medium"
                        ? "bg-yellow-50 text-yellow-600"
                        : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
