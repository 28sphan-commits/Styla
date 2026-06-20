"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, X } from "lucide-react";
import type { PublicProfile } from "@/lib/social/schema";

type FriendsStatProps = {
  friends: PublicProfile[];
};

// The "Friends" stat in the explore hero. Counts mutual follows (computed
// server-side) and opens a modal listing those friends on click.
export function FriendsStat({ friends }: FriendsStatProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mini-stat-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <strong>{friends.length}</strong>
        Friends
      </button>

      {open ? (
        <div
          className="friends-modal-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="friends-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Your friends"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="friends-modal-head">
              <div>
                <Users size={16} aria-hidden="true" />
                <h2>Friends</h2>
                <span>{friends.length}</span>
              </div>
              <button
                type="button"
                className="friends-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            {friends.length ? (
              <ul className="friends-list">
                {friends.map((friend) => (
                  <li key={friend.id}>
                    <Link
                      href={`/u/${friend.username}`}
                      className="friends-list-row"
                      onClick={() => setOpen(false)}
                    >
                      {friend.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={friend.avatar_url} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="friends-avatar">
                          {friend.username?.slice(0, 1).toUpperCase() ?? "S"}
                        </span>
                      )}
                      <div>
                        <strong>@{friend.username}</strong>
                        <small>{friend.follower_count} followers</small>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="friends-empty">
                No mutual friends yet. When you and someone follow each other,
                they&apos;ll show up here.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
