import { redirect } from "next/navigation";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

// The standalone Search view was merged into Explore. Keep this route as a
// redirect so existing /search and /search?q=… links still resolve.
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  redirect(q ? `/explore?q=${encodeURIComponent(q)}` : "/explore");
}
