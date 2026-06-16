import { NextResponse } from "next/server";
import {
  generatedOutfitsSchema,
  outfitInputSchema,
  type GeneratedLook,
  type GeneratedOutfits
} from "@/lib/outfits/schema";
import { createClient } from "@/lib/supabase/server";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function cleanJson(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeLook(
  rawLook: unknown,
  index: number,
  validItemIds: Set<string>,
  fallbackIds: string[]
): GeneratedLook {
  const candidate =
    rawLook && typeof rawLook === "object"
      ? (rawLook as Record<string, unknown>)
      : {};

  const itemIds = Array.isArray(candidate.itemIds)
    ? Array.from(
        new Set(
          candidate.itemIds.filter(
            (itemId): itemId is string =>
              typeof itemId === "string" && validItemIds.has(itemId)
          )
        )
      )
    : [];

  const safeItemIds = itemIds.length ? itemIds : fallbackIds;

  return {
    title: asString(candidate.title, `Look 0${index + 1}`),
    itemIds: safeItemIds,
    pieceCount: safeItemIds.length,
    description: asString(
      candidate.description,
      "This look uses the pieces available in your wardrobe and balances the selected occasion, mood, and weather. Add more wardrobe items over time for sharper outfit variety."
    )
  };
}

function normalizeGeneratedOutfits(
  payload: unknown,
  wardrobeItems: WardrobeItem[]
): GeneratedOutfits {
  const validItemIds = new Set(wardrobeItems.map((item) => item.id));
  const fallbackIds = wardrobeItems.slice(0, Math.min(3, wardrobeItems.length)).map((item) => item.id);
  const candidate =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawLooks = Array.isArray(candidate.looks) ? candidate.looks : [];
  const looks = [0, 1, 2].map((index) =>
    normalizeLook(rawLooks[index], index, validItemIds, fallbackIds)
  );

  return generatedOutfitsSchema.parse({ looks });
}

async function generateWithGemini({
  input,
  wardrobeItems,
  styleDna,
  savedOutfits
}: {
  input: { occasion: string; mood: string; weather: string };
  wardrobeItems: WardrobeItem[];
  styleDna: unknown;
  savedOutfits: unknown[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

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
                "You are Styla, a personal AI fashion advisor. Generate exactly three complete outfits using only the user's wardrobe item ids. " +
                "Every response is stateless, so use the full context below. Never invent wardrobe items. If the wardrobe is sparse, reuse pieces creatively and explain what would improve the look. " +
                "Weather logic matters most: hot avoids heavy outerwear, cold prioritizes layers, rainy prefers outerwear and closed shoes, mild is flexible. " +
                "Avoid pairing multiple graphic pieces unless the mood is bold or creative. Return only strict JSON with this shape: " +
                "{\"looks\":[{\"title\":\"Look 01\",\"itemIds\":[\"uuid\"],\"pieceCount\":2,\"description\":\"detailed styling paragraph\"}]}.\n\n" +
                JSON.stringify(
                  {
                    selections: input,
                    styleDna,
                    wardrobeItems: wardrobeItems.map((item) => ({
                      id: item.id,
                      name: item.name,
                      type: item.type,
                      color: item.color,
                      pattern: item.pattern,
                      formality: item.formality,
                      season: item.season
                    })),
                    savedOutfits
                  },
                  null,
                  2
                )
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.65,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini outfit generation failed: ${detail}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("Gemini did not return outfit JSON.");
  }

  return normalizeGeneratedOutfits(JSON.parse(cleanJson(text)), wardrobeItems);
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

  const parsedInput = outfitInputSchema.safeParse(await request.json());

  if (!parsedInput.success) {
    return NextResponse.json(
      { error: "Choose one occasion, mood, and weather." },
      { status: 400 }
    );
  }

  const { data: wardrobeItems, error: wardrobeError } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (wardrobeError) {
    return NextResponse.json({ error: wardrobeError.message }, { status: 500 });
  }

  if (!wardrobeItems?.length) {
    return NextResponse.json(
      { error: "Add at least one wardrobe item before generating outfits." },
      { status: 400 }
    );
  }

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: savedOutfits } = await supabase
    .from("outfits")
    .select("occasion, mood, weather, title, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  try {
    const generated = await generateWithGemini({
      input: parsedInput.data,
      wardrobeItems: wardrobeItems as WardrobeItem[],
      styleDna,
      savedOutfits: savedOutfits ?? []
    });

    const itemById = new Map(
      (wardrobeItems as WardrobeItem[]).map((item) => [item.id, item])
    );

    return NextResponse.json({
      looks: generated.looks.map((look) => ({
        ...look,
        pieceCount: look.itemIds.length,
        items: look.itemIds.map((itemId) => itemById.get(itemId)).filter(Boolean)
      }))
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate outfits right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
