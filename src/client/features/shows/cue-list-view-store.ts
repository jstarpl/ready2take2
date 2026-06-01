import { createContext, useContext } from "react";
import { proxy } from "valtio";

export type CueListViewMode = "both" | "top" | "bottom";

export interface CueListViewState {
  // Track and value selection for bottom pane filtering
  selectedTrackId: string | null;
  selectedTechnicalIdentifier: string | null;

  // Horizontal splitter position as percentage (0-100)
  // 50 = 50/50 split
  splitterPositionPercent: number;

  // Which pane(s) to display
  viewMode: CueListViewMode;
}

export function createCueListViewStore(): CueListViewState {
  return proxy<CueListViewState>({
    selectedTrackId: null,
    selectedTechnicalIdentifier: null,
    splitterPositionPercent: 50,
    viewMode: "both",
  });
}

// Store instances per showId
const storeMap = new Map<string, CueListViewState>();

export function getOrCreateCueListViewStore(showId: string): CueListViewState {
  if (!storeMap.has(showId)) {
    storeMap.set(showId, createCueListViewStore());
  }
  return storeMap.get(showId)!;
}

export function destroyCueListViewStore(showId: string): void {
  storeMap.delete(showId);
}

// React Context for per-showId store access
const CueListViewStoreContext = createContext<CueListViewState | null>(null);

export { CueListViewStoreContext };

export function useCueListViewStore(): CueListViewState {
  const store = useContext(CueListViewStoreContext);
  if (!store) {
    throw new Error("useCueListViewStore must be used within CueListViewStoreProvider");
  }
  return store;
}
