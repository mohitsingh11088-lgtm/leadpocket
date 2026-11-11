"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, MessageCircle, RefreshCw, Unplug } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Connection = Database["public"]["Tables"]["integration_connections"]["Row"];
type WhatsAppAccount = Database["public"]["Tables"]["whatsapp_accounts"]["Row"];

type SignupConfig = {
  appId: string;
  configId: string;
  graphApiVersion: string;
};

type SignupDetails = {
  wabaId: string;
  phoneNumberId: string;
};

type FacebookLoginResponse = {
  authResponse?: { code?: string };
};

declare global {
  interface Window {
    FB?: {
      init: (options: {
        appId: string;
        autoLogAppEvents: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: {
          config_id: string;
          response_type: "code";
          override_default_response_type: boolean;
          extras: { setup: Record<string, never>; version: "v4" };
        }
      ) => void;
    };
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function WhatsAppConnection({
  connection,
  onConnectionChanged,
}: {
  connection?: Connection;
  onConnectionChanged: () => void;
}) {
  const [account, setAccount] = useState<WhatsAppAccount | null>(null);
  const [signupConfig, setSignupConfig] = useState<SignupConfig | null>(null);
  const [pendingLaunch, setPendingLaunch] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [registrationPin, setRegistrationPin] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [signupDetails, setSignupDetails] = useState<SignupDetails | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const loadAccount = async () => {
      if (!connection) {
        setAccount(null);
        return;
      }

      const { data, error } = await createClient()
        .from("whatsapp_accounts")
        .select("*")
        .eq("connection_id", connection.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(`Could not load the connected WhatsApp number. ${error.message}`);
        return;
      }
      setAccount(data);
    };

    void loadAccount();
    return () => {
      active = false;
    };
  }, [connection]);

  useEffect(() => {
    if (!authCode || !signupDetails) {
      return;
    }

    let active = true;
    const finishSignup = async () => {
      setIsConnecting(true);
      setErrorMessage("");
      setNotice("");
      try {
        const { data, error } = await createClient().functions.invoke("whatsapp", {
          body: {
            action: "connect",
            code: authCode,
            wabaId: signupDetails.wabaId,
            phoneNumberId: signupDetails.phoneNumberId,
            pin: registrationPin,
          },
        });
        if (error) {
          const responseError = data as { error?: string } | null;
          throw new Error(responseError?.error || error.message);
        }
        const result = data as {
          ok?: boolean;
          displayPhoneNumber?: string;
          verifiedName?: string;
          error?: string;
        } | null;
        if (!result?.ok) {
          throw new Error(result?.error || "Meta could not connect this WhatsApp number.");
        }

        if (active) {
          setNotice(
            `WhatsApp is connected${result.displayPhoneNumber ? `: ${result.displayPhoneNumber}` : ""}. New messages will appear in Leads and Activities.`
          );
          setAuthCode("");
          setSignupDetails(null);
          setRegistrationPin("");
          setSignupConfig(null);
          setPendingLaunch(false);
          onConnectionChanged();
        }
      } catch (error) {
        if (active) {
          setErrorMessage(`Could not finish connecting WhatsApp. ${getErrorMessage(error)}`);
          setAuthCode("");
          setSignupDetails(null);
        }
      } finally {
        if (active) {
          setIsConnecting(false);
        }
      }
    };

    void finishSignup();
    return () => {
      active = false;
    };
  }, [authCode, signupDetails, registrationPin, onConnectionChanged]);

  const launchSignup = (config: SignupConfig) => {
    if (!window.FB) {
      setErrorMessage("Meta sign-in is still loading. Please try again in a moment.");
      setPendingLaunch(false);
      return;
    }

    setIsConnecting(true);
    window.FB.init({
      appId: config.appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: config.graphApiVersion,
    });
    setSdkReady(true);
    setPendingLaunch(false);
    setErrorMessage("");
    setNotice("");

    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) {
          setAuthCode(code);
        } else {
          setIsConnecting(false);
          setErrorMessage("Meta sign-in was cancelled or did not return authorization.");
        }
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, version: "v4" },
      }
    );
  };

  const startSignup = async () => {
    if (!/^\d{6}$/.test(registrationPin)) {
      setErrorMessage("Enter a 6-digit WhatsApp security PIN to continue.");
      return;
    }
    setErrorMessage("");
    setNotice("");
    setIsConnecting(true);

    try {
      const { data, error } = await createClient().functions.invoke("whatsapp", {
        body: { action: "config" },
      });
      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }
      const result = data as {
        ok?: boolean;
        appId?: string;
        configId?: string;
        graphApiVersion?: string;
        error?: string;
      } | null;
      if (!result?.ok || !result.appId || !result.configId || !result.graphApiVersion) {
        throw new Error(result?.error || "Meta sign-in is not configured yet.");
      }
      const config = {
        appId: result.appId,
        configId: result.configId,
        graphApiVersion: result.graphApiVersion,
      };
      setSignupConfig(config);

      if (window.FB) {
        launchSignup(config);
      } else {
        setPendingLaunch(true);
      }
    } catch (error) {
      setIsConnecting(false);
      setErrorMessage(`Could not start Meta sign-in. ${getErrorMessage(error)}`);
    }
  };

  const handleMetaMessage = (event: MessageEvent) => {
    let origin: URL;
    try {
      origin = new URL(event.origin);
    } catch {
      return;
    }
    if (
      origin.protocol !== "https:" ||
      (origin.hostname !== "facebook.com" &&
        !origin.hostname.endsWith(".facebook.com"))
    ) {
      return;
    }

    let value: unknown;
    try {
      value = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return;
    }
    const message = value as {
      type?: unknown;
      event?: unknown;
      data?: unknown;
    };
    if (message.type !== "WA_EMBEDDED_SIGNUP") {
      return;
    }
    if (message.event === "CANCEL" || message.event === "ERROR") {
      setIsConnecting(false);
      setPendingLaunch(false);
      setErrorMessage("Meta sign-in was not completed. You can try connecting again.");
      return;
    }
    if (typeof message.data !== "object" || message.data === null || Array.isArray(message.data)) {
      return;
    }
    const data = message.data as { waba_id?: unknown; phone_number_id?: unknown };
    if (
      typeof data.waba_id === "string" &&
      /^\d{1,32}$/.test(data.waba_id) &&
      typeof data.phone_number_id === "string" &&
      /^\d{1,32}$/.test(data.phone_number_id)
    ) {
      setSignupDetails({
        wabaId: data.waba_id,
        phoneNumberId: data.phone_number_id,
      });
    }
  };

  useEffect(() => {
    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await createClient().functions.invoke("whatsapp", {
        body: { action: "check" },
      });
      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }
      const result = data as { ok?: boolean; connected?: boolean; error?: string } | null;
      if (!result?.ok || !result.connected) {
        throw new Error(result?.error || "WhatsApp needs to be connected again.");
      }
      setNotice("Meta confirms your WhatsApp connection is active.");
      onConnectionChanged();
    } catch (error) {
      setErrorMessage(`Connection check failed. ${getErrorMessage(error)}`);
      onConnectionChanged();
    } finally {
      setIsChecking(false);
    }
  };

  const disconnect = async () => {
    if (
      !window.confirm(
        "Disconnect WhatsApp? New messages will no longer create leads in LeadPocket."
      )
    ) {
      return;
    }
    setIsDisconnecting(true);
    setErrorMessage("");
    setNotice("");
    try {
      const { data, error } = await createClient().functions.invoke("whatsapp", {
        body: { action: "disconnect" },
      });
      if (error) {
        const responseError = data as { error?: string } | null;
        throw new Error(responseError?.error || error.message);
      }
      const result = data as { ok?: boolean; warning?: string; error?: string } | null;
      if (!result?.ok) {
        throw new Error(result?.error || "Could not disconnect WhatsApp.");
      }
      setNotice(result.warning || "WhatsApp is disconnected.");
      setAccount(null);
      onConnectionChanged();
    } catch (error) {
      setErrorMessage(`Could not disconnect WhatsApp. ${getErrorMessage(error)}`);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = connection?.status === "connected";
  const lastMessageAt = account?.last_message_at
    ? new Date(account.last_message_at)
    : null;
  const lastMessageLabel =
    lastMessageAt && !Number.isNaN(lastMessageAt.getTime())
      ? lastMessageAt.toLocaleString()
      : "No messages received yet";

  return (
    <div className="mt-4 space-y-3">
      {signupConfig && (
        <Script
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="afterInteractive"
          onReady={() => {
            setSdkReady(true);
            if (pendingLaunch) {
              launchSignup(signupConfig);
            }
          }}
          onError={() => {
            setIsConnecting(false);
            setErrorMessage("Meta sign-in could not load. Check your connection and try again.");
          }}
        />
      )}

      {isConnected ? (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Check size={16} className="text-emerald-600" />
            {account?.display_phone_number || connection?.display_name || "WhatsApp Business"}
          </div>
          <p className="text-xs text-slate-500">Last message: {lastMessageLabel}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void checkConnection()}
              disabled={isChecking || isDisconnecting}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {isChecking ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Check connection
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={isDisconnecting || isChecking}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {isDisconnecting ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Unplug size={14} />
              )}
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="block text-xs leading-5 text-slate-600">
            Meta requires a 6-digit security PIN to register your business number.
            Choose one, or enter its existing PIN. LeadPocket uses it to finish
            setup and does not save it.
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              disabled={isConnecting}
              value={registrationPin}
              onChange={(event) =>
                setRegistrationPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-label="6-digit WhatsApp security PIN"
              className="mt-2 block w-full max-w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void startSignup()}
            disabled={isConnecting || isChecking || isDisconnecting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isConnecting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <MessageCircle size={16} />
            )}
            {isConnecting ? "Connecting…" : "Connect WhatsApp"}
          </button>
        </>
      )}

      {sdkReady && !isConnecting && !isConnected && (
        <p className="text-xs text-slate-500">
          Sign in with Meta and choose the WhatsApp Business account and number to connect.
        </p>
      )}
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
    </div>
  );
}
