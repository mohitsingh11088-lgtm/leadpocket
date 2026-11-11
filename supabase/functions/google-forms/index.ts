import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const maxRequestBytes = 16_384;
const allowedFields = new Set(["name", "email", "phone", "company", "enquiry"]);
const credentialPattern = /^lp_gf_[A-Za-z0-9_-]{43}$/;

type LeadData = {
  name: string;
  email: string;
  phone: string;
  company: string;
  enquiry: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Edge Function secrets are not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getPublicClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !publishableKey) {
    throw new Error("Supabase authentication is not configured.");
  }
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function createCredential() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...randomBytes);
  const encoded = btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `lp_gf_${encoded}`;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] || "";
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
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(request: Request) {
  const token = bearerToken(request);
  if (!token || credentialPattern.test(token)) {
    return null;
  }

  const { data, error } = await getPublicClient().auth.getUser(token);
  return error ? null : data.user;
}

async function manageConnection(
  request: Request,
  body: Record<string, unknown>
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return jsonResponse({ error: "Please sign in again to manage this integration." }, 401);
  }

  const action = body.action;
  if (action !== "connect" && action !== "rotate" && action !== "revoke") {
    return jsonResponse({ error: "Unsupported integration action." }, 400);
  }

  const supabase = getServiceClient();
  const { data: existingConnection, error: findError } = await supabase
    .from("integration_connections")
    .select("id, last_success_at")
    .eq("user_id", user.id)
    .eq("provider", "google_forms")
    .maybeSingle();

  if (findError) {
    console.error("Could not load Google Forms connection.", findError.message);
    return jsonResponse({ error: "Could not update the Google Forms connection." }, 500);
  }

  if (action === "revoke") {
    if (!existingConnection) {
      return jsonResponse({ ok: true, connected: false });
    }

    const { error: revokeError } = await supabase
      .from("integration_webhook_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("connection_id", existingConnection.id)
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error("Could not revoke Google Forms credential.", revokeError.message);
      return jsonResponse({ error: "Could not revoke the Google Forms credential." }, 500);
    }

    const { error: connectionError } = await supabase
      .from("integration_connections")
      .update({ status: "disconnected" })
      .eq("id", existingConnection.id)
      .eq("user_id", user.id);

    if (connectionError) {
      console.error("Could not disconnect Google Forms.", connectionError.message);
      return jsonResponse({ error: "The credential was revoked, but connection status could not be updated." }, 500);
    }

    return jsonResponse({
      ok: true,
      connected: false,
      lastSuccessAt: existingConnection.last_success_at,
    });
  }

  const now = new Date().toISOString();
  const { data: connection, error: connectionError } = await supabase
    .from("integration_connections")
    .upsert(
      {
        user_id: user.id,
        provider: "google_forms",
        status: "connected",
        display_name: "Google Forms",
      },
      { onConflict: "user_id,provider" }
    )
    .select("id, last_success_at")
    .single();

  if (connectionError) {
    console.error("Could not create Google Forms connection.", connectionError.message);
    return jsonResponse({ error: "Could not connect Google Forms." }, 500);
  }

  const credential = createCredential();
  const credentialHash = await sha256(credential);
  const { error: credentialError } = await supabase
    .from("integration_webhook_credentials")
    .upsert(
      {
        connection_id: connection.id,
        user_id: user.id,
        credential_hash: credentialHash,
        created_at: now,
        last_used_at: null,
        revoked_at: null,
      },
      { onConflict: "connection_id" }
    );

  if (credentialError) {
    console.error("Could not save Google Forms credential hash.", credentialError.message);
    return jsonResponse({ error: "Could not create a Google Forms credential." }, 500);
  }

  return jsonResponse({
    ok: true,
    connected: true,
    credential,
    lastSuccessAt: connection.last_success_at,
  });
}

async function testOwnerConnection(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return jsonResponse({ error: "Please sign in again to test this connection." }, 401);
  }

  const supabase = getServiceClient();
  const { data: connection, error: connectionError } = await supabase
    .from("integration_connections")
    .select("id, status, last_success_at")
    .eq("user_id", user.id)
    .eq("provider", "google_forms")
    .maybeSingle();

  if (connectionError) {
    console.error("Could not test Google Forms connection.", connectionError.message);
    return jsonResponse({ error: "Could not test the connection. Please try again." }, 500);
  }
  if (!connection || connection.status !== "connected") {
    return jsonResponse({
      ok: false,
      connected: false,
      error: "Google Forms is not connected yet. Start the setup to connect it.",
    }, 409);
  }

  const { data: credential, error: credentialError } = await supabase
    .from("integration_webhook_credentials")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (credentialError) {
    console.error("Could not verify Google Forms setup.", credentialError.message);
    return jsonResponse({ error: "Could not test the connection. Please try again." }, 500);
  }
  if (!credential) {
    return jsonResponse({
      ok: false,
      connected: false,
      error: "The private setup code is inactive. Create a new code to reconnect.",
    }, 409);
  }

  return jsonResponse({
    ok: true,
    connected: true,
    lastSuccessAt: connection.last_success_at,
    message: "LeadPocket is ready to receive Google Forms responses.",
  });
}

