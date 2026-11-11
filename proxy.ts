import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./lib/supabase/config";
import type { Database } from "./lib/supabase/database.types";

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/capture/")
  );
}

function copyAuthResponse(source: NextResponse, destination: NextResponse) {
  source.cookies.getAll().forEach((cookie) => destination.cookies.set(cookie));

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) {
      destination.headers.set(header, value);
    }
  }

  return destination;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);

  if (pathname === "/auth/callback") {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
    if (isPublic) {
      return NextResponse.next({ request });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const { url, publishableKey } = getSupabaseConfig();
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();

  if (error && !isPublic) {
    return NextResponse.json(
      { error: "We could not verify your session. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const isSignedIn = Boolean(data?.claims);

  if (!isSignedIn && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return copyAuthResponse(
      supabaseResponse,
      NextResponse.redirect(loginUrl)
    );
  }

  if (isSignedIn && pathname === "/login") {
    return copyAuthResponse(
      supabaseResponse,
      NextResponse.redirect(new URL("/", request.url))
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
