import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const allowedFieldKeys = new Set(["name", "email", "phone", "company", "enquiry"]);
const maxRequestBytes = 16_384;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FormField = {
  key: "name" | "email" | "phone" | "company" | "enquiry";
  label: string;
  required: boolean;
};

type PublicForm = {
  id: string;
  public_id: string;
  title: string;
  fields: FormField[];
  is_active: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseFormFields(value: unknown): FormField[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    return null;
  }

  const seen = new Set<string>();
  const fields: FormField[] = [];

  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("key" in item) ||
      !("label" in item) ||
      !("required" in item)
    ) {
      return null;
    }

    const field = item as Record<string, unknown>;
    if (
      typeof field.key !== "string" ||
      !allowedFieldKeys.has(field.key) ||
      seen.has(field.key) ||
      typeof field.label !== "string" ||
      field.label.trim().length < 1 ||
      field.label.length > 40 ||
      typeof field.required !== "boolean"
    ) {
      return null;
    }

    seen.add(field.key);
    fields.push({
      key: field.key as FormField["key"],
      label: field.label.trim(),
      required: field.key === "name" || field.required,
    });
  }

  return fields.some((field) => field.key === "name" && field.required)
    ? fields
    : null;
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Edge Function secrets are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function hashHex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hashIp(ip: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip)
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function getClientIp(request: Request) {
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    forwardedIp ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  );
}

async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxRequestBytes) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxRequestBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await readJsonBody(request);
    if (!body || typeof body.action !== "string" || typeof body.publicId !== "string") {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    if (!uuidPattern.test(body.publicId)) {
      return jsonResponse({ error: "This form is unavailable." }, 404);
    }

    const supabase = getAdminClient();
    const { data: formData, error: formError } = await supabase
      .from("website_forms")
      .select("id, public_id, title, fields, is_active")
      .eq("public_id", body.publicId)
      .eq("is_active", true)
      .maybeSingle();

    if (formError) {
      console.error("Could not retrieve public website form.", formError.message);
      return jsonResponse({ error: "The form could not be loaded. Please try again." }, 500);
    }

    if (!formData) {
      return jsonResponse({ error: "This form is unavailable." }, 404);
    }

    const fields = parseFormFields(formData.fields);
    if (!fields) {
      console.error("Website form has an invalid field configuration.", formData.id);
      return jsonResponse({ error: "This form is not configured correctly." }, 500);
    }

    const form = formData as PublicForm;
    if (body.action === "get-form") {
      return jsonResponse({
        form: {
          publicId: form.public_id,
          title: form.title,
          fields,
        },
      });
    }

    if (body.action !== "submit" || typeof body.eventId !== "string") {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    if (!uuidPattern.test(body.eventId)) {
      return jsonResponse({ error: "Invalid submission. Please try again." }, 400);
    }

    if (typeof body.honeypot === "string" && body.honeypot.trim()) {
      return jsonResponse({ ok: true, duplicate: false });
    }

    if (
      typeof body.data !== "object" ||
      body.data === null ||
      Array.isArray(body.data)
    ) {
      return jsonResponse({ error: "Please check your form entries." }, 400);
    }

    const submittedData = body.data as Record<string, unknown>;
    const data: Record<string, string> = {};

    for (const field of fields) {
      const rawValue = submittedData[field.key];
      if (rawValue !== undefined && typeof rawValue !== "string") {
        return jsonResponse({ error: "Please check your form entries." }, 400);
      }

      const value = typeof rawValue === "string" ? rawValue.trim() : "";
      const maxLength =
        field.key === "email"
          ? 254
          : field.key === "phone"
            ? 40
            : field.key === "enquiry"
              ? 4000
              : 120;

      if (value.length > maxLength) {
        return jsonResponse(
          { error: `${field.label} is too long. Please shorten it and try again.` },
          400
        );
      }

      if (field.required && !value) {
        return jsonResponse({ error: `${field.label} is required.` }, 400);
      }

      if (
        field.key === "email" &&
        value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ) {
        return jsonResponse({ error: "Enter a valid email address." }, 400);
      }

      data[field.key] = value;
    }

    const clientIp = getClientIp(request);
    const rateLimitSecret = Deno.env.get("RATE_LIMIT_HMAC_SECRET");
    if (!clientIp || clientIp.length > 128 || !rateLimitSecret) {
      console.error("Website form rate limiting is not configured.");
      return jsonResponse(
        { error: "Form submissions are temporarily unavailable." },
        clientIp.length > 128 ? 400 : 503
      );
    }

    const [ipHash, payloadHash] = await Promise.all([
      hashIp(clientIp, rateLimitSecret),
      hashHex(JSON.stringify({ publicId: form.public_id, data })),
    ]);

    const { data: result, error: submitError } = await supabase.rpc(
      "submit_website_form",
      {
        p_public_id: form.public_id,
        p_event_id: body.eventId,
        p_ip_hash: ipHash,
        p_payload_hash: payloadHash,
        p_data: data,
      }
    );

    if (submitError) {
      console.error("Website form submission failed.", submitError.message);
      return jsonResponse({ error: "Your message could not be submitted. Please try again." }, 500);
    }

    if (typeof result !== "object" || result === null || Array.isArray(result)) {
      console.error("Website form submission returned an invalid RPC result.");
      return jsonResponse({ error: "Your message could not be submitted. Please try again." }, 500);
    }

    const response = result as {
      ok?: boolean;
      duplicate?: boolean;
      rate_limited?: boolean;
    };
    if (response.rate_limited) {
      return jsonResponse(
        { error: "This form has received too many submissions. Please try again later." },
        429
      );
    }
    if (response.ok !== true) {
      console.error("Website form submission returned an unsuccessful RPC result.");
      return jsonResponse({ error: "Your message could not be submitted. Please try again." }, 500);
    }

    return jsonResponse({ ok: true, duplicate: Boolean(response.duplicate) });
  } catch (error) {
    console.error(
      "Unexpected website capture error.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "The form could not be processed. Please try again." }, 500);
  }
});
