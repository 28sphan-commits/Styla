"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button className="nav-action" type="button" onClick={signOut}>
      <LogOut size={12} aria-hidden="true" />
      <span>Sign out</span>
    </button>
  );
}
