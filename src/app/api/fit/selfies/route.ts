// Multi-angle reference photos for the personal mannequin. Backs the fitting
// room's selfie gallery: a flexible, ordered array (NOT fixed angle slots). The
// lowest sort_order is the "primary" — the face source for the swap.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const BUCKET = "fit-models";
const SIGNED_TTL = 60 * 60;
const MAX_BYTES = 10 * 1024 * 1024;

type SelfieDTO = { id: string; url: string | null; label: string | null; primary: boolean };

function extOf(type: string): string {
  return type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
}

// Resolve the authenticated Pro/Elite user, or a NextResponse to return early.
async function proUser(
  supabase: SupabaseClient
): Promise<{ user: User } | { response: NextResponse }> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.membership_tier !== "pro" && profile?.membership_tier !== "elite") {
    return {
      response: NextResponse.json(
        { error: "The fitting room is a Pro feature.", upgrade: true },
        { status: 403 }
      )
    };
  }
  return { user };
}

// Signed list of a user's selfies, ordered; the first is the primary.
async function listSelfies(supabase: SupabaseClient, userId: string): Promise<SelfieDTO[]> {
  const { data } = await supabase
    .from("fit_selfies")
    .select("id, storage_path, label, sort_order, created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const out: SelfieDTO[] = [];
  for (let i = 0; i < rows.length; i++) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(rows[i].storage_path, SIGNED_TTL);
    out.push({
      id: rows[i].id,
      url: signed?.signedUrl ?? null,
      label: rows[i].label,
      primary: i === 0
    });
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const auth = await proUser(supabase);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ selfies: await listSelfies(supabase, auth.user.id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const auth = await proUser(supabase);
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const formData = await request.formData();
  const files = formData.getAll("selfie").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "No photos provided." }, { status: 400 });
  }
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Each photo must be an image." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Each photo must be 10MB or smaller." }, { status: 400 });
    }
  }

  // Append after any existing photos.
  const { data: last } = await supabase
    .from("fit_selfies")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = (last?.sort_order ?? -1) + 1;

  for (const file of files) {
    const path = `${userId}/selfies/${crypto.randomUUID()}.${extOf(file.type)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    await supabase
      .from("fit_selfies")
      .insert({ user_id: userId, storage_path: path, sort_order: next });
    next++;
  }

  return NextResponse.json({ selfies: await listSelfies(supabase, userId) });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const auth = await proUser(supabase);
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { data: row } = await supabase
    .from("fit_selfies")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  await supabase.from("fit_selfies").delete().eq("id", id).eq("user_id", userId);

  return NextResponse.json({ selfies: await listSelfies(supabase, userId) });
}

// Make a photo the primary face source by floating it below all others.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const auth = await proUser(supabase);
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { data: top } = await supabase
    .from("fit_selfies")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("fit_selfies")
    .update({ sort_order: (top?.sort_order ?? 0) - 1 })
    .eq("id", id)
    .eq("user_id", userId);

  return NextResponse.json({ selfies: await listSelfies(supabase, userId) });
}
