import { NextResponse } from "next/server";
import { chatRequestSchema, type ChatMessage } from "@/lib/chat/schema";
import { createClient } from "@/lib/supabase/server";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function trimAnswer(value: unknown) {
  const answer =
    typeof value === "string" && value.trim()
      ? value.trim()
      : "I could not form a good style answer this time. Try asking again with a little more detail.";

  return answer.length > 3800 ? `${answer.slice(0, 3800)}...` : answer;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Could not send this chat message.";
}

async function askGemini({
  message,
  wardrobeItems,
  styleDna,
  savedOutfits,
  recentMessages
}: {
  message: string;
  wardrobeItems: WardrobeItem[];
  styleDna: unknown;
  savedOutfits: unknown[];
  recentMessages: Pick<ChatMessage, "role" | "content" | "created_at">[];
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
                "You are Styla, a practical AI fashion advisor. Answer conversationally and specifically using the user's actual wardrobe whenever relevant. " +
                "Every request is stateless, so use all context below. If the user asks what to wear, suggest real item names from wardrobeItems. " +
                "If the wardrobe is missing something, say what is missing and how to work around it. Keep answers concise but useful. " +
                "Do not claim to see images unless they are described in the wardrobe metadata. Do not invent owned clothing.\n\n" +
                JSON.stringify(
                  {
                    userMessage: message,
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
                    savedOutfits,
                    recentMessages
                  },
                  null,
                  2
                )
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.55
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini chat failed: ${detail}`);
  }

  const data = await response.json();
  return trimAnswer(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

export async function GET() {
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

  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }

  return NextResponse.json({
    messages: ((data ?? []) as ChatMessage[]).reverse()
  });
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

  const parsed = chatRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send a message between 1 and 1600 characters." },
      { status: 400 }
    );
  }

  try {
    const [
      wardrobeResult,
      styleDnaResult,
      savedOutfitsResult,
      recentMessagesResult
    ] = await Promise.all([
      supabase
        .from("wardrobe_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("style_dna").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("outfits")
        .select("occasion, mood, weather, title, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12)
    ]);

    if (wardrobeResult.error) throw wardrobeResult.error;
    if (styleDnaResult.error) throw styleDnaResult.error;
    if (savedOutfitsResult.error) throw savedOutfitsResult.error;
    if (recentMessagesResult.error) throw recentMessagesResult.error;

    const answer = await askGemini({
      message: parsed.data.message,
      wardrobeItems: (wardrobeResult.data ?? []) as WardrobeItem[],
      styleDna: styleDnaResult.data,
      savedOutfits: savedOutfitsResult.data ?? [],
      recentMessages: ((recentMessagesResult.data ?? []) as Pick<
        ChatMessage,
        "role" | "content" | "created_at"
      >[]).reverse()
    });

    const now = new Date().toISOString();
    const { data: insertedMessages, error: insertError } = await supabase
      .from("chat_messages")
      .insert([
        {
          user_id: user.id,
          role: "user",
          content: parsed.data.message,
          created_at: now
        },
        {
          user_id: user.id,
          role: "assistant",
          content: answer,
          created_at: new Date(Date.now() + 1).toISOString()
        }
      ])
      .select("*");

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      messages: insertedMessages,
      answer
    });
  } catch (error) {
    console.error("Chat request failed", error);

    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
