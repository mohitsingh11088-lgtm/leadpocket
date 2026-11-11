import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const maxRequestBytes = 1_048_576;
const idPattern = /^\d{1,32}$/;
const tokenEnvelopePattern = /^aes256gcm:v1:([A-Za-z0-9_-]+)$/;

type JsonObject = Record<string, unknown>;

type WhatsAppToken = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaTokenDebug = {
  app_id?: string;
  is_valid?: boolean;
  expires_at?: number;
  scopes?: string[];
  data_access_expiration_time?: number;
};

class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing Edge Function secret: ${name}`);
  }
  return value;
}

function getRuntimeConfig() {
  const appId = getSecret("META_APP_ID");
  const configId = getSecret("META_EMBEDDED_SIGNUP_CONFIG_ID");
  const graphApiVersion = getSecret("META_GRAPH_API_VERSION");
  if (!idPattern.test(appId) || !idPattern.test(configId)) {
    throw new Error("Meta App ID or Embedded Signup configuration ID is invalid.");
  }
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new Error("META_GRAPH_API_VERSION must look like v25.0.");
  }
  return { appId, configId, graphApiVersion };
}

function getMetaSecrets() {
  return {
    ...getRuntimeConfig(),
    appSecret: getSecret("META_APP_SECRET"),
    webhookVerifyToken: getSecret("META_WEBHOOK_VERIFY_TOKEN"),
  };
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase Edge Function service credentials are not configured.");
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

function bearerToken(request: Request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  return match?.[1] || "";
}

async function getAuthenticatedUser(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return null;
  }
  const { data, error } = await getPublicClient().auth.getUser(token);
  return error ? null : data.user;
}

async function readBodyBytes(request: Request, maxBytes: number) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
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
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseJsonObject(bytes: Uint8Array): JsonObject | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  } catch {
    return null;
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function sha256(bytes: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", copyArrayBuffer(bytes))
  );
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeEncryptionKey(keyVersion: number) {
  const encoded = getSecret(`WHATSAPP_TOKEN_ENCRYPTION_KEY_V${keyVersion}`);
  let decoded: Uint8Array;
  try {
    decoded = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must be base64-encoded.");
  }
  if (decoded.byteLength !== 32) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return decoded;
}

function importEncryptionKey(keyVersion: number) {
  return crypto.subtle.importKey(
    "raw",
    copyArrayBuffer(decodeEncryptionKey(keyVersion)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptToken(token: string, connectionId: string) {
  const keyVersion = 1;
  const key = await importEncryptionKey(keyVersion);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(nonce),
        additionalData: copyArrayBuffer(
          new TextEncoder().encode(`${connectionId}:aes256gcm:v1`)
        ),
        tagLength: 128,
      },
      key,
      copyArrayBuffer(new TextEncoder().encode(token))
    )
  );
  const envelope = new Uint8Array(nonce.byteLength + ciphertext.byteLength);
  envelope.set(nonce);
  envelope.set(ciphertext, nonce.byteLength);
  return {
    ciphertext: `aes256gcm:v1:${toBase64Url(envelope)}`,
    keyVersion,
  };
}

async function decryptToken(
  ciphertext: string,
  connectionId: string,
  keyVersion: number
) {
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error("The stored WhatsApp credential has an unsupported key version.");
  }
  const match = tokenEnvelopePattern.exec(ciphertext);
  if (!match) {
    throw new Error("The stored WhatsApp credential has an unsupported format.");
  }
  const envelope = fromBase64Url(match[1]);
  if (envelope.byteLength < 12 + 16) {
    throw new Error("The stored WhatsApp credential is incomplete.");
  }
  const nonce = envelope.slice(0, 12);
  const encrypted = envelope.slice(12);
  const key = await importEncryptionKey(keyVersion);
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: copyArrayBuffer(nonce),
        additionalData: copyArrayBuffer(
          new TextEncoder().encode(`${connectionId}:aes256gcm:v1`)
        ),
        tagLength: 128,
      },
      key,
      copyArrayBuffer(encrypted)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("The WhatsApp credential could not be decrypted.");
  }
}

async function hmacSha256Hex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        copyArrayBuffer(new TextEncoder().encode(value))
      )
    )
  );
}

async function hmacSha256Bytes(secret: string, value: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, copyArrayBuffer(value))
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function readMetaJson(response: Response) {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new MetaApiError("Meta returned an invalid response.", undefined, response.status);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MetaApiError("Meta returned an invalid response.", undefined, response.status);
  }
  const result = value as JsonObject;
  if (!response.ok || result.error) {
    const error = result.error as JsonObject | undefined;
    throw new MetaApiError(
      typeof error?.message === "string" ? error.message : "Meta rejected the request.",
      typeof error?.code === "number" ? error.code : undefined,
      response.status
    );
  }
  return result;
}

async function graphRequest(
  path: string,
  token: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  params: Record<string, string> = {}
) {
  const { appSecret, graphApiVersion } = getMetaSecrets();
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${path}`);
  const appSecretProof = await hmacSha256Hex(appSecret, token);
  if (method === "GET") {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("appsecret_proof", appSecretProof);
    url.searchParams.set("access_token", token);
  }
  const response = await fetch(url, {
    method,
    headers:
      method === "GET"
        ? undefined
        : { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      method === "GET"
        ? undefined
        : new URLSearchParams({
            ...params,
            appsecret_proof: appSecretProof,
            access_token: token,
          }),
    signal: AbortSignal.timeout(15_000),
  });
  return readMetaJson(response);
}

