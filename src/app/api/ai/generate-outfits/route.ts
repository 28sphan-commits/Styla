import { NextResponse } from "next/server";
import {
  generateRequestSchema,
  generatedOutfitsSchema,
  outfitInputSchema,
  type GenerateChatMessage,
  type GeneratedLook,
  type OutfitInput
} from "@/lib/outfits/schema";
import { STYLE_EVOLUTION_RULE } from "@/lib/ai/style-context";
import { createClient } from "@/lib/supabase/server";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DEFAULT_CONTEXT: OutfitInput = {
  occasion: "casual",
  mood: "confident",
  weather: "mild"
};

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
      "This look uses the pieces available in your wardrobe and balances the request. Add more wardrobe items over time for sharper outfit variety."
    )
  };
}

function normalizeContext(value: unknown): OutfitInput {
  const parsed = outfitInputSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_CONTEXT;
}

function normalizeGenerated(payload: unknown, wardrobeItems: WardrobeItem[]) {
  const validItemIds = new Set(wardrobeItems.map((item) => item.id));
  const fallbackIds = wardrobeItems
    .slice(0, Math.min(3, wardrobeItems.length))
    .map((item) => item.id);
  const candidate =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawLooks = Array.isArray(candidate.looks) ? candidate.looks : [];
  const looks = [0, 1, 2].map((index) =>
    normalizeLook(rawLooks[index], index, validItemIds, fallbackIds)
  );

  return {
    outfits: generatedOutfitsSchema.parse({ looks }),
    context: normalizeContext(candidate.context)
  };
}

function compactWardrobe(items: WardrobeItem[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    color: item.color,
    pattern: item.pattern,
    formality: item.formality,
    season: item.season
  }));
}

function buildContextJson(
  messages: GenerateChatMessage[],
  wardrobeItems: WardrobeItem[],
  styleDna: unknown,
  savedOutfits: unknown[]
) {
  return JSON.stringify(
    {
      conversation: messages,
      styleDna,
      wardrobeItems: compactWardrobe(wardrobeItems),
      savedOutfits
    },
    null,
    2
  );
}

async function callGemini(systemText: string, contextJson: string, asJson: boolean) {
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
      contents: [{ role: "user", parts: [{ text: `${systemText}\n\n${contextJson}` }] }],
      generationConfig: asJson
        ? { temperature: 0.65, response_mime_type: "application/json" }
        : { temperature: 0.6 }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed: ${detail}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

const TAG_NOTATION =
  "The user may include explicit, category-scoped tags written as #Category:Value (e.g. #Occasion:Date, #Mood:Confident, #Weather:Hot). " +
  "Treat each as an authoritative, unambiguous context parameter: the category before the colon defines the meaning, so #Weather:Hot is the weather and #Mood:Bold is the mood. " +
  "Never ask the user to clarify what such a value refers to. ";

const CHAT_SYSTEM =
  "You are Styla, a warm, sharp AI fashion stylist helping the user shape ONE outfit request through quick conversation. " +
  STYLE_EVOLUTION_RULE +
  TAG_NOTATION +
  "Reply in 1-3 short sentences: ask a single focused clarifying question about something NOT already provided, OR offer a concrete suggestion to refine details such as color palette, layers, or formality. " +
  "Reference their real wardrobe items and Style DNA where useful. Do not output JSON and do not produce a full outfit yet — just help them refine the request.";

function generateSystem(fillGaps: boolean) {
  return (
    "You are Styla, a personal AI fashion advisor. Using ONLY the user's wardrobe item ids, generate exactly three complete outfits that satisfy the request in the conversation below. " +
    STYLE_EVOLUTION_RULE +
    "Every response is stateless; use the full context. Never invent wardrobe items. If the wardrobe is sparse, reuse pieces creatively and explain what would improve the look. " +
    TAG_NOTATION +
    (fillGaps
      ? "The request may be sparse — use your best stylistic judgment to fill in ALL missing details (color palette, layers, formality, weather matching) without asking the user. "
      : "Use your best stylistic judgment to fill in any details the user did not specify. ") +
    "Weather logic matters: hot avoids heavy outerwear, cold prioritizes layers, rainy prefers outerwear and closed shoes, mild is flexible. Avoid pairing multiple graphic pieces unless the mood is bold or creative. " +
    "Also infer the single best occasion, mood, and weather for the overall request. " +
    "Return only strict JSON with this shape: " +
    '{"looks":[{"title":"Look 01","itemIds":["uuid"],"pieceCount":2,"description":"detailed styling paragraph"}],' +
    '"context":{"occasion":"casual|work|date|formal|workout|travel","mood":"confident|relaxed|bold|minimal|creative|classic","weather":"hot|cold|rainy|mild"}}.'
  );
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

  const parsed = generateRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Add a message to refine or generate an outfit." },
      { status: 400 }
    );
  }

  const { messages, mode, fillGaps } = parsed.data;

  const { data: wardrobeItems, error: wardrobeError } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (wardrobeError) {
    return NextResponse.json({ error: wardrobeError.message }, { status: 500 });
  }

  const [{ data: styleDna }, { data: savedOutfits }] = await Promise.all([
    supabase.from("style_dna").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("outfits")
      .select("occasion, mood, weather, title, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6)
  ]);

  const items = (wardrobeItems ?? []) as WardrobeItem[];
  const contextJson = buildContextJson(messages, items, styleDna, savedOutfits ?? []);

  try {
    if (mode === "chat") {
      const reply = (await callGemini(CHAT_SYSTEM, contextJson, false)).trim();
      return NextResponse.json({
        reply: reply || "Tell me a little more — occasion, vibe, or colors you're feeling?"
      });
    }

    if (!items.length) {
      return NextResponse.json(
        { error: "Add at least one wardrobe item before generating outfits." },
        { status: 400 }
      );
    }

    const text = await callGemini(generateSystem(Boolean(fillGaps)), contextJson, true);
    const { outfits, context } = normalizeGenerated(JSON.parse(cleanJson(text)), items);
    const itemById = new Map(items.map((item) => [item.id, item]));

    return NextResponse.json({
      context,
      looks: outfits.looks.map((look) => ({
        ...look,
        pieceCount: look.itemIds.length,
        items: look.itemIds.map((itemId) => itemById.get(itemId)).filter(Boolean)
      }))
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not complete that request right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
