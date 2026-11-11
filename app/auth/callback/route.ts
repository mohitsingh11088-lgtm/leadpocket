import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AuthFlow = "recovery" | "signup" | "other";
type VerificationType = "recovery" | "signup" | "email";

function getFlow(type: string | null, next: string | null): AuthFlow {
  if (type === "recovery") {
    return "recovery";
  }
  if (type === "signup" || type === "email") {
    return "signup";
  }
  if (next === "/reset-password") {
    return "recovery";
  }
  return "other";
}

function getFailureRedirect(
  request: NextRequest,
  flow: AuthFlow,
  expired: boolean
) {
  const error = flow === "recovery"
    ? expired
      ? "recovery_expired"
      : "recovery"
    : flow === "signup"
      ? expired
        ? "confirmation_expired"
        : "confirmation"
      : "confirmation";

  return NextResponse.redirect(
    new URL(`/login?error=${error}`, request.url)
  );
}

function getSafeErrorDetails(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return {};
  }

  const details = error;
  const status =
    "status" in details && typeof details.status === "number"
      ? details.status
      : undefined;
  const code =
    "code" in details &&
    typeof details.code === "string" &&
    /^[a-z0-9_-]{1,64}$/i.test(details.code)
      ? details.code
      : undefined;

  return {
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const flow = getFlow(type, searchParams.get("next"));

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    console.error("Auth callback is missing public Supabase configuration.", {
      flow,
    });
    return NextResponse.redirect(
      new URL("/login?error=configuration", request.url)
    );
  }

  const authError = searchParams.get("error");
  const authErrorCode = searchParams.get("error_code");
  if (authError || authErrorCode) {
    const expired =
      authErrorCode === "otp_expired" || authErrorCode === "token_expired";
    console.warn("Supabase rejected an email authentication link.", {
      flow,
      expired,
      errorCode:
        authErrorCode && /^[a-z0-9_-]{1,64}$/i.test(authErrorCode)
          ? authErrorCode
          : undefined,
    });
    return getFailureRedirect(request, flow, expired);
  }

  if (code && tokenHash) {
    console.warn("Auth callback received multiple verification credentials.", {
      flow,
    });
    return getFailureRedirect(request, flow, false);
  }

  if (!code && !tokenHash) {
    console.warn("Auth callback is missing a verification credential.", { flow });
    return getFailureRedirect(request, flow, false);
  }

  if (
    tokenHash &&
    type !== "recovery" &&
    type !== "signup" &&
    type !== "email"
  ) {
    console.warn("Auth callback received an unsupported token type.", { flow });
    return getFailureRedirect(request, flow, false);
  }

  const supabase = await createClient();
  const verificationType: VerificationType =
    type === "recovery" ? "recovery" : type === "email" ? "email" : "signup";

  let method: "code_exchange" | "token_hash";
  let error: { code?: string; status?: number } | null = null;
  if (code) {
    method = "code_exchange";
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash) {
    method = "token_hash";
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: verificationType,
    }));
  } else {
    console.warn("Auth callback is missing a verification credential.", { flow });
    return getFailureRedirect(request, flow, false);
  }

  if (error) {
    const details = getSafeErrorDetails(error);
    const expired =
      details.code === "otp_expired" ||
      details.code === "token_expired" ||
      details.status === 410;
    console.error("Auth callback verification failed.", {
      flow,
      method,
      ...details,
    });
    return getFailureRedirect(request, flow, expired);
  }

  console.info("Auth callback verification succeeded.", {
    flow,
    method,
  });

  const destination =
    flow === "recovery"
      ? "/reset-password"
      : flow === "signup"
        ? "/"
        : searchParams.get("next")?.startsWith("/") &&
            !searchParams.get("next")?.startsWith("//")
          ? searchParams.get("next")!
          : "/";

  return NextResponse.redirect(new URL(destination, request.url));
}
