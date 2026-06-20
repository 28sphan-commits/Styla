import { NextResponse } from "next/server";
import {
  outfitCheckInputSchema,
  outfitCheckResultSchema,
  type OutfitCheckResult
} from "@/lib/outfit-check/schema";
import { STYLE_EVOLUTION_RULE } from "@/lib/ai/style-context";
import { enforceModeration } from "@/lib/moderation/enforce";
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

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return strings.length ? strings : fallback;
}

function normalizeResult(payload: unknown): OutfitCheckResult {
  const candidate =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawScore = Number(candidate.score);
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 70;

  return outfitCheckResultSchema.parse({
    score,
    summary: asString(
      candidate.summary,
      "This outfit has a clear direction, but it would benefit from a few styling refinements to better match the selected goal."
    ),
    strengths: asStringArray(candidate.strengths, [
      "The outfit has a readable overall style direction."
    ]),
    fixes: asStringArray(candidate.fixes, [
      "Refine one detail such as proportion, color balance, or footwear to make the outfit feel more intentional."
    ]),
    missingPieces: asStringArray(candidate.missingPieces, []),
    colorNotes: asString(
      candidate.colorNotes,
      "The color palette is readable, with room to sharpen contrast or cohesion."
    ),
    fitNotes: asString(
      candidate.fitNotes,
      "The proportions can be tuned further based on the intended style goal."
    )
  });
}

async function checkWithGemini({
  image,
  styleGoal,
  userNotes,
  styleDna,
  wardrobeItems,
  savedOutfits
}: {
  image: File;
  styleGoal: string;
  userNotes: string;
  styleDna: unknown;
  wardrobeItems: WardrobeItem[];
  savedOutfits: unknown[];
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const imageBytes = Buffer.from(await image.arrayBuffer()).toString("base64");

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
                "You are Styla, an honest AI fashion advisor. Evaluate the uploaded outfit photo against the selected style goal. " +
                "Be specific and useful. Comment on color coordination, cohesion, fit/proportion, goal alignment, and realistic improvements. " +
                "Use the user's Style DNA and wardrobe context where relevant, but evaluate the photo itself. " +
                STYLE_EVOLUTION_RULE +
                (userNotes
                  ? `The user added this specific context about what they want checked — treat it as their direct intent and address it head-on in your summary and fixes: "${userNotes}". `
                  : "") +
                "Keep every field concise and within these character limits: summary 500, each strength 180, each fix 220, each missing piece 120, colorNotes 260, fitNotes 260. Provide 1 to 4 strengths and 1 to 4 fixes. " +
                "Return only strict JSON: {\"score\": number 0-100, \"summary\": string, \"strengths\": string[], \"fixes\": string[], \"missingPieces\": string[], \"colorNotes\": string, \"fitNotes\": string}.\n\n" +
                JSON.stringify(
                  {
                    styleGoal,
                    userNotes,
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
            },
            {
              inlineData: {
                mimeType: image.type || "image/jpeg",
                data: imageBytes
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini outfit check failed: ${detail}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== "string") {
    throw new Error("Gemini did not return outfit check JSON.");
  }

  return normalizeResult(JSON.parse(cleanJson(text)));
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
  const image = formData.get("image");
  const parsedInput = outfitCheckInputSchema.safeParse({
    styleGoal: formData.get("styleGoal"),
    userNotes: formData.get("userNotes") ?? undefined
  });

  if (!parsedInput.success) {
    return NextResponse.json({ error: "Choose a style goal." }, { status: 400 });
  }

  // Moderate the freewrite context before it reaches Gemini.
  const moderation = await enforceModeration(supabase, [
    { value: parsedInput.data.userNotes }
  ]);
  if (!moderation.ok) {
    return NextResponse.json(
      { error: moderation.error, banned: moderation.banned },
      { status: moderation.status }
    );
  }
  const cleanNotes = moderation.values[0];

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Outfit photo is required." }, { status: 400 });
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 });
  }

  if (image.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be 10MB or smaller." }, { status: 400 });
  }

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: wardrobeItems } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: savedOutfits } = await supabase
    .from("outfits")
    .select("occasion, mood, weather, title, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  try {
    const result = await checkWithGemini({
      image,
      styleGoal: parsedInput.data.styleGoal,
      userNotes: cleanNotes,
      styleDna,
      wardrobeItems: (wardrobeItems ?? []) as WardrobeItem[],
      savedOutfits: savedOutfits ?? []
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not check this outfit right now.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
