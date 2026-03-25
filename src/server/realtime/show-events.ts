import { EventEmitter } from "node:events";
import type { ShowEvent } from "@/shared/types/domain";

class ShowEvents {
  private emitter = new EventEmitter();

  publish(event: ShowEvent) {
    this.emitter.emit(event.showId, event);
  }

  subscribe(showId: string, handler: (event: ShowEvent) => void) {
    this.emitter.on(showId, handler);
    return () => {
      this.emitter.off(showId, handler);
    };
  }
}

export const showEvents = new ShowEvents();
