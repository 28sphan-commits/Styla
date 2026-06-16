import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl
} from "@/lib/supabase/config";

export async function createClient() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const cookieStore = await cookies();
  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  };

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies; route handlers and middleware can.
        }
      }
    }
  });
}
