import { redirect } from "next/navigation";

// The dedicated Chat page was replaced by the floating Styla stylist widget,
// mounted app-wide in the protected layout. Keep the route as a redirect so any
// old /chat links still resolve.
export default function ChatPage() {
  redirect("/explore");
}
