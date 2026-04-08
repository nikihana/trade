"use client";

const stages = [
  { key: "SELLING_PUTS", label: "Sell Puts", icon: "📉" },
  { key: "HOLDING_SHARES", label: "Holding", icon: "📦" },
  { key: "SELLING_CALLS", label: "Sell Calls", icon: "📈" },
];

export function WheelStageIndicator({
  currentStage,
}: {
  currentStage: string | null;
}) {
  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        const isActive = stage.key === currentStage;
        const isPast =
          currentStage &&
          stages.findIndex((s) => s.key === currentStage) > i;

        return (
          <div key={stage.key} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? "bg-blue-600 text-white shadow-md"
                  : isPast
                    ? "bg-green-100 text-green-700"
                    : "bg-zinc-100 text-zinc-400"
              }`}
            >
              <span>{stage.icon}</span>
              <span className="hidden sm:inline">{stage.label}</span>
            </div>
            {i < stages.length - 1 && (
              <span className="text-zinc-300 text-xs">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
