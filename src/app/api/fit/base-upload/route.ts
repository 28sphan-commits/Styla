import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { baseModelCatalog } from "@/lib/fit/base-library";
import { createClient } from "@/lib/supabase/server";

const VALID_KEYS = new Set(baseModelCatalog().map((e) => e.key));
const BASE_BUCKET = "fit-base";

export async function POST(request: Request) {
  // Must be authenticated.
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const formData = await request.formData();
  const key = formData.get("key") as string | null;
  const file = formData.get("file") as File | null;

  if (!key || !VALID_KEYS.has(key)) {
    return NextResponse.json({ error: "Invalid base key." }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, or WebP files are accepted." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 15 MB." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Store as {key}.png — Supabase serves the correct Content-Type set at upload
    // regardless of the filename extension, so JPEG/WebP uploads work fine here.
    const { error } = await admin.storage.from(BASE_BUCKET).upload(`${key}.png`, bytes, {
      contentType: file.type,
      upsert: true
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
