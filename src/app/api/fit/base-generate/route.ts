import { NextResponse } from "next/server";
import { z } from "zod";
import { baseModelCatalog } from "@/lib/fit/base-library";
import { ensureBaseImage } from "@/lib/fit/base-generator";
import { isReplicateConfigured } from "@/lib/fit/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Generation polls Replicate to completion, so allow a long-running request.
export const maxDuration = 300;

const VALID_KEYS = new Set(baseModelCatalog().map((e) => e.key));

const bodySchema = z.object({
  key: z.string(),
  force: z.boolean().optional()
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success || !VALID_KEYS.has(parsed.data.key)) {
    return NextResponse.json({ error: "Invalid base key." }, { status: 400 });
  }

  if (!isReplicateConfigured()) {
    return NextResponse.json(
      { error: "Replicate is not configured — set REPLICATE_API_TOKEN." },
      { status: 503 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY to enable base generation." },
      { status: 503 }
    );
  }

  try {
    const result = await ensureBaseImage(admin, parsed.data.key, {
      force: parsed.data.force
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
