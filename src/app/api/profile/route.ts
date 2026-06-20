import { NextResponse } from "next/server";
import { profileUpdateSchema } from "@/lib/profile/schema";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

function formBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on";
}

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const formData = await request.formData();
  const parsed = profileUpdateSchema.safeParse({
    username: formData.get("username"),
    bio: formData.get("bio") ?? "",
    is_public: formBoolean(formData.get("is_public")),
    show_outfits: formBoolean(formData.get("show_outfits")),
    membership_tier: formData.get("membership_tier") ?? "free",
    style_aesthetic: formData.get("style_aesthetic"),
    body_type: formData.get("body_type"),
    lifestyle: formData.get("lifestyle"),
    budget_per_item: formData.get("budget_per_item"),
    color_preference: formData.get("color_preference")
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Could not save profile." },
      { status: 400 }
    );
  }

  // Moderate username (block any profanity — can't mask an identifier) and bio
  // (mild language is censored, severe blocks + strikes).
  const moderation = await enforceModeration(supabase, [
    { value: parsed.data.username ?? "", block: true },
    { value: parsed.data.bio }
  ]);
  if (!moderation.ok) {
    return NextResponse.json(
      { error: moderation.error, banned: moderation.banned },
      { status: moderation.status }
    );
  }
  const [, cleanBio] = moderation.values;

  let avatarUrl: string | null = null;
  const avatar = formData.get("avatar");

  if (avatar instanceof File && avatar.size > 0) {
    if (!avatar.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Profile photo must be an image." },
        { status: 400 }
      );
    }

    if (avatar.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Profile photo must be 5MB or smaller." },
        { status: 400 }
      );
    }

    const extension = avatar.type === "image/jpeg" ? "jpg" : "png";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(path, avatar, {
        contentType: avatar.type || "image/png",
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    avatarUrl = publicUrl;
  }

  const profilePayload = {
    id: user.id,
    email: user.email,
    username: parsed.data.username,
    bio: cleanBio,
    membership_tier: parsed.data.membership_tier,
    is_public: parsed.data.is_public,
    show_outfits: parsed.data.show_outfits,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    updated_at: new Date().toISOString()
  };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(profilePayload)
    .select("*")
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { data: styleDna, error: styleDnaError } = await supabase
    .from("style_dna")
    .upsert({
      user_id: user.id,
      style_aesthetic: parsed.data.style_aesthetic,
      body_type: parsed.data.body_type,
      lifestyle: parsed.data.lifestyle,
      budget_per_item: parsed.data.budget_per_item,
      color_preference: parsed.data.color_preference,
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (styleDnaError) {
    return NextResponse.json({ error: styleDnaError.message }, { status: 500 });
  }

  return NextResponse.json({ profile, styleDna });
}
