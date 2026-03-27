import { Server } from "node-osc";
import { IsNull, Not } from "typeorm";
import { appDataSource } from "../db/data-source";
import { Show } from "../db/entities/Show";
import { moveNextCueBackward, moveNextCueForward, takeShow } from "../services/show-service";
import { getLogger } from "../lib/logger";

const logger = getLogger("osc");

const OSC_PORT = Number(process.env.OSC_PORT) || 8000;

async function findShowWithNextCue(): Promise<Show | null> {
  const showRepository = appDataSource.getRepository(Show);
  const shows = await showRepository.find({
    where: { nextCueId: Not(IsNull()) },
    order: { orderKey: "ASC" },
  });

  if (shows.length === 0) {
    return null;
  }

  // Prefer a show that also has a currentCueId set (i.e. is actively running).
  const activeShow = shows.find((s) => s.currentCueId !== null);
  return activeShow ?? shows[0];
}

let oscServer: Server | null = null;

export function startOscServer(): void {
  oscServer = new Server(OSC_PORT, "0.0.0.0", () => {
    logger.info`OSC server listening on UDP port ${OSC_PORT}`;
  });

  oscServer.on("error", (error) => {
    logger.error`OSC server error: ${error.message}`;
  });

  oscServer.on("message", (msg) => {
    const [address] = msg;

    // Async operations are intentionally fire-and-forget here: OSC message
    // events cannot be awaited by the emitter, and errors are caught internally.
    if (address === "/production/take") {
      handleTake();
    } else if (address === "/production/moveNext/forward") {
      handleMoveNext("forward");
    } else if (address === "/production/moveNext/backward") {
      handleMoveNext("backward");
    }
  });
}

function handleTake(): void {
  findShowWithNextCue()
    .then((show) => {
      if (!show) {
        logger.debug`OSC /production/take: no show with next cue set, skipping`;
        return;
      }
      return takeShow(show.id).then(() => {
        logger.debug`OSC /production/take: executed for show ${show.id}`;
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error`OSC /production/take failed: ${message}`;
    });
}

function handleMoveNext(direction: "forward" | "backward"): void {
  const address = `/production/moveNext/${direction}`;
  findShowWithNextCue()
    .then((show) => {
      if (!show) {
        logger.debug`OSC ${address}: no show with next cue set, skipping`;
        return;
      }
      const op = direction === "forward" ? moveNextCueForward : moveNextCueBackward;
      return op(show.id).then(() => {
        logger.debug`OSC ${address}: executed for show ${show.id}`;
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error`OSC ${address} failed: ${message}`;
    });
}

export async function stopOscServer(): Promise<void> {
  if (oscServer) {
    await oscServer.close();
    oscServer = null;
    logger.info`OSC server stopped`;
  }
}
