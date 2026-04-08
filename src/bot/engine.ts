import { prisma } from "@/lib/db";
import { WheelStage, ContractStatus } from "@/lib/types";
import { handleSellPut } from "./stage-puts";
import { handleSellCall } from "./stage-calls";
import { monitorPositions } from "./monitor";
import { logInfo, logError } from "@/lib/logger";

/**
 * Main bot engine — runs one tick of the wheel strategy
 * Called every 15 minutes during market hours
 */
export async function runTick(): Promise<void> {
  logInfo("── Bot tick starting ──");

  try {
    // Step 1: Monitor all positions (assignments, profit targets, expirations)
    await monitorPositions();

    // Step 2: For each active ticker, take action based on current stage
    const activeTickers = await prisma.ticker.findMany({
      where: { active: true },
      include: {
        cycles: {
          where: { completedAt: null },
          include: {
            contracts: {
              where: {
                status: {
                  in: [ContractStatus.OPEN, ContractStatus.PENDING],
                },
              },
            },
          },
        },
      },
    });

    for (const ticker of activeTickers) {
      let cycle = ticker.cycles[0];

      // If no active cycle, create one
      if (!cycle) {
        cycle = await prisma.wheelCycle.create({
          data: {
            tickerId: ticker.id,
            stage: WheelStage.SELLING_PUTS,
          },
          include: {
            contracts: true,
          },
        });
        logInfo(`Created new wheel cycle`, ticker.symbol);
      }

      // Skip if there's already an open contract
      if (cycle.contracts.length > 0) {
        logInfo(
          `Open contract exists (${cycle.contracts[0].type}), monitoring only`,
          ticker.symbol
        );
        continue;
      }

      // Take action based on stage
      switch (cycle.stage) {
        case WheelStage.SELLING_PUTS:
          await handleSellPut(ticker.id, ticker.symbol, cycle.id);
          break;

        case WheelStage.SELLING_CALLS:
          if (cycle.costBasis) {
            await handleSellCall(
              ticker.id,
              ticker.symbol,
              cycle.id,
              cycle.costBasis
            );
          } else {
            logError(
              "In SELLING_CALLS stage but no cost basis set",
              ticker.symbol
            );
          }
          break;

        case WheelStage.HOLDING_SHARES:
          // Transition state — monitor.ts handles the transition to SELLING_CALLS
          logInfo("Holding shares, waiting for stage transition", ticker.symbol);
          break;

        default:
          logError(`Unknown stage: ${cycle.stage}`, ticker.symbol);
      }
    }

    logInfo("── Bot tick complete ──");
  } catch (error) {
    logError(
      `Bot tick failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
