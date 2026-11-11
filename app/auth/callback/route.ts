import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const isRecovery = request.nextUrl.searchParams.get("next") === "/reset-password";

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.redirect(new URL("/login?setup=required", request.url));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        isRecovery ? "/login?error=recovery" : "/login?error=confirmation",
        request.url
      )
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        isRecovery ? "/login?error=recovery" : "/login?error=confirmation",
        request.url
      )
    );
  }

  const nextPath = request.nextUrl.searchParams.get("next");
  const destination =
    nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  return NextResponse.redirect(new URL(destination, request.url));
}
