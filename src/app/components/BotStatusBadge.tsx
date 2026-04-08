"use client";

import { useBotStatus } from "@/lib/hooks";

export function BotStatusBadge() {
  const { data } = useBotStatus();

  const running = data?.running;
  const lastCheck = data?.lastCheck
    ? new Date(data.lastCheck).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
      })
    : null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${
          running ? "bg-green-500 animate-pulse" : "bg-zinc-500"
        }`}
      />
      <span className="text-zinc-400">
        {running ? `Bot active` : "Bot offline"}
        {lastCheck && ` · ${lastCheck}`}
      </span>
    </div>
  );
}
