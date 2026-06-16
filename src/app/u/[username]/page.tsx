import Link from "next/link";
import { notFound } from "next/navigation";
import { Shirt, Sparkles, Users } from "lucide-react";
import { MessageButton } from "@/components/messages/message-button";
import { FollowButton } from "@/components/social/follow-button";
import { OutfitFeed } from "@/components/social/outfit-feed";
import {
  loadPublicOutfitsForProfile,
  loadPublicProfileByUsername
} from "@/lib/outfits/loaders";
import { createClient } from "@/lib/supabase/server";

type PublicProfilePageProps = {
  params: Promise<{ username: string }>;
};

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const supabase = await createClient();

  if (!supabase) {
    notFound();
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { username } = await params;
  const profile = await loadPublicProfileByUsername(
    supabase,
    user?.id ?? null,
    decodeURIComponent(username)
  );

  if (!profile || !profile.username) {
    notFound();
  }

  const outfits = await loadPublicOutfitsForProfile(
    supabase,
    user?.id ?? null,
    profile.id
  );

  const isSelf = user?.id === profile.id;

  return (
    <main className="public-profile-page">
      <header className="shared-outfit-header">
        <Link className="brand-lockup" href={user ? "/explore" : "/login"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo-img" src="/styla-logo.png" alt="" />
          <span>Styla</span>
        </Link>
        <Link href={user ? "/explore" : "/login"}>{user ? "Back to Explore" : "Sign In"}</Link>
      </header>

      <section className="public-profile-shell">
        <div className="public-profile-hero">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="public-avatar" src={profile.avatar_url} alt="" />
          ) : (
            <div className="public-avatar">{profile.username.slice(0, 1).toUpperCase()}</div>
          )}

          <div>
            <div className="section-kicker">Public Profile</div>
            <h1>@{profile.username}</h1>
            <p>{profile.bio || "Curating a sharper wardrobe with Styla."}</p>
            <div className="public-profile-actions">
              {user ? (
                <>
                  <FollowButton
                    profileId={profile.id}
                    initialFollowing={profile.is_following}
                    disabled={isSelf}
                  />
                  <MessageButton profileId={profile.id} disabled={isSelf} />
                </>
              ) : (
                <Link className="follow-button" href="/login">
                  <Sparkles size={13} aria-hidden="true" />
                  Sign in to message
                </Link>
              )}
              {isSelf ? (
                <Link className="follow-button is-active" href="/profile">
                  Edit Profile
                </Link>
              ) : null}
            </div>
          </div>

          <div className="public-profile-stats">
            <span>
              <Shirt size={14} aria-hidden="true" />
              <strong>{profile.outfit_count}</strong>
              Looks
            </span>
            <span>
              <Users size={14} aria-hidden="true" />
              <strong>{profile.follower_count}</strong>
              Followers
            </span>
            <span>
              <Users size={14} aria-hidden="true" />
              <strong>{profile.following_count}</strong>
              Following
            </span>
          </div>
        </div>

        <div className="rule" />

        <section className="social-section">
          <div className="social-section-heading">
            <div>
              <div className="section-kicker">Shared Wardrobe</div>
              <h2>Public Looks</h2>
            </div>
          </div>
          <OutfitFeed
            outfits={outfits}
            canInteract={Boolean(user)}
            emptyTitle="No public outfits yet"
            emptyText="This profile has not shared any saved looks."
          />
        </section>
      </section>
    </main>
  );
}
