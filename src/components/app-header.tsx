import Link from "next/link";
import { Search } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";

const navItems = [
  { href: "/explore", label: "Home" },
  { href: "/wardrobe", label: "Wardrobe" },
  { href: "/generate", label: "Generate" },
  { href: "/chat", label: "Chat" },
  { href: "/outfit-check", label: "Check" },
  { href: "/outfits", label: "Outfits" },
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
        <span className="brand-icon">S</span>
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
        <Link className="nav-action" href="/search">
          <Search size={12} aria-hidden="true" />
          <span>Search</span>
        </Link>
        <span className="account-dot" aria-hidden="true" />
        <span className="account-label">{username ?? email ?? "Account"}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
