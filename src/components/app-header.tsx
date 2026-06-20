import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

const navItems = [
  { href: "/explore", label: "Explore" },
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/generate", label: "Generate" },
  { href: "/outfit-check", label: "Check" },
  { href: "/outfits", label: "Outfits" },
  { href: "/chat", label: "Chat" },
  { href: "/profile", label: "Profile" }
];

type AppHeaderProps = {
  username?: string | null;
  email?: string | null;
};

export function AppHeader({ username, email }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link className="brand-lockup" href="/explore">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo-img" src="/styla-logo.png" alt="" />
        <span>Styla</span>
      </Link>

      <nav className="main-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        <span className="account-dot" aria-hidden="true" />
        <span className="account-label">{username ?? email ?? "Account"}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
