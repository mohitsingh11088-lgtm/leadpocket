const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseConfig() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local, add your project URL and publishable key, then restart the app."
    );
  }

  return {
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
  };
}
