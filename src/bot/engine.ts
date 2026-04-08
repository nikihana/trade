// Standalone bot engine — delegates to the shared tick engine
// This avoids maintaining duplicate logic
export { runTickEngine as runTick } from "@/lib/tick-engine";
