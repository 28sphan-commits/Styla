import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  const { data: item, error: readError } = await supabase
    .from("wardrobe_items")
    .select("id, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (readError || !item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", item.id)
    .eq("user_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase.storage.from("wardrobe-items").remove([item.storage_path]);

  return NextResponse.json({ ok: true });
}
