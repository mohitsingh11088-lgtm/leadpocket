"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Copy, Download, MessageCircle, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createWhatsAppUrl,
  DEFAULT_WHATSAPP_MESSAGE,
  normalizeInternationalPhoneNumber,
} from "@/lib/whatsapp";
import { getPublicAppUrl } from "@/lib/public-app-url";
import type {
  Database,
  WebsiteFormField,
} from "@/lib/supabase/database.types";

type Settings =
  Database["public"]["Tables"]["whatsapp_click_to_chat_settings"]["Row"];
type PublicForm = Database["public"]["Tables"]["website_forms"]["Row"];

const whatsappFormFields = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "email", label: "Email", required: false },
  { key: "company", label: "Company", required: false },
  { key: "enquiry", label: "Message", required: false },
] satisfies WebsiteFormField[];

export default function WhatsAppClickToChat({
  onConfiguredChange,
}: {
  onConfiguredChange: (configured: boolean) => void;
}) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [defaultMessage, setDefaultMessage] = useState(DEFAULT_WHATSAPP_MESSAGE);
  const [captureForm, setCaptureForm] = useState<Pick<PublicForm, "id" | "public_id"> | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [qrCodeForUrl, setQrCodeForUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const formLink = useMemo(() => {
    const appUrl = getPublicAppUrl();
    if (!captureForm || !appUrl) {
      return null;
    }

    return `${appUrl}/capture/${captureForm.public_id}`;
  }, [captureForm]);

  const shareUrl = useMemo(() => {
    if (!formLink) {
      return null;
    }

    return createWhatsAppUrl(
      phoneNumber,
      `Hello! Please use this form to send your enquiry: ${formLink}`
    );
  }, [formLink, phoneNumber]);

  const ensureCaptureForm = async (userId: string) => {
    const supabase = createClient();
    const { data: existingForm, error: existingFormError } = await supabase
      .from("website_forms")
      .select("id, public_id, is_active")
      .eq("user_id", userId)
      .eq("source_channel", "whatsapp")
      .maybeSingle();

    if (existingFormError) {
      throw existingFormError;
    }

    if (existingForm) {
      if (!existingForm.is_active) {
        const { error } = await supabase
          .from("website_forms")
          .update({ is_active: true })
          .eq("id", existingForm.id);
        if (error) {
          throw error;
        }
      }
      return existingForm;
    }

    const { data: existingConnection, error: connectionError } = await supabase
      .from("integration_connections")
      .select("id")
      .eq("provider", "website")
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    let connection = existingConnection;
    if (!connection) {
      const created = await supabase
        .from("integration_connections")
        .insert({
          provider: "website",
          status: "connected",
          display_name: "Website enquiry forms",
          metadata: {},
        })
        .select("id")
        .single();

      if (created.error) {
        const retry = await supabase
          .from("integration_connections")
          .select("id")
          .eq("provider", "website")
          .maybeSingle();
        if (retry.error || !retry.data) {
          throw created.error;
        }
        connection = retry.data;
      } else {
        connection = created.data;
      }
    }

    const { data: createdForm, error: createFormError } = await supabase
      .from("website_forms")
      .insert({
        user_id: userId,
        connection_id: connection.id,
        title: "WhatsApp enquiry",
        fields: whatsappFormFields,
        source_channel: "whatsapp",
      })
      .select("id, public_id")
      .single();

    if (createFormError) {
      const retry = await supabase
        .from("website_forms")
        .select("id, public_id")
        .eq("user_id", userId)
        .eq("source_channel", "whatsapp")
        .maybeSingle();
      if (retry.error || !retry.data) {
        throw createFormError;
      }
      return retry.data;
    }

    return createdForm;
  };

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("whatsapp_click_to_chat_settings")
          .select("*")
          .maybeSingle();

        if (error) {
          throw error;
        }
        if (!data) {
          if (active) {
            onConfiguredChange(false);
          }
          return;
        }

        const settings = data as Settings;
        const { data: userResult, error: userError } = await supabase.auth.getUser();
        if (userError) {
          throw userError;
        }
        if (!userResult.user) {
          throw new Error("Please sign in again to load WhatsApp settings.");
        }

        const form = await ensureCaptureForm(userResult.user.id);
        const { error: saveError } = await supabase
          .from("whatsapp_click_to_chat_settings")
          .update({ capture_form_id: form.id })
          .eq("user_id", userResult.user.id);
        if (saveError) {
          throw saveError;
        }

        if (active) {
          setPhoneNumber(settings.phone_number);
          setDefaultMessage(settings.default_message);
          setCaptureForm(form);
          onConfiguredChange(true);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            `Could not load WhatsApp settings. ${
              error instanceof Error ? error.message : "Please try again."
            }`
          );
          onConfiguredChange(false);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadSettings();
    return () => {
      active = false;
    };
  }, [onConfiguredChange]);

  useEffect(() => {
    let active = true;
    if (!shareUrl) {
      return;
    }

    void QRCode.toDataURL(shareUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (active) {
          setQrCode(dataUrl);
          setQrCodeForUrl(shareUrl);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            `Could not create the QR code. ${
              error instanceof Error ? error.message : "Please try again."
            }`
          );
        }
      });

    return () => {
      active = false;
    };
  }, [shareUrl]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setErrorMessage("");

    const normalizedPhone = normalizeInternationalPhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      setErrorMessage("Enter a valid international number, including the + country code.");
      return;
    }

    const message = defaultMessage.trim();
    if (!message || message.length > 1000) {
      setErrorMessage("Your message must be between 1 and 1000 characters.");
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      if (!userResult.user) {
        throw new Error("Please sign in again to save WhatsApp settings.");
      }

      const form = await ensureCaptureForm(userResult.user.id);
      const { error } = await supabase
        .from("whatsapp_click_to_chat_settings")
        .upsert({
          user_id: userResult.user.id,
          phone_number: normalizedPhone,
          default_message: message,
          capture_form_id: form.id,
          updated_at: new Date().toISOString(),
        });
      if (error) {
        throw error;
      }

      setPhoneNumber(normalizedPhone);
      setDefaultMessage(message);
      setCaptureForm(form);
      onConfiguredChange(true);
      setNotice("WhatsApp enquiry link and QR code are ready to share.");
    } catch (error) {
      setErrorMessage(
        `Could not save WhatsApp settings. ${
          error instanceof Error ? error.message : "Please try again."
        }`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("WhatsApp enquiry link copied.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        `Could not copy the WhatsApp link. ${
          error instanceof Error ? error.message : "Please try again."
        }`
      );
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Share your QR code. It opens WhatsApp with a ready-made message and your
        enquiry form link. The visitor sends the message, opens the link, and
        submits the form. Their enquiry then appears in Leads with WhatsApp as
        the source.
      </p>

      {errorMessage && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </p>
      )}

      <form onSubmit={saveSettings} className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">
          WhatsApp Business phone number
          <input
            type="tel"
            autoComplete="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+91 9876543210"
            required
            disabled={isLoading || isSaving}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400"
          />
          <span className="mt-1 block font-normal text-slate-400">
            Include the + sign and country code, for example +91 9876543210.
          </span>
        </label>

        <label className="block text-xs font-semibold text-slate-700">
          Default message for lead follow-ups
          <textarea
            value={defaultMessage}
            onChange={(event) => setDefaultMessage(event.target.value)}
            rows={3}
            maxLength={1000}
            disabled={isLoading || isSaving}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-400"
          />
          <span className="mt-1 block font-normal text-slate-400">
            Use {"{name}"} and {"{company}"} to personalize messages from a lead.
          </span>
        </label>

        <button
          type="submit"
          disabled={isLoading || isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={15} />
          {isSaving ? "Setting up..." : "Save and create my QR code"}
        </button>
      </form>

      {shareUrl && formLink && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">Your WhatsApp enquiry link</p>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all text-xs text-blue-700 underline"
          >
            {shareUrl}
          </a>
          <p className="mt-2 text-xs text-slate-500">
            Enquiry form: <span className="break-all">{formLink}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyShareUrl()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Copy size={13} /> Copy WhatsApp link
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <MessageCircle size={13} /> Preview WhatsApp
            </a>
            {qrCode && qrCodeForUrl === shareUrl && (
              <a
                href={qrCode}
                download="leadpocket-whatsapp-enquiry.png"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Download size={13} /> Download QR
              </a>
            )}
          </div>
          {qrCode && qrCodeForUrl === shareUrl && (
            <div className="mt-3 inline-block rounded-lg border border-slate-200 bg-white p-2">
              {/* QR generation runs locally in the browser; no phone or form data is sent to a QR service. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="QR code that opens WhatsApp with the enquiry form link"
                width={180}
                height={180}
              />
            </div>
          )}
        </div>
      )}
      {!shareUrl && !isLoading && (
        <p className="text-xs text-slate-500">
          {!getPublicAppUrl()
            ? "WhatsApp links need the public LeadPocket website URL. Add NEXT_PUBLIC_APP_URL to your deployment settings, then rebuild the app."
            : "Save a valid international number to set up your WhatsApp enquiry link and QR code."}
        </p>
      )}
    </div>
  );
}