async function testWebhookCredential(credential: string) {
  const credentialHash = await sha256(credential);
  const supabase = getServiceClient();
  const { data: savedCredential, error: credentialError } = await supabase
    .from("integration_webhook_credentials")
    .select("connection_id, user_id")
    .eq("credential_hash", credentialHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (credentialError) {
    console.error("Could not verify Google Forms setup code.", credentialError.message);
    return jsonResponse({ error: "Could not check the setup. Please try again." }, 500);
  }
  if (!savedCredential) {
    return jsonResponse({ error: "This setup code is no longer active." }, 401);
  }

  const { data: connection, error: connectionError } = await supabase
    .from("integration_connections")
    .select("status")
    .eq("id", savedCredential.connection_id)
    .eq("user_id", savedCredential.user_id)
    .eq("provider", "google_forms")
    .maybeSingle();

  if (connectionError) {
    console.error("Could not verify Google Forms connection.", connectionError.message);
    return jsonResponse({ error: "Could not check the setup. Please try again." }, 500);
  }
  if (!connection || connection.status !== "connected") {
    return jsonResponse({ error: "Google Forms is disconnected. Reconnect in LeadPocket." }, 401);
  }

  return jsonResponse({ ok: true, message: "Google Forms can reach LeadPocket." });
}

function normalizeAnswers(value: unknown): LeadData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const answers = value as Record<string, unknown>;
  if (Object.keys(answers).some((key) => !allowedFields.has(key))) {
    return null;
  }
  if (Object.values(answers).some((answer) => typeof answer !== "string")) {
    return null;
  }

  const data: LeadData = {
    name: typeof answers.name === "string" ? answers.name.trim() : "",
    email: typeof answers.email === "string" ? answers.email.trim() : "",
    phone: typeof answers.phone === "string" ? answers.phone.trim() : "",
    company: typeof answers.company === "string" ? answers.company.trim() : "",
    enquiry: typeof answers.enquiry === "string" ? answers.enquiry.trim() : "",
  };

  if (
    !data.name ||
    data.name.length > 120 ||
    data.email.length > 254 ||
    (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) ||
    data.phone.length > 40 ||
    data.company.length > 120 ||
    data.enquiry.length > 4000
  ) {
    return null;
  }

  return data;
}

async function receiveSubmission(
  request: Request,
  body: Record<string, unknown>
) {
  const credential = bearerToken(request);
  if (!credentialPattern.test(credential)) {
    return jsonResponse({ error: "Invalid integration credential." }, 401);
  }

  if (
    typeof body.submissionId !== "string" ||
    body.submissionId.trim().length < 1 ||
    body.submissionId.length > 200
  ) {
    return jsonResponse({ error: "A valid Google Form response ID is required." }, 400);
  }

  const data = normalizeAnswers(body.answers);
  if (!data) {
    return jsonResponse({ error: "Check that Name, Email, Phone, Company, and Enquiry answers are valid." }, 400);
  }

  const credentialHash = await sha256(credential);
  const payloadHash = await sha256(JSON.stringify(data));
  const { data: result, error } = await getServiceClient().rpc(
    "submit_google_forms_lead",
    {
      p_credential_hash: credentialHash,
      p_event_id: body.submissionId.trim(),
      p_payload_hash: payloadHash,
      p_data: data,
    }
  );

  if (error) {
    if (error.message.includes("Invalid or inactive Google Forms credential")) {
      return jsonResponse({ error: "This Google Forms credential is invalid or revoked." }, 401);
    }
    if (
      error.message.includes("Invalid Google Forms submission") ||
      error.message.includes("Invalid Google Forms field values")
    ) {
      return jsonResponse({ error: "The Google Forms response is invalid." }, 400);
    }
    console.error("Google Forms submission failed.", error.message);
    return jsonResponse({ error: "The Google Forms response could not be processed." }, 500);
  }

  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    console.error("Google Forms submission returned an invalid RPC result.");
    return jsonResponse({ error: "The Google Forms response could not be processed." }, 500);
  }

  const rpcResult = result as {
    ok?: boolean;
    duplicate?: boolean;
    rate_limited?: boolean;
  };
  if (rpcResult.rate_limited) {
    return jsonResponse({ error: "Submission limit reached. Try again later." }, 429);
  }
  if (rpcResult.ok !== true) {
    return jsonResponse({ error: "The Google Forms response could not be processed." }, 500);
  }

  return jsonResponse({
    ok: true,
    duplicate: Boolean(rpcResult.duplicate),
  });
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
    if (!body || typeof body.action !== "string") {
      return jsonResponse({ error: "Invalid request." }, 400);
    }

    if (body.action === "submit") {
      return await receiveSubmission(request, body);
    }
    if (body.action === "test") {
      const credential = bearerToken(request);
      return credentialPattern.test(credential)
        ? await testWebhookCredential(credential)
        : await testOwnerConnection(request);
    }
    if (["connect", "rotate", "revoke"].includes(body.action)) {
      return await manageConnection(request, body);
    }
    return jsonResponse({ error: "Unsupported integration action." }, 400);
  } catch (error) {
    console.error(
      "Unexpected Google Forms integration error.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "The Google Forms integration could not process this request." }, 500);
  }
});
