import { NextResponse } from "next/server";
import { GEMINI_MODELS, geminiEndpoint } from "@/lib/ai/models";
import { logGeminiUsage } from "@/lib/ai/usage";
import {
  wardrobeItemAiSchema,
  type WardrobeItemAi
} from "@/lib/wardrobe/schema";
import { createClient } from "@/lib/supabase/server";
import { BASE_FREE_UPLOADS, MAX_FREE_UPLOADS } from "@/lib/quests/catalog";

const GEMINI_MODEL = GEMINI_MODELS.categorize;
const GEMINI_ENDPOINT = geminiEndpoint(GEMINI_MODEL);

function cleanJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return [value.trim().toLowerCase()].filter(Boolean);
  }

  return [];
}

function normalizeAiPayload(payload: unknown): WardrobeItemAi {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini returned an invalid clothing item payload.");
  }

  const candidate = payload as Record<string, unknown>;

  return {
    name:
      typeof candidate.name === "string"
        ? candidate.name.trim()
        : "Clothing Item",
    type: asStringArray(candidate.type) as WardrobeItemAi["type"],
    color: asStringArray(candidate.color) as WardrobeItemAi["color"],
    pattern: asStringArray(candidate.pattern) as WardrobeItemAi["pattern"],
    formality: asStringArray(candidate.formality) as WardrobeItemAi["formality"],
    season: asStringArray(candidate.season) as WardrobeItemAi["season"]
  };
}

async function categorizeWithGemini(file: File) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const imageBytes = Buffer.from(await file.arrayBuffer()).toString("base64");

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Analyze this single clothing item. Return only strict JSON with lowercase enum values. " +
                "Schema: {\"name\": string, \"type\": [one of top,bottom,shoes,outerwear,dress,activewear,accessory,swimwear,bag,hat,jewelry], " +
                "\"color\": [one or more of black,white,navy,beige,red,olive,grey,brown,pink,blue,off-white,green,yellow,purple,orange,cream,tan,burgundy], " +
                "\"pattern\": [solid or graphic], \"formality\": [very casual, casual, or formal], " +
                "\"season\": [one or more of spring,summer,fall,winter]}. " +
                "Pick one type, one pattern, and one formality. Do not include markdown."
            },
            {
              inlineData: {
                mimeType: file.type || "image/png",
                data: imageBytes
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini categorization failed: ${detail}`);
  }

  const data = await response.json();
  logGeminiUsage("categorize", GEMINI_MODEL, data);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("Gemini did not return a text JSON payload.");
  }

  const parsedJson = JSON.parse(cleanJson(text));
  const normalized = normalizeAiPayload(parsedJson);
  return wardrobeItemAiSchema.parse(normalized);
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

  // Free members are capped at BASE_FREE_UPLOADS, raised toward MAX_FREE_UPLOADS
  // by wardrobe slots earned through quests. Paid tiers are unlimited.
  const { data: tierRow } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();

  if ((tierRow?.membership_tier ?? "free") === "free") {
    // wardrobe_bonus_slots may not exist until the quests migration runs.
    const { data: bonusRow } = await supabase
      .from("profiles")
      .select("wardrobe_bonus_slots")
      .eq("id", user.id)
      .maybeSingle();
    const bonus = (bonusRow as { wardrobe_bonus_slots?: number } | null)
      ?.wardrobe_bonus_slots ?? 0;
    const cap = Math.min(MAX_FREE_UPLOADS, BASE_FREE_UPLOADS + bonus);

    const { count } = await supabase
      .from("wardrobe_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= cap) {
      return NextResponse.json(
        {
          error: `You've reached your wardrobe limit of ${cap} items. Complete quests to earn more upload slots.`,
          limitReached: true,
          cap
        },
        { status: 403 }
      );
    }
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 });
  }

  if (image.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be 10MB or smaller." }, { status: 400 });
  }

  try {
    const ai = await categorizeWithGemini(image);
    const extensionByType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/png": "png"
    };
    const extension = extensionByType[image.type] ?? "png";
    const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("wardrobe-items")
      .upload(storagePath, image, {
        contentType: image.type || "image/png",
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: { publicUrl }
    } = supabase.storage.from("wardrobe-items").getPublicUrl(storagePath);

    const { data: item, error: insertError } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: user.id,
        name: ai.name,
        type: ai.type,
        color: ai.color,
        pattern: ai.pattern,
        formality: ai.formality,
        season: ai.season,
        image_url: publicUrl,
        storage_path: storagePath,
        original_filename: image.name,
        ai_model: GEMINI_MODEL
      })
      .select("*")
      .single();

    if (insertError) {
      await supabase.storage.from("wardrobe-items").remove([storagePath]);
      throw insertError;
    }

    return NextResponse.json({ item });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not categorize this clothing item.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
