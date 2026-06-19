import Link from "next/link";
import { Shirt, Users } from "lucide-react";
import type { PublicProfile } from "@/lib/social/schema";
import { FollowButton } from "@/components/social/follow-button";

type ProfileGridProps = {
  profiles: PublicProfile[];
  currentUserId: string;
};

export function ProfileGrid({ profiles, currentUserId }: ProfileGridProps) {
  if (!profiles.length) {
    return (
      <div className="empty-wardrobe social-empty">
        <Users size={18} aria-hidden="true" />
        <strong>No profiles found</strong>
        <span>Try a different search or explore the public outfit feed.</span>
      </div>
    );
  }

  return (
    <div className="profile-result-grid">
      {profiles.map((profile) => (
        <article className="profile-result-card" key={profile.id}>
          <Link href={`/u/${profile.username}`} className="profile-result-link">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span>{profile.username?.slice(0, 1).toUpperCase() ?? "S"}</span>
            )}
            <div>
              <strong>@{profile.username}</strong>
            </div>
          </Link>
          <p>{profile.bio || "Curating a sharper wardrobe with Styla."}</p>
          <div className="profile-mini-metrics">
            <span>
              <Shirt size={12} aria-hidden="true" />
              {profile.outfit_count} looks
            </span>
            <span>
              <Users size={12} aria-hidden="true" />
              {profile.follower_count} followers
            </span>
          </div>
          <FollowButton
            profileId={profile.id}
            initialFollowing={profile.is_following}
            disabled={profile.id === currentUserId}
          />
        </article>
      ))}
    </div>
  );
}
