import Link from "next/link";
import { Bookmark, Eye, Heart, Shirt, Zap } from "lucide-react";
import type { AuraLeaderboardEntry } from "@/lib/social/leaderboard";
import type { PublicOutfit } from "@/lib/social/schema";

type LeaderboardProps = {
  auraAvailable: boolean;
  aura: AuraLeaderboardEntry[];
  posts: PublicOutfit[];
};

export function Leaderboard({ auraAvailable, aura, posts }: LeaderboardProps) {
  return (
    <div className="leaderboard-grid">
      <section className="leaderboard-col">
        <div className="leaderboard-col-head">
          <span className="section-kicker">
            <Zap size={12} aria-hidden="true" /> Aura
          </span>
          <h2>Top Aura</h2>
        </div>

        {!auraAvailable ? (
          <div className="empty-wardrobe social-empty">
            <Zap size={18} aria-hidden="true" />
            <strong>Aura activates soon</strong>
            <span>Apply the quests migration to start the aura leaderboard.</span>
          </div>
        ) : aura.length === 0 ? (
          <div className="empty-wardrobe social-empty">
            <Zap size={18} aria-hidden="true" />
            <strong>No aura yet</strong>
            <span>Complete quests to be the first on the board.</span>
          </div>
        ) : (
          <ol className="leaderboard-list">
            {aura.map((entry, index) => (
              <li key={entry.id}>
                <Link href={`/u/${entry.username}`} className="leaderboard-row">
                  <span className={`leaderboard-rank rank-${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="leaderboard-avatar">
                    {entry.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.avatar_url} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      entry.username?.slice(0, 1).toUpperCase() ?? "S"
                    )}
                  </span>
                  <span className="leaderboard-name">
                    <strong>@{entry.username}</strong>
                    {entry.membership_tier !== "free" ? (
                      <span className={`tier-chip tier-${entry.membership_tier}`}>
                        {entry.membership_tier}
                      </span>
                    ) : null}
                  </span>
                  <span className="leaderboard-score">
                    <Zap size={12} aria-hidden="true" />
                    {entry.aura_points.toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="leaderboard-col">
        <div className="leaderboard-col-head">
          <span className="section-kicker">
            <Heart size={12} aria-hidden="true" /> Popularity
          </span>
          <h2>Most Popular Looks</h2>
        </div>

        {posts.length === 0 ? (
          <div className="empty-wardrobe social-empty">
            <Shirt size={18} aria-hidden="true" />
            <strong>No looks yet</strong>
            <span>Public looks will be ranked here by engagement.</span>
          </div>
        ) : (
          <ol className="leaderboard-list">
            {posts.map((post, index) => (
              <li key={post.id}>
                <Link href={`/outfits/${post.share_slug}`} className="leaderboard-row">
                  <span className={`leaderboard-rank rank-${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="leaderboard-thumb">
                    {post.items[0]?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.items[0].image_url} alt="" />
                    ) : (
                      <Shirt size={16} aria-hidden="true" />
                    )}
                  </span>
                  <span className="leaderboard-name">
                    <strong>{post.title}</strong>
                    <small>@{post.creator?.username ?? "styla user"}</small>
                  </span>
                  <span className="leaderboard-post-stats">
                    <span title="Likes">
                      <Heart size={11} aria-hidden="true" />
                      {post.like_count}
                    </span>
                    <span title="Saves">
                      <Bookmark size={11} aria-hidden="true" />
                      {post.save_count}
                    </span>
                    <span title="Views">
                      <Eye size={11} aria-hidden="true" />
                      {post.view_count}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
