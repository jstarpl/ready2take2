import { createContext, useContext } from "react";
import { proxy } from "valtio";

const PERSISTED_SETTINGS_KEY = "r2t2-cue-list-settings";

interface PersistedSettings {
  intercomUrl: string;
  isIntercomVisible: boolean;
  intercomPanelHeightPx: number;
  audioNotificationsEnabled: boolean;
  ttsNotificationsEnabled: boolean;
}

function loadPersistedSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(PERSISTED_SETTINGS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const obj = parsed as Record<string, unknown>;
    const result: Partial<PersistedSettings> = {};
    if (typeof obj.intercomUrl === "string") result.intercomUrl = obj.intercomUrl;
    if (typeof obj.isIntercomVisible === "boolean") result.isIntercomVisible = obj.isIntercomVisible;
    if (typeof obj.intercomPanelHeightPx === "number") result.intercomPanelHeightPx = obj.intercomPanelHeightPx;
    if (typeof obj.audioNotificationsEnabled === "boolean") result.audioNotificationsEnabled = obj.audioNotificationsEnabled;
    if (typeof obj.ttsNotificationsEnabled === "boolean") result.ttsNotificationsEnabled = obj.ttsNotificationsEnabled;
    return result;
  } catch {
    // ignore malformed data
  }
  return {};
}

export function savePersistedSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(PERSISTED_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface CueListViewState {
  // Track and value selection for bottom pane filtering
  selectedTrackId: string | null;
  selectedTechnicalIdentifier: string | null;

  // Horizontal splitter position as percentage (0-100)
  // 50 = 50/50 split
  splitterPositionPercent: number;

  // Intercom integration (persisted to localStorage)
  intercomUrl: string;
  isIntercomVisible: boolean;
  intercomPanelHeightPx: number;

  // Audio notifications on take (persisted to localStorage)
  audioNotificationsEnabled: boolean;
  ttsNotificationsEnabled: boolean;
}

export function createCueListViewStore(): CueListViewState {
  const persisted = loadPersistedSettings();
  return proxy<CueListViewState>({
    selectedTrackId: null,
    selectedTechnicalIdentifier: null,
    splitterPositionPercent: 50,
    intercomUrl: persisted.intercomUrl ?? "",
    isIntercomVisible: persisted.isIntercomVisible ?? false,
    intercomPanelHeightPx: persisted.intercomPanelHeightPx ?? 300,
    audioNotificationsEnabled: persisted.audioNotificationsEnabled ?? false,
    ttsNotificationsEnabled: persisted.ttsNotificationsEnabled ?? false,
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
