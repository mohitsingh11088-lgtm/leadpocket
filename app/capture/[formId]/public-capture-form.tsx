"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WebsiteFormField } from "@/lib/supabase/database.types";

type PublicForm = {
  publicId: string;
  title: string;
  fields: WebsiteFormField[];
};

function isPublicForm(value: unknown): value is PublicForm {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const form = value as Record<string, unknown>;
  return (
    typeof form.publicId === "string" &&
    typeof form.title === "string" &&
    Array.isArray(form.fields) &&
    form.fields.every(
      (field) =>
        typeof field === "object" &&
        field !== null &&
        "key" in field &&
        ["name", "email", "phone", "company", "enquiry"].includes(String(field.key)) &&
        "label" in field &&
        typeof field.label === "string" &&
        "required" in field &&
        typeof field.required === "boolean"
    )
  );
}

export default function PublicCaptureForm({ publicId }: { publicId: string }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const eventId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadForm = async () => {
      try {
        const { data, error } = await createClient().functions.invoke("capture-lead", {
          body: { action: "get-form", publicId },
        });

        if (error) {
          throw error;
        }

        const publicForm: unknown = data?.form;
        if (!isPublicForm(publicForm)) {
          throw new Error("This enquiry form is unavailable.");
        }

        if (active) {
          setForm(publicForm);
          setValues(
            Object.fromEntries(
              publicForm.fields.map((field: WebsiteFormField) => [field.key, ""])
            )
          );
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "This enquiry form could not be loaded."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadForm();
    return () => {
      active = false;
    };
  }, [publicId]);

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      eventId.current ??= crypto.randomUUID();
      const { data, error } = await createClient().functions.invoke("capture-lead", {
        body: {
          action: "submit",
          publicId: form.publicId,
          eventId: eventId.current,
          data: values,
          honeypot: new FormData(event.currentTarget).get("website"),
        },
      });

      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }

      const response = data as { ok?: boolean; error?: string } | null;
      if (!response?.ok) {
        throw new Error(response?.error || "Your message could not be submitted.");
      }
      setIsSubmitted(true);
      eventId.current = null;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Your message could not be submitted. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-700">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Sparkles size={16} />
          </span>
          LeadPocket
        </Link>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-slate-500">
            Loading enquiry form…
          </p>
        ) : errorMessage && !form ? (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : isSubmitted ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-700">
              ✓
            </span>
            <h1 className="mt-4 text-2xl font-bold">Thank you!</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your enquiry has been sent successfully.
            </p>
          </div>
        ) : form ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
              Enquiry form
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{form.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Fill out the form and we&apos;ll be in touch.
            </p>

            <form className="mt-7 space-y-5" onSubmit={submitForm}>
              {form.fields.map((field) => (
                <label key={field.key} className="block text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                  {field.key === "enquiry" ? (
                    <textarea
                      required={field.required}
                      maxLength={4000}
                      rows={4}
                      value={values[field.key] || ""}
                      onChange={(inputEvent) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: inputEvent.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <input
                      required={field.required}
                      type={field.key === "email" ? "email" : field.key === "phone" ? "tel" : "text"}
                      maxLength={field.key === "email" ? 254 : field.key === "phone" ? 40 : 120}
                      autoComplete={
                        field.key === "name"
                          ? "name"
                          : field.key === "email"
                            ? "email"
                            : field.key === "phone"
                              ? "tel"
                              : "organization"
                      }
                      value={values[field.key] || ""}
                      onChange={(inputEvent) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: inputEvent.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </label>
              ))}

              <label
                aria-hidden="true"
                className="absolute -left-[10000px] h-px w-px overflow-hidden"
              >
                Leave this field empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>

              {errorMessage && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
