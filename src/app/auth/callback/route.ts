import { NextResponse } from "next/server";
import { destinationForUser } from "@/lib/supabase/post-auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/explore";
  const supabase = await createClient();

  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?auth=error", request.url));
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const metadata = user.user_metadata ?? {};

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    full_name: metadata.full_name ?? metadata.name ?? null,
    avatar_url: metadata.avatar_url ?? metadata.picture ?? null,
    updated_at: new Date().toISOString()
  });

  const destination = await destinationForUser(supabase, user.id, next);

  return NextResponse.redirect(new URL(destination, request.url));
}
