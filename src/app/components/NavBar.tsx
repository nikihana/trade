"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotStatusBadge } from "./BotStatusBadge";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🎡" },
  { href: "/trades", label: "Trades", icon: "📋" },
  { href: "/summary", label: "Summary", icon: "📊" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <>
      {/* Top header - mobile */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-lg font-bold text-white">
              🎡 Wheel Trader
            </h1>
            <BotStatusBadge />
          </div>
          <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded-full font-medium">
            PAPER
          </span>
        </div>
      </header>

      {/* Bottom tab bar - mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 sm:hidden">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors ${
                  isActive
                    ? "text-blue-400"
                    : "text-zinc-500 active:text-zinc-300"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar navigation */}
      <nav className="hidden sm:flex fixed top-16 left-0 right-0 z-40 bg-zinc-900/95 border-b border-zinc-800 px-4">
        <div className="flex gap-1 max-w-2xl mx-auto w-full">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
