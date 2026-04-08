"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/summary", label: "Summary" },
];

export function NavBar() {
  const pathname = usePathname();

  // Hide nav on login/setup pages
  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <>
      {/* Single header bar */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4">
          {/* Top row: logo + actions */}
          <div className="flex items-center justify-between h-12">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Predixeum"
                width={28}
                height={28}
                className="rounded-md"
              />
              <span className="font-bold text-white text-sm">
                Predixeum
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-yellow-900/80 text-yellow-300 px-1.5 py-0.5 rounded-full font-medium">
                PAPER
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Nav tabs - inline, same bar */}
          <div className="hidden sm:flex gap-1 -mb-px">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    isActive
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* Bottom tab bar - mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 sm:hidden safe-area-bottom">
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
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "text-blue-400 bg-blue-900/30"
                    : "text-zinc-500 active:text-zinc-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
