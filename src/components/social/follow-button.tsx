"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

type FollowButtonProps = {
  profileId: string;
  initialFollowing: boolean;
  disabled?: boolean;
};

export function FollowButton({
  profileId,
  initialFollowing,
  disabled = false
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [isSaving, setIsSaving] = useState(false);

  async function toggleFollow() {
    if (disabled || isSaving) return;

    const previous = isFollowing;
    setIsFollowing(!previous);
    setIsSaving(true);

    try {
      const response = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update follow.");
      }

      setIsFollowing(payload.active);
    } catch {
      setIsFollowing(previous);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      className={isFollowing ? "follow-button is-active" : "follow-button"}
      type="button"
      disabled={disabled || isSaving}
      onClick={() => void toggleFollow()}
    >
      {isFollowing ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
