import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl
} from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request
  });

  if (!isSupabaseConfigured) {
    return response;
  }

  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof response.cookies.set>[2];
  };

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.getClaims();
  return response;
}
