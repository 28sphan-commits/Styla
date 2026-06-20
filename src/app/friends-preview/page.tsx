import { FriendsStat } from "@/components/social/friends-stat";

const friends = [
  { id: "1", username: "maya", full_name: "Maya R", avatar_url: null, bio: "", membership_tier: "free", outfit_count: 8, follower_count: 120, following_count: 90, is_following: true },
  { id: "2", username: "devon", full_name: "Devon L", avatar_url: null, bio: "", membership_tier: "pro", outfit_count: 4, follower_count: 45, following_count: 60, is_following: true },
  { id: "3", username: "kai", full_name: "Kai T", avatar_url: null, bio: "", membership_tier: "free", outfit_count: 2, follower_count: 12, following_count: 20, is_following: true }
] as never;

export default function FriendsPreview() {
  return (
    <section className="page-shell explore-page">
      <div className="mini-stats" aria-label="summary">
        <span><strong>10</strong>Items</span>
        <span><strong>5</strong>Looks</span>
        <FriendsStat friends={friends} />
      </div>
    </section>
  );
}
