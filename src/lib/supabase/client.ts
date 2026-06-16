"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl
} from "@/lib/supabase/config";

export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
