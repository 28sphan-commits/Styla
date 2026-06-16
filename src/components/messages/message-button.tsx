"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

type MessageButtonProps = {
  profileId: string;
  disabled?: boolean;
};

export function MessageButton({ profileId, disabled = false }: MessageButtonProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  async function startConversation() {
    if (disabled || isStarting) return;
    setIsStarting(true);

    try {
      const response = await fetch("/api/messages/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start this message.");
      }

      router.push(`/messages/${payload.conversationId}`);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <button
      className="follow-button message-profile-button"
      type="button"
      disabled={disabled || isStarting}
      onClick={() => void startConversation()}
    >
      <MessageCircle size={13} aria-hidden="true" />
      {isStarting ? "Opening" : "Message"}
    </button>
  );
}
