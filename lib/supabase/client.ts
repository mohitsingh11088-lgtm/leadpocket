"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
