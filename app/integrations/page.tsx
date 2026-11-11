"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Camera,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Smartphone,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  Database,
  IntegrationProvider,
  WebsiteFormField,
} from "@/lib/supabase/database.types";
import WhatsAppClickToChat from "./whatsapp-click-to-chat";
import WorkspaceNav from "../components/workspace-nav";

type WebsiteForm = Database["public"]["Tables"]["website_forms"]["Row"];
type ProviderStatus = Database["public"]["Tables"]["integration_connections"]["Row"]["status"];

const defaultFields: WebsiteFormField[] = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "company", label: "Company", required: false },
];

const channels: {
  provider: IntegrationProvider;
  title: string;
  description: string;
  icon: typeof MessageCircle;
}[] = [
  {
    provider: "website",
    title: "Website enquiry forms",
    description: "Share a hosted form to receive enquiries directly in your CRM.",
    icon: Smartphone,
  },
  {
    provider: "whatsapp",
    title: "WhatsApp Business",
    description: "Let leads start a WhatsApp chat with your business.",
    icon: MessageCircle,
  },
  {
    provider: "facebook_lead_ads",
    title: "Facebook Lead Ads",
    description: "Bring Facebook campaign leads into your workspace.",
    icon: Megaphone,
  },
  {
    provider: "instagram",
    title: "Instagram",
    description: "Capture enquiries from Instagram business messaging and forms.",
    icon: Camera,
  },
  {
    provider: "google_forms",
    title: "Google Forms",
    description: "Send Google Form responses to your lead pipeline.",
    icon: Check,
  },
  {
    provider: "email",
    title: "Email",
    description: "Prepare email enquiries for a unified lead inbox.",
    icon: Mail,
  },
  {
    provider: "phone",
    title: "Phone calls",
    description: "Track call enquiries alongside your other channels.",
    icon: Phone,
  },
];

function isWebsiteFormField(value: unknown): value is WebsiteFormField {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const field = value as Record<string, unknown>;
  return (
    typeof field.key === "string" &&
    ["name", "email", "phone", "company", "enquiry"].includes(field.key) &&
    typeof field.label === "string" &&
    typeof field.required === "boolean"
  );
}