async function debugToken(accessToken: string): Promise<MetaTokenDebug> {
  const { appId, appSecret, graphApiVersion } = getMetaSecrets();
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const result = await readMetaJson(response);
  if (typeof result.data !== "object" || result.data === null || Array.isArray(result.data)) {
    throw new MetaApiError("Meta returned an invalid token status.");
  }
  return result.data as MetaTokenDebug;
}

async function exchangeSignupCode(code: string): Promise<WhatsAppToken> {
  const { appId, appSecret, graphApiVersion } = getMetaSecrets();
  const url = new URL(`https://graph.facebook.com/${graphApiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const result = await readMetaJson(response);
  if (typeof result.access_token !== "string" || !result.access_token) {
    throw new MetaApiError("Meta did not return a customer access token.");
  }
  return {
    access_token: result.access_token,
    token_type: typeof result.token_type === "string" ? result.token_type : undefined,
    expires_in: typeof result.expires_in === "number" ? result.expires_in : undefined,
  };
}

async function validatePhoneNumber(
  wabaId: string,
  phoneNumberId: string,
  token: string
) {
  let after = "";
  for (let page = 0; page < 10; page += 1) {
    const params: Record<string, string> = {
      fields: "id,display_phone_number,verified_name",
      limit: "100",
    };
    if (after) {
      params.after = after;
    }
    const result = await graphRequest(`${wabaId}/phone_numbers`, token, "GET", params);
    const data = Array.isArray(result.data) ? result.data : [];
    const selected = data.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as JsonObject).id === phoneNumberId
    ) as JsonObject | undefined;
    if (selected) {
      return {
        phoneNumberId,
        displayPhoneNumber:
          typeof selected.display_phone_number === "string"
            ? selected.display_phone_number.slice(0, 40)
            : "",
        verifiedName:
          typeof selected.verified_name === "string"
            ? selected.verified_name.slice(0, 120)
            : "",
      };
    }
    const paging = result.paging as JsonObject | undefined;
    const cursors = paging?.cursors as JsonObject | undefined;
    const nextAfter = cursors?.after;
    if (typeof paging?.next !== "string" || typeof nextAfter !== "string" || !nextAfter) {
      break;
    }
    after = nextAfter;
  }
  throw new MetaApiError("The selected WhatsApp number was not found in that business account.");
}

async function subscribeToWhatsAppAccount(wabaId: string, token: string) {
  const result = await graphRequest(`${wabaId}/subscribed_apps`, token, "POST");
  if (result.success !== true) {
    throw new MetaApiError("Meta did not confirm the webhook subscription.");
  }
}

async function registerPhoneNumber(
  phoneNumberId: string,
  pin: string,
  token: string
) {
  const result = await graphRequest(`${phoneNumberId}/register`, token, "POST", {
    messaging_product: "whatsapp",
    pin,
  });
  if (result.success !== true) {
    throw new MetaApiError("Meta did not confirm phone number registration.");
  }
}

async function handleManagementAction(
  request: Request,
  body: JsonObject
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return jsonResponse({ error: "Please sign in again to manage WhatsApp." }, 401);
  }

  const action = body.action;
  if (action === "config") {
    const { appId, configId, graphApiVersion } = getRuntimeConfig();
    return jsonResponse({ ok: true, appId, configId, graphApiVersion });
  }
  if (action === "connect") {
    return await connectWhatsApp(user.id, body);
  }
  if (action === "disconnect") {
    return await disconnectWhatsApp(user.id);
  }
  if (action === "check") {
    return await checkWhatsAppConnection(user.id);
  }
  return jsonResponse({ error: "Unsupported WhatsApp action." }, 400);
}

async function connectWhatsApp(userId: string, body: JsonObject) {
  const code = body.code;
  const wabaId = body.wabaId;
  const phoneNumberId = body.phoneNumberId;
  const pin = body.pin;
  if (
    typeof code !== "string" ||
    code.length < 1 ||
    code.length > 4096 ||
    typeof wabaId !== "string" ||
    !idPattern.test(wabaId) ||
    typeof phoneNumberId !== "string" ||
    !idPattern.test(phoneNumberId) ||
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin)
  ) {
    return jsonResponse({ error: "Meta details or the 6-digit WhatsApp security PIN are invalid." }, 400);
  }

  try {
    const token = await exchangeSignupCode(code);
    const { appId } = getRuntimeConfig();
    const debug = await debugToken(token.access_token);
    if (
      debug.is_valid !== true ||
      debug.app_id !== appId ||
      !Array.isArray(debug.scopes) ||
      !debug.scopes.includes("whatsapp_business_management") ||
      !debug.scopes.includes("whatsapp_business_messaging")
    ) {
      return jsonResponse(
        { error: "Meta did not grant the permissions required to receive WhatsApp messages." },
        403
      );
    }

    const phone = await validatePhoneNumber(wabaId, phoneNumberId, token.access_token);
    await registerPhoneNumber(phoneNumberId, pin, token.access_token);
    await subscribeToWhatsAppAccount(wabaId, token.access_token);

    const supabase = getServiceClient();
    const { data: connection, error: connectionError } = await supabase
      .from("integration_connections")
      .upsert(
        {
          user_id: userId,
          provider: "whatsapp",
          status: "connected",
          display_name: phone.displayPhoneNumber || phone.verifiedName || "WhatsApp Business",
          metadata: { waba_id: wabaId, phone_number_id: phoneNumberId },
        },
        { onConflict: "user_id,provider" }
      )
      .select("id")
      .single();

    if (connectionError || !connection) {
      console.error("Could not save WhatsApp connection.", connectionError?.message);
      return jsonResponse({ error: "Meta connected, but LeadPocket could not save the connection." }, 500);
    }

    const tokenExpiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : typeof debug.expires_at === "number" && debug.expires_at > 0
          ? new Date(debug.expires_at * 1000).toISOString()
          : null;

    const encryptedToken = await encryptToken(token.access_token, connection.id);
    const { error: credentialError } = await supabase
      .from("whatsapp_credentials")
      .upsert(
        {
          connection_id: connection.id,
          user_id: userId,
          access_token_ciphertext: encryptedToken.ciphertext,
          encryption_key_version: encryptedToken.keyVersion,
          token_expires_at: tokenExpiresAt,
          updated_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "connection_id" }
      );

    if (credentialError) {
      console.error("Could not save encrypted WhatsApp credential.", credentialError.message);
      await supabase
        .from("integration_connections")
        .update({ status: "needs_attention" })
        .eq("id", connection.id)
        .eq("user_id", userId);
      return jsonResponse({ error: "Meta connected, but LeadPocket could not securely save the connection." }, 500);
    }

    const { error: staleAccountError } = await supabase
      .from("whatsapp_accounts")
      .delete()
      .eq("connection_id", connection.id)
      .neq("phone_number_id", phoneNumberId);
    if (staleAccountError) {
      console.error("Could not replace the previous WhatsApp number.", staleAccountError.message);
      await supabase
        .from("integration_connections")
        .update({ status: "needs_attention" })
        .eq("id", connection.id)
        .eq("user_id", userId);
      return jsonResponse({ error: "Meta connected, but LeadPocket could not update the selected number." }, 500);
    }

    const { error: accountError } = await supabase
      .from("whatsapp_accounts")
      .upsert(
        {
          connection_id: connection.id,
          user_id: userId,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          display_phone_number: phone.displayPhoneNumber,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connection_id,phone_number_id" }
      );
    if (accountError) {
      console.error("Could not save the selected WhatsApp number.", accountError.message);
      await supabase
        .from("integration_connections")
        .update({ status: "needs_attention" })
        .eq("id", connection.id)
        .eq("user_id", userId);
      return jsonResponse({ error: "Meta connected, but LeadPocket could not save the selected number." }, 500);
    }

    return jsonResponse({
      ok: true,
      connected: true,
      connectionId: connection.id,
      displayPhoneNumber: phone.displayPhoneNumber,
      verifiedName: phone.verifiedName,
      tokenExpiresAt,
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      console.error("Meta WhatsApp connection failed.", {
        status: error.httpStatus,
        code: error.code,
        message: error.message,
      });
      return jsonResponse(
        { error: "Meta could not finish connecting this WhatsApp number. Check the Meta setup and try again." },
        error.httpStatus === 401 || error.code === 190 ? 401 : 502
      );
    }
    console.error(
      "WhatsApp connection setup failed.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "WhatsApp could not be connected. Please try again." }, 500);
  }
}

async function getOwnedWhatsAppConnection(userId: string) {
  const supabase = getServiceClient();
  const { data: connection, error } = await supabase
    .from("integration_connections")
    .select("id, status")
    .eq("user_id", userId)
    .eq("provider", "whatsapp")
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the WhatsApp connection.");
  }
  return { supabase, connection };
}

async function setConnectionStatus(
  supabase: ReturnType<typeof getServiceClient>,
  connectionId: string,
  userId: string,
  status: "connected" | "disconnected" | "needs_attention"
) {
  const { error } = await supabase
    .from("integration_connections")
    .update({ status })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("provider", "whatsapp");
  if (error) {
    throw new Error("Could not update the WhatsApp connection status.");
  }
}

async function checkWhatsAppConnection(userId: string) {
  try {
    const { supabase, connection } = await getOwnedWhatsAppConnection(userId);
    if (!connection || connection.status === "disconnected") {
      return jsonResponse({ ok: true, connected: false });
    }

    const { data: credential, error: credentialError } = await supabase
      .from("whatsapp_credentials")
      .select("access_token_ciphertext, encryption_key_version, token_expires_at, revoked_at")
      .eq("connection_id", connection.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (credentialError) {
      console.error("Could not load the WhatsApp credential status.", credentialError.message);
      return jsonResponse({ error: "Could not check the WhatsApp connection." }, 500);
    }

    if (!credential || credential.revoked_at) {
      await setConnectionStatus(supabase, connection.id, userId, "needs_attention");
      return jsonResponse({
        ok: false,
        connected: false,
        status: "needs_attention",
        error: "The Meta connection is no longer active. Reconnect WhatsApp to continue.",
      }, 409);
    }

    if (
      credential.token_expires_at &&
      new Date(credential.token_expires_at).getTime() <= Date.now()
    ) {
      await setConnectionStatus(supabase, connection.id, userId, "needs_attention");
      return jsonResponse({
        ok: false,
        connected: false,
        status: "needs_attention",
        error: "Meta access has expired. Reconnect WhatsApp to continue.",
      }, 409);
    }

    const accessToken = await decryptToken(
      credential.access_token_ciphertext,
      connection.id,
      credential.encryption_key_version
    );
    const debug = await debugToken(accessToken);
    const { appId } = getRuntimeConfig();
    if (debug.is_valid !== true || debug.app_id !== appId) {
      await setConnectionStatus(supabase, connection.id, userId, "needs_attention");
      return jsonResponse({
        ok: false,
        connected: false,
        status: "needs_attention",
        error: "Meta access was revoked or expired. Reconnect WhatsApp to continue.",
      }, 409);
    }

    await setConnectionStatus(supabase, connection.id, userId, "connected");
    return jsonResponse({ ok: true, connected: true, status: "connected" });
  } catch (error) {
    if (error instanceof MetaApiError) {
      console.error("Could not check the Meta WhatsApp token.", {
        status: error.httpStatus,
        code: error.code,
      });
      if (error.code === 190 || error.httpStatus === 401) {
        const { supabase, connection } = await getOwnedWhatsAppConnection(userId);
        if (connection) {
          await setConnectionStatus(supabase, connection.id, userId, "needs_attention");
        }
        return jsonResponse({
          ok: false,
          connected: false,
          status: "needs_attention",
          error: "Meta access was revoked or expired. Reconnect WhatsApp to continue.",
        }, 409);
      }
      return jsonResponse({ error: "Meta could not be reached. Try the connection check again." }, 502);
    }
    console.error(
      "Could not check WhatsApp connection.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "Could not check the WhatsApp connection." }, 500);
  }
}

async function disconnectWhatsApp(userId: string) {
  const { supabase, connection } = await getOwnedWhatsAppConnection(userId);
  if (!connection) {
    return jsonResponse({ ok: true, connected: false });
  }

  const { data: account, error: accountError } = await supabase
    .from("whatsapp_accounts")
    .select("waba_id")
    .eq("connection_id", connection.id)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (accountError) {
    console.error("Could not load WhatsApp account details for disconnect.", accountError.message);
    return jsonResponse({ error: "Could not securely disconnect WhatsApp. Please try again." }, 500);
  }
  const { data: credential, error: credentialError } = await supabase
    .from("whatsapp_credentials")
    .select("access_token_ciphertext, encryption_key_version")
    .eq("connection_id", connection.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (credentialError) {
    console.error("Could not load the WhatsApp credential for disconnect.", credentialError.message);
    return jsonResponse({ error: "Could not securely disconnect WhatsApp. Please try again." }, 500);
  }

  let remoteUnsubscribed = false;
  if (account && credential) {
    try {
      const accessToken = await decryptToken(
        credential.access_token_ciphertext,
        connection.id,
        credential.encryption_key_version
      );
      await graphRequest(`${account.waba_id}/subscribed_apps`, accessToken, "DELETE");
      remoteUnsubscribed = true;
    } catch (error) {
      console.error(
        "Meta webhook unsubscribe failed during WhatsApp disconnect.",
        error instanceof MetaApiError
          ? { status: error.httpStatus, code: error.code }
          : error instanceof Error
            ? error.message
            : "Unknown error"
      );
    }
  }

  const { error: credentialDeleteError } = await supabase
    .from("whatsapp_credentials")
    .delete()
    .eq("connection_id", connection.id)
    .eq("user_id", userId);
  if (credentialDeleteError) {
    console.error("Could not remove the encrypted WhatsApp credential.", credentialDeleteError.message);
    return jsonResponse({ error: "Could not securely disconnect WhatsApp. Please try again." }, 500);
  }

  try {
    await setConnectionStatus(supabase, connection.id, userId, "disconnected");
  } catch (error) {
    console.error("Could not update WhatsApp connection status.", error);
    return jsonResponse({ error: "The token was removed, but the connection status could not be updated." }, 500);
  }

  return jsonResponse({
    ok: true,
    connected: false,
    warning: remoteUnsubscribed
      ? undefined
      : "WhatsApp was disconnected in LeadPocket, but Meta could not confirm webhook removal.",
  });
}

function getString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength ? value : "";
}

function extractMessageContent(message: JsonObject) {
  const type = getString(message.type, 32).toLowerCase();
  const content = message[type];
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return "";
  }
  const data = content as JsonObject;
  for (const key of ["body", "caption", "text"]) {
    const candidate = data[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 4000);
    }
  }
  const interactive = data.interactive;
  if (typeof interactive === "object" && interactive !== null && !Array.isArray(interactive)) {
    const value = interactive as JsonObject;
    const buttonReply = value.button_reply as JsonObject | undefined;
    const listReply = value.list_reply as JsonObject | undefined;
    return getString(buttonReply?.title, 4000) || getString(listReply?.title, 4000);
  }
  return "";
}

function getSenderName(contacts: unknown, senderId: string) {
  if (!Array.isArray(contacts)) {
    return "";
  }
  for (const contact of contacts) {
    if (typeof contact !== "object" || contact === null || Array.isArray(contact)) {
      continue;
    }
    const item = contact as JsonObject;
    if (item.wa_id !== senderId) {
      continue;
    }
    const profile = item.profile;
    if (typeof profile === "object" && profile !== null && !Array.isArray(profile)) {
      return getString((profile as JsonObject).name, 120);
    }
  }
  return "";
}

async function updateFromAccountEvent(wabaId: string, event: string) {
  if (!idPattern.test(wabaId)) {
    return;
  }
  const normalizedEvent = event.toUpperCase();
  const wasRemoved = normalizedEvent === "PARTNER_REMOVED";
  const needsAttention =
    wasRemoved ||
    normalizedEvent.includes("DISABLED") ||
    normalizedEvent.includes("RESTRICTED");
  if (!needsAttention) {
    return;
  }

  const supabase = getServiceClient();
  const { data: accounts, error } = await supabase
    .from("whatsapp_accounts")
    .select("connection_id, user_id")
    .eq("waba_id", wabaId);
  if (error) {
    throw new Error("Could not locate the WhatsApp account for an account update.");
  }
  for (const account of accounts || []) {
    const { error: connectionError } = await supabase
      .from("integration_connections")
      .update({ status: wasRemoved ? "disconnected" : "needs_attention" })
      .eq("id", account.connection_id)
      .eq("user_id", account.user_id)
      .eq("provider", "whatsapp");
    if (connectionError) {
      throw new Error("Could not update WhatsApp status after an account update.");
    }
    if (wasRemoved) {
      const { error: credentialError } = await supabase
        .from("whatsapp_credentials")
        .update({ revoked_at: new Date().toISOString() })
        .eq("connection_id", account.connection_id)
        .eq("user_id", account.user_id);
      if (credentialError) {
        throw new Error("Could not revoke the removed WhatsApp account credential.");
      }
    }
  }
}

async function processWebhook(bytes: Uint8Array, request: Request) {
  const { appSecret } = getMetaSecrets();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const signatureMatch = /^sha256=([0-9a-f]{64})$/i.exec(signature);
  if (!signatureMatch) {
    return jsonResponse({ error: "Invalid webhook signature." }, 401);
  }
  const expected = await hmacSha256Bytes(appSecret, bytes);
  let supplied: Uint8Array;
  try {
    supplied = Uint8Array.from(
      signatureMatch[1].match(/.{2}/g) || [],
      (byte) => Number.parseInt(byte, 16)
    );
  } catch {
    return jsonResponse({ error: "Invalid webhook signature." }, 401);
  }
  if (!constantTimeEqual(expected, supplied)) {
    return jsonResponse({ error: "Invalid webhook signature." }, 401);
  }

  const payload = parseJsonObject(bytes);
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return jsonResponse({ error: "Invalid WhatsApp webhook payload." }, 400);
  }

  try {
    const supabase = getServiceClient();
    for (const entryValue of payload.entry) {
      if (typeof entryValue !== "object" || entryValue === null || Array.isArray(entryValue)) {
        continue;
      }
      const entry = entryValue as JsonObject;
      const wabaId = getString(entry.id, 32);
      if (Array.isArray(entry.changes)) {
        for (const changeValue of entry.changes) {
          if (typeof changeValue !== "object" || changeValue === null || Array.isArray(changeValue)) {
            continue;
          }
          const change = changeValue as JsonObject;
          if (change.field === "account_update") {
            const value = change.value;
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
              const event = getString((value as JsonObject).event, 100);
              await updateFromAccountEvent(wabaId, event);
            }
          }
        }
      }

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const changeValue of changes) {
        if (typeof changeValue !== "object" || changeValue === null || Array.isArray(changeValue)) {
          continue;
        }
        const change = changeValue as JsonObject;
        if (change.field !== "messages" || typeof change.value !== "object" || change.value === null) {
          continue;
        }
        const value = change.value as JsonObject;
        const metadata = value.metadata;
        const phoneNumberId =
          typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
            ? getString((metadata as JsonObject).phone_number_id, 32)
            : "";
        if (!phoneNumberId || !Array.isArray(value.messages)) {
          continue;
        }

        for (const messageValue of value.messages) {
          if (typeof messageValue !== "object" || messageValue === null || Array.isArray(messageValue)) {
            continue;
          }
          const message = messageValue as JsonObject;
          const messageId = getString(message.id, 256);
          const senderId = getString(message.from, 200);
          if (!messageId || !senderId) {
            continue;
          }

          const messageBytes = new TextEncoder().encode(JSON.stringify(message));
          const messageHash = toHex(await sha256(messageBytes));
          const timestamp = getString(message.timestamp, 32);
          const occurredAt =
            /^\d{1,12}$/.test(timestamp)
              ? new Date(Number(timestamp) * 1000).toISOString()
              : new Date().toISOString();
          const messageType = getString(message.type, 32) || "unknown";
          const senderName = getSenderName(value.contacts, senderId);

          const { data: result, error } = await supabase.rpc(
            "process_whatsapp_message",
            {
              p_phone_number_id: phoneNumberId,
              p_sender_id: senderId,
              p_sender_phone: senderId,
              p_sender_name: senderName,
              p_message_id: messageId,
              p_message_type: messageType,
              p_message_content: extractMessageContent(message),
              p_occurred_at: occurredAt,
              p_payload_hash: messageHash,
            }
          );
          if (error) {
            console.error("WhatsApp message could not be processed.", error.message);
            return jsonResponse({ error: "Message processing failed; Meta should retry." }, 500);
          }

          if (
            typeof result !== "object" ||
            result === null ||
            Array.isArray(result) ||
            ((result as JsonObject).ok !== true &&
              (result as JsonObject).ignored !== true)
          ) {
            console.error("WhatsApp message processor returned a retryable result.");
            return jsonResponse({ error: "Message processing failed; Meta should retry." }, 500);
          }
        }
      }
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(
      "WhatsApp webhook processing failed.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "Webhook processing failed; Meta should retry." }, 500);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (request.method === "GET") {
      const { webhookVerifyToken } = getMetaSecrets();
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token") || "";
      const challenge = url.searchParams.get("hub.challenge");
      if (
        mode === "subscribe" &&
        challenge &&
        constantTimeEqual(
          new TextEncoder().encode(token),
          new TextEncoder().encode(webhookVerifyToken)
        )
      ) {
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
        });
      }
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const bytes = await readBodyBytes(request, maxRequestBytes);
    if (!bytes) {
      return jsonResponse({ error: "Request body is missing or too large." }, 413);
    }

    if (request.headers.has("x-hub-signature-256")) {
      return await processWebhook(bytes, request);
    }

    const body = parseJsonObject(bytes);
    if (!body) {
      return jsonResponse({ error: "Invalid request body." }, 400);
    }
    return await handleManagementAction(request, body);
  } catch (error) {
    console.error(
      "Unexpected WhatsApp integration error.",
      error instanceof Error ? error.message : "Unknown error"
    );
    return jsonResponse({ error: "The WhatsApp integration could not process this request." }, 500);
  }
});