function getWebsiteFormFields(value: WebsiteForm["fields"]) {
  if (!Array.isArray(value)) {
    return defaultFields;
  }

  const fields = value.filter(isWebsiteFormField);
  return fields.some((field) => field.key === "name")
    ? fields.map((field) =>
        field.key === "name" ? { ...field, required: true } : field
      )
    : defaultFields;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function getGoogleAppsScriptTemplate() {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "YOUR_SUPABASE_PROJECT_URL";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "YOUR_SUPABASE_PUBLISHABLE_KEY";

  return `function installLeadPocketTrigger() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error("Open this script from your Google Form first.");

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "sendLeadToLeadPocket")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("sendLeadToLeadPocket")
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log("Automatic sending is on. Submit a test response to check it.");
}

function testLeadPocketConnection() {
  const result = sendLeadPocketRequest({ action: "test" });
  Logger.log(result.message || "Google Forms is connected to LeadPocket.");
}

function sendLeadPocketRequest(payload) {
  const properties = PropertiesService.getScriptProperties();
  const credential = properties.getProperty("LEADPOCKET_WEBHOOK_CREDENTIAL");
  if (!credential) {
    throw new Error("Add the private setup code to Script Properties, then try again.");
  }

  const response = UrlFetchApp.fetch(
    "${projectUrl}/functions/v1/google-forms",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        apikey: "${publishableKey}",
        Authorization: "Bearer " + credential
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  const result = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(result.error || "LeadPocket could not verify the connection.");
  }
  return result;
}

function sendLeadToLeadPocket(event) {
  const answers = { name: "", email: "", phone: "", company: "", enquiry: "" };
  event.response.getItemResponses().forEach((itemResponse) => {
    const title = itemResponse.getItem().getTitle().trim().toLowerCase();
    const value = itemResponse.getResponse();
    const answer = Array.isArray(value) ? value.join(", ") : String(value || "");

    if (/^(name|full name|your name)$/.test(title)) answers.name = answer;
    else if (/^(email|email address)$/.test(title)) answers.email = answer;
    else if (/^(phone|phone number|mobile)$/.test(title)) answers.phone = answer;
    else if (/^(company|business|company name)$/.test(title)) answers.company = answer;
    else if (/^(enquiry|inquiry|message|your message)$/.test(title)) answers.enquiry = answer;
  });

  sendLeadPocketRequest({
    action: "submit",
    submissionId: event.response.getId(),
    answers: answers
  });
}`;
}

function GoogleFormsStepIllustration({ step }: { step: number }) {
  const illustrations = [
    <div key="form" className="mx-auto max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 h-2 w-24 rounded bg-purple-200" />
      <p className="text-sm font-bold text-slate-800">Contact us</p>
      {["Name", "Email", "Phone", "Company", "Enquiry"].map((field) => (
        <div key={field} className="mt-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-500">
          {field}
        </div>
      ))}
    </div>,
    <div key="script" className="mx-auto max-w-xs overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-sm">
      <div className="mb-4 flex gap-1">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
      <div className="space-y-2">
        <div className="h-2 w-4/5 rounded bg-blue-400/80" />
        <div className="h-2 w-3/5 rounded bg-slate-500" />
        <div className="h-2 w-2/3 rounded bg-emerald-400/80" />
        <div className="h-2 w-1/2 rounded bg-slate-500" />
      </div>
      <p className="mt-4 text-xs text-slate-300">Run the selected setup step</p>
    </div>,
    <div key="properties" className="mx-auto max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">Private settings</p>
      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Setting name</p>
        <p className="mt-1 break-all rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-[10px] text-slate-700">
          LEADPOCKET_WEBHOOK_CREDENTIAL
        </p>
        <p className="mt-2 text-[10px] text-slate-500">Paste your private code as the value</p>
      </div>
    </div>,
    <div key="send" className="mx-auto max-w-xs rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-800">Apps Script</p>
      <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="rounded bg-white px-2 py-2 shadow-sm">Choose installLeadPocketTrigger</p>
        <p className="rounded bg-white px-2 py-2 shadow-sm">Click Run, then approve</p>
        <p className="rounded bg-white px-2 py-2 shadow-sm">Choose testLeadPocketConnection</p>
      </div>
      <p className="mt-3 text-[10px] text-slate-500">Then submit a test response in your form</p>
    </div>,
  ];

  return (
    <div
      aria-label={`Illustration for setup step ${step}`}
      className="flex min-h-64 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5"
    >
      {illustrations[step - 1] ?? illustrations[0]}
    </div>
  );
}

function getOriginLabel(provider: IntegrationProvider) {
  const labels: Record<IntegrationProvider, string> = {
    website: "Website form",
    whatsapp: "WhatsApp Business",
    facebook_lead_ads: "Facebook Lead Ads",
    instagram: "Instagram",
    google_forms: "Google Forms",
    email: "Email",
    phone: "Phone",
  };
  return labels[provider];
}

export default function IntegrationsPage() {
  const [forms, setForms] = useState<WebsiteForm[]>([]);
  const [connections, setConnections] = useState<
    Database["public"]["Tables"]["integration_connections"]["Row"][]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [title, setTitle] = useState("Contact us");
  const [fields, setFields] = useState(defaultFields);
  const [isSaving, setIsSaving] = useState(false);
  const [busyFormId, setBusyFormId] = useState<string | null>(null);
  const [googleFormsBusy, setGoogleFormsBusy] = useState(false);
  const [oneTimeCredential, setOneTimeCredential] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const [googleFormsWizardOpen, setGoogleFormsWizardOpen] = useState(false);
  const [googleFormsStep, setGoogleFormsStep] = useState(1);
  const [whatsAppConfigured, setWhatsAppConfigured] = useState(false);

  useEffect(() => {
    let active = true;

    const loadIntegrations = async () => {
      try {
        const supabase = createClient();
        const [formsResult, connectionsResult] = await Promise.all([
          supabase.from("website_forms").select("*").order("created_at", { ascending: false }),
          supabase
            .from("integration_connections")
            .select("*")
            .order("created_at", { ascending: true }),
        ]);

        if (formsResult.error) {
          throw formsResult.error;
        }
        if (connectionsResult.error) {
          throw connectionsResult.error;
        }

        if (active) {
          setForms(
            formsResult.data.filter((form) => form.source_channel === "website")
          );
          setConnections(connectionsResult.data);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            `Could not load integrations. ${getErrorMessage(error)}`
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadIntegrations();
    return () => {
      active = false;
    };
  }, []);

  const openNewForm = () => {
    setEditingFormId(null);
    setTitle("Contact us");
    setFields(defaultFields);
    setErrorMessage("");
    setEditorOpen(true);
  };

  const openEditForm = (form: WebsiteForm) => {
    setEditingFormId(form.id);
    setTitle(form.title);
    setFields(getWebsiteFormFields(form.fields));
    setErrorMessage("");
    setEditorOpen(true);
  };

  const toggleField = (fieldKey: WebsiteFormField["key"]) => {
    if (fieldKey === "name") {
      return;
    }

    const currentField = defaultFields.find((field) => field.key === fieldKey);
    if (!currentField) {
      return;
    }

    setFields((currentFields) => {
      if (currentFields.some((field) => field.key === fieldKey)) {
        return currentFields.filter((field) => field.key !== fieldKey);
      }
      return [...currentFields, currentField];
    });
  };

  const updateField = (
    fieldKey: WebsiteFormField["key"],
    update: Partial<WebsiteFormField>
  ) => {
    setFields((currentFields) =>
      currentFields.map((field) =>
        field.key === fieldKey ? { ...field, ...update } : field
      )
    );
  };

  const saveForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();

    if (!normalizedTitle || normalizedTitle.length > 120) {
      setErrorMessage("Enter a form title between 1 and 120 characters.");
      return;
    }
    if (!fields.some((field) => field.key === "name")) {
      setErrorMessage("The Name field must be included.");
      return;
    }
    if (fields.some((field) => !field.label.trim() || field.label.length > 40)) {
      setErrorMessage("Every field needs a label between 1 and 40 characters.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setNotice("");

    try {
      const supabase = createClient();
      const { data: connection, error: connectionError } = await supabase
        .from("integration_connections")
        .upsert(
          {
            provider: "website",
            status: "connected",
            display_name: "Website enquiry forms",
            metadata: {},
          },
          { onConflict: "user_id,provider" }
        )
        .select("*")
        .single();

      if (connectionError) {
        throw connectionError;
      }

      const formInput = {
        title: normalizedTitle,
        fields: fields.map((field) => ({
          ...field,
          required: field.key === "name" || field.required,
        })),
        connection_id: connection.id,
      };

      const result = editingFormId
        ? await supabase
            .from("website_forms")
            .update(formInput)
            .eq("id", editingFormId)
            .select("*")
            .single()
        : await supabase.from("website_forms").insert(formInput).select("*").single();

      if (result.error) {
        throw result.error;
      }

      setForms((currentForms) =>
        editingFormId
          ? currentForms.map((form) => (form.id === result.data.id ? result.data : form))
          : [result.data, ...currentForms]
      );
      setConnections((currentConnections) =>
        currentConnections.some((item) => item.id === connection.id)
          ? currentConnections.map((item) =>
              item.id === connection.id ? connection : item
            )
          : [...currentConnections, connection]
      );
      setEditorOpen(false);
      setNotice(editingFormId ? "Website form updated." : "Website form created.");
    } catch (error) {
      setErrorMessage(`Could not save this form. ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFormStatus = async (form: WebsiteForm) => {
    setBusyFormId(form.id);
    setErrorMessage("");
    setNotice("");

    try {
      const { data, error } = await createClient()
        .from("website_forms")
        .update({ is_active: !form.is_active })
        .eq("id", form.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      setForms((currentForms) =>
        currentForms.map((item) => (item.id === data.id ? data : item))
      );
      setNotice(data.is_active ? "Website form activated." : "Website form paused.");
    } catch (error) {
      setErrorMessage(`Could not update this form. ${getErrorMessage(error)}`);
    } finally {
      setBusyFormId(null);
    }
  };

  const copyFormLink = async (form: WebsiteForm) => {
    const formUrl = `${window.location.origin}/capture/${form.public_id}`;
    try {
      await navigator.clipboard.writeText(formUrl);
      setNotice("Public form link copied.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(`Could not copy the form link. ${getErrorMessage(error)}`);
      setNotice("");
    }
  };

  const googleFormsConnection = connections.find(
    (connection) => connection.provider === "google_forms"
  );
  const isGoogleFormsConnected = googleFormsConnection?.status === "connected";

  const handleGoogleFormsAction = async (
    action: "connect" | "rotate" | "revoke"
  ) => {
    if (
      action === "revoke" &&
      !window.confirm(
        "Disconnect Google Forms? New form responses will stop appearing in your leads until you connect it again."
      )
    ) {
      return;
    }

    setGoogleFormsBusy(true);
    setOneTimeCredential("");
    setErrorMessage("");
    setNotice("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("google-forms", {
        body: { action },
      });

      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }

      const result = data as {
        ok?: boolean;
        connected?: boolean;
        credential?: string;
        lastSuccessAt?: string | null;
        error?: string;
      } | null;

      if (!result?.ok) {
        throw new Error(result?.error || "Could not update Google Forms.");
      }

      if (action !== "revoke") {
        if (!result.credential) {
          throw new Error("The new credential was not returned. Try rotating it again.");
        }
        setOneTimeCredential(result.credential);
      }

      const { data: refreshedConnections, error: refreshError } = await supabase
        .from("integration_connections")
        .select("*")
        .order("created_at", { ascending: true });

      if (refreshError) {
        throw refreshError;
      }
      setConnections(refreshedConnections);

      if (action === "revoke") {
        setNotice("Google Forms is disconnected. New responses will no longer create leads.");
      } else {
        setNotice(
          action === "rotate"
            ? "Your private setup code has been replaced. Copy it now; the previous code no longer works."
            : "Google Forms is connected. Copy your private setup code now; it will only be shown once."
        );
      }
    } catch (error) {
      setErrorMessage(`Could not update Google Forms. ${getErrorMessage(error)}`);
    } finally {
      setGoogleFormsBusy(false);
    }
  };

  const testGoogleFormsConnection = async () => {
    setGoogleFormsBusy(true);
    setErrorMessage("");
    setNotice("");

    try {
      const { data, error } = await createClient().functions.invoke("google-forms", {
        body: { action: "test" },
      });

      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }

      const result = data as { ok?: boolean; message?: string; error?: string } | null;
      if (!result?.ok) {
        throw new Error(result?.error || "LeadPocket could not verify the connection.");
      }

      setNotice(result.message || "LeadPocket is ready to receive Google Forms responses.");
    } catch (error) {
      setErrorMessage(`Connection check failed. ${getErrorMessage(error)}`);
    } finally {
      setGoogleFormsBusy(false);
    }
  };

  const copyText = async (value: string, successMessage: string) => {
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(`Could not copy to clipboard. ${getErrorMessage(error)}`);
      setNotice("");
    } finally {
      setIsCopying(false);
    }
  };

  const formatLastSuccess = (value: string | null | undefined) => {
    if (!value) {
      return "No successful submissions yet";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "No successful submissions yet"
      : `Last successful submission: ${date.toLocaleString()}`;
  };

  const activeFormsCount = forms.filter((form) => form.is_active).length;

  const statusForProvider = (provider: IntegrationProvider) => {
    if (provider === "website") {
      if (isLoading) {
        return "Loading";
      }
      if (activeFormsCount > 0) {
        return "Connected";
      }
      return forms.length > 0 ? "Paused" : "Not set up";
    }

    if (provider === "whatsapp") {
      if (isLoading) {
        return "Loading";
      }
      return whatsAppConfigured ? "Ready" : "Not set up";
    }

    const connection = connections.find((item) => item.provider === provider);
    if (provider === "google_forms") {
      if (isLoading) {
        return "Loading";
      }
      if (!connection) {
        return "Not connected";
      }
      const statuses: Record<ProviderStatus, string> = {
        connected: "Connected",
        disconnected: "Disconnected",
        needs_attention: "Needs attention",
      };
      return statuses[connection.status];
    }
    if (!connection) {
      return "Planned";
    }
    const statuses: Record<ProviderStatus, string> = {
      connected: "Connected",
      disconnected: "Disconnected",
      needs_attention: "Needs attention",
    };
    return statuses[connection.status];
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-8">
        <WorkspaceNav active="Integrations" />

        <header className="mb-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Lead capture
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Integrations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Bring enquiries from Website Forms and Google Forms into your lead
            pipeline, or let leads start a WhatsApp conversation with you.
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
        {notice && (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {notice}
          </p>
        )}

        <section aria-label="Available channels" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => {
            const Icon = channel.icon;
            const status = statusForProvider(channel.provider);
            const isWebsite = channel.provider === "website";
            const isWhatsApp = channel.provider === "whatsapp";
            const isGoogleForms = channel.provider === "google_forms";
            return (
              <article
                key={channel.provider}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={20} />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      status === "Connected" || status === "Ready"
                        ? "bg-emerald-50 text-emerald-700"
                        : status === "Needs attention"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <h2 className="mt-4 font-bold">{channel.title}</h2>
                <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                  {channel.description}
                </p>
                {isWebsite ? (
                  <button
                    type="button"
                    onClick={openNewForm}
                    disabled={isLoading}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Create website form
                  </button>
                ) : isGoogleForms ? (
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleFormsStep(1);
                        setGoogleFormsWizardOpen(true);
                        setErrorMessage("");
                      }}
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {isGoogleFormsConnected ? <RefreshCw size={15} /> : <Plus size={16} />}
                      {isGoogleFormsConnected ? "Setup and connection help" : "Connect Google Forms"}
                    </button>
                    <p className="text-xs text-slate-500">
                      {formatLastSuccess(googleFormsConnection?.last_success_at)}
                    </p>
                  </div>
                ) : isWhatsApp ? (
                  <WhatsAppClickToChat
                    onConfiguredChange={setWhatsAppConfigured}
                  />
                ) : (
                  <p className="mt-4 text-xs font-medium text-slate-400">
                    {status === "Planned" ? "Not available yet" : getOriginLabel(channel.provider)}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        {googleFormsWizardOpen && (
          <section className="mt-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
                  Google Forms connection guide
                </p>
                <h2 className="mt-1 text-xl font-bold">Let&apos;s connect your form</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Follow four short steps. You can come back here whenever you need help.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOneTimeCredential("");
                  setGoogleFormsWizardOpen(false);
                }}
                aria-label="Close Google Forms guide"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2" aria-label="Setup progress">
              {["Your form", "Add sending", "Save private code", "Turn it on"].map((label, index) => {
                const step = index + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setGoogleFormsStep(step)}
                    aria-current={googleFormsStep === step ? "step" : undefined}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      googleFormsStep === step
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {step}. {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
              <div className="min-h-64">
                {googleFormsStep === 1 && (
                  <>
                    <h3 className="text-lg font-bold">1. Prepare your questions</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      In Google Forms, add questions named <strong>Name</strong>, <strong>Email</strong>,
                      <strong> Phone</strong>, <strong>Company</strong>, and <strong>Enquiry</strong>.
                      Make Name required. You can leave the others optional.
                    </p>
                    <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                      The question names help LeadPocket put each answer in the right place.
                    </p>
                  </>
                )}
                {googleFormsStep === 2 && (
                  <>
                    <h3 className="text-lg font-bold">2. Add the ready-made helper</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Open your form, choose <strong>Extensions → Apps Script</strong>, remove
                      the sample text, and paste in the helper below. It sends answers securely
                      when someone submits your form.
                    </p>
                    <button
                      type="button"
                      disabled={isCopying}
                      onClick={() =>
                        void copyText(getGoogleAppsScriptTemplate(), "Ready-made helper copied.")
                      }
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Copy size={15} /> Copy ready-made helper
                    </button>
                    <details className="mt-4 rounded-xl border border-slate-200 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                        Show the helper text
                      </summary>
                      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-4 text-slate-100">
                        <code>{getGoogleAppsScriptTemplate()}</code>
                      </pre>
                    </details>
                  </>
                )}
                {googleFormsStep === 3 && (
                  <>
                    <h3 className="text-lg font-bold">3. Save your private setup code</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Create a private code, then save it in the form&apos;s Apps Script settings.
                      LeadPocket shows the code only once. It is not part of your form or the
                      helper text.
                    </p>
                    {oneTimeCredential ? (
                      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-950">
                          Copy this code now, then paste it into the private settings shown here.
                        </p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            aria-label="One-time private Google Forms setup code"
                            readOnly
                            value={oneTimeCredential}
                            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-xs text-slate-700"
                          />
                          <button
                            type="button"
                            disabled={isCopying}
                            onClick={() =>
                              void copyText(oneTimeCredential, "Private setup code copied.")
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                          >
                            <Copy size={14} /> Copy code
                          </button>
                          <button
                            type="button"
                            onClick={() => setOneTimeCredential("")}
                            className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                          >
                            Hide
                          </button>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          In Apps Script, open <strong>Project Settings → Script Properties</strong>.
                          Add a setting named{" "}
                          <code className="rounded bg-white px-1">LEADPOCKET_WEBHOOK_CREDENTIAL</code>
                          and paste your code as its value.
                        </p>
                      </div>
                    ) : isGoogleFormsConnected ? (
                      <div className="mt-4 rounded-xl bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-900">
                          Google Forms is connected. You only need a new code if you lost the old one.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleGoogleFormsAction("rotate")}
                          disabled={googleFormsBusy}
                          className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {googleFormsBusy ? "Making a new code…" : "Replace my private code"}
                        </button>
                        <p className="mt-2 text-xs leading-5 text-emerald-800">
                          Replacing it stops the previous code from working. Update the private
                          setting in Google Apps Script afterward.
                        </p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleGoogleFormsAction("connect")}
                        disabled={googleFormsBusy || isLoading}
                        className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {googleFormsBusy ? "Preparing your code…" : "Create my private setup code"}
                      </button>
                    )}
                  </>
                )}
                {googleFormsStep === 4 && (
                  <>
                    <h3 className="text-lg font-bold">4. Turn on sending and try it</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      In Apps Script, choose <code className="rounded bg-slate-100 px-1">installLeadPocketTrigger</code>
                      from the function list and click <strong>Run</strong>. Approve Google&apos;s
                      request. Then choose <code className="rounded bg-slate-100 px-1">testLeadPocketConnection</code>
                      and click <strong>Run</strong>. A successful check appears in the execution log.
                    </p>
                    <button
                      type="button"
                      onClick={() => void testGoogleFormsConnection()}
                      disabled={googleFormsBusy || !isGoogleFormsConnected}
                      className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {googleFormsBusy ? "Checking…" : "Check LeadPocket is ready"}
                    </button>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      This checks your LeadPocket connection. The Apps Script check confirms the
                      saved private code works. Finally, submit a real test response in Google Forms.
                    </p>
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      {formatLastSuccess(googleFormsConnection?.last_success_at)}
                    </div>
                    {isGoogleFormsConnected && (
                      <button
                        type="button"
                        onClick={() => void handleGoogleFormsAction("revoke")}
                        disabled={googleFormsBusy}
                        className="mt-4 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Disconnect Google Forms
                      </button>
                    )}
                  </>
                )}
              </div>
              <GoogleFormsStepIllustration step={googleFormsStep} />
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setGoogleFormsStep((step) => Math.max(1, step - 1))}
                disabled={googleFormsStep === 1}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>
              {googleFormsStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setGoogleFormsStep((step) => Math.min(4, step + 1))}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Next step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOneTimeCredential("");
                    setGoogleFormsWizardOpen(false);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Done
                </button>
              )}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Your website forms</h2>
              <p className="mt-1 text-sm text-slate-500">
                Each form has its own public link and sends new enquiries to your leads.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewForm}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus size={16} />
              New form
            </button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading your forms…
            </p>
          ) : forms.length === 0 ? (
            <div className="rounded-xl bg-slate-50 px-4 py-9 text-center">
              <p className="text-sm text-slate-600">
                You haven&apos;t created a website enquiry form yet.
              </p>
              <button
                type="button"
                onClick={openNewForm}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                <Plus size={16} /> Create your first form
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {forms.map((form) => (
                <article
                  key={form.id}
                  className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{form.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          form.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {form.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      /capture/{form.public_id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {getWebsiteFormFields(form.fields).map((field) => field.label).join(" · ")}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyFormLink(form)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy size={14} /> Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(form)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleFormStatus(form)}
                      disabled={busyFormId === form.id}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyFormId === form.id
                        ? "Saving…"
                        : form.is_active
                          ? "Pause"
                          : "Activate"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {editorOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSaving) {
                setEditorOpen(false);
              }
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="form-editor-title"
              className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl sm:p-7"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h2 id="form-editor-title" className="text-xl font-bold">
                    {editingFormId ? "Edit website form" : "Create website form"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Choose a title and the information to ask for.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close form editor"
                  disabled={isSaving}
                  onClick={() => setEditorOpen(false)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={saveForm} className="space-y-5">
                <label className="block text-sm font-medium text-slate-700">
                  Form title
                  <input
                    required
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <fieldset className="space-y-3">
                  <legend className="mb-2 text-sm font-semibold text-slate-700">
                    Form fields
                  </legend>
                  {defaultFields.map((defaultField) => {
                    const selectedField = fields.find(
                      (field) => field.key === defaultField.key
                    );
                    return (
                      <div
                        key={defaultField.key}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedField)}
                              disabled={defaultField.key === "name"}
                              onChange={() => toggleField(defaultField.key)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                            {defaultField.key === "name" ? "Name (required)" : defaultField.key}
                          </label>
                          {selectedField && defaultField.key !== "name" && (
                            <label className="flex items-center gap-2 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={selectedField.required}
                                onChange={(event) =>
                                  updateField(defaultField.key, {
                                    required: event.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-blue-600"
                              />
                              Required
                            </label>
                          )}
                        </div>
                        {selectedField && (
                          <input
                            aria-label={`${defaultField.key} field label`}
                            maxLength={40}
                            value={selectedField.label}
                            onChange={(event) =>
                              updateField(defaultField.key, {
                                label: event.target.value,
                              })
                            }
                            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          />
                        )}
                      </div>
                    );
                  })}
                </fieldset>

                {errorMessage && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {errorMessage}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setEditorOpen(false)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X size={15} /> Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Save size={15} />
                    {isSaving ? "Saving…" : editingFormId ? "Save changes" : "Create form"}
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
