import { createContext, useContext } from "react";
import { proxy } from "valtio";

export interface ShowWorkspaceState {
  // Media player state
  currentTimeMs: number;
  selectedMediaFileId: string | null;

  // Add Cue form
  newCueComment: string;
  newCueOffset: string;
  newCueCueId: string;

  // Add Track form
  newTrackName: string;

  // Modal state
  activeModal: "addCue" | "addTrack" | "removeTrack" | "media" | null;

  // Cue selection
  selectedCueId: string | null;

  // File upload state
  selectedUpload: File | null;
  uploadError: string | null;
  isUploading: boolean;
  isDragActive: boolean;

  // Track removal
  trackToRemoveId: string;
}

export function createShowWorkspaceStore(): ShowWorkspaceState {
  return proxy<ShowWorkspaceState>({
    currentTimeMs: 0,
    selectedMediaFileId: null,
    newCueComment: "",
    newCueOffset: "0",
    newCueCueId: "1",
    newTrackName: "",
    activeModal: null,
    selectedCueId: null,
    selectedUpload: null,
    uploadError: null,
    isUploading: false,
    isDragActive: false,
    trackToRemoveId: "",
  });
}

// Store instances per showId
const storeMap = new Map<string, ShowWorkspaceState>();

export function getOrCreateStore(showId: string): ShowWorkspaceState {
  if (!storeMap.has(showId)) {
    storeMap.set(showId, createShowWorkspaceStore());
  }
  return storeMap.get(showId)!;
}

export function destroyStore(showId: string): void {
  storeMap.delete(showId);
}

export function resetAddCueForm(store: ShowWorkspaceState, nextCueId?: string): void {
  store.newCueComment = "";
  store.newCueOffset = "0";
  store.newCueCueId = nextCueId ?? "1";
}

export function resetAddTrackForm(store: ShowWorkspaceState): void {
  store.newTrackName = "";
}

export function resetUploadState(store: ShowWorkspaceState): void {
  store.selectedUpload = null;
  store.uploadError = null;
  store.isUploading = false;
}

// React Context for per-showId store access
const ShowWorkspaceStoreContext = createContext<ShowWorkspaceState | null>(null);

export { ShowWorkspaceStoreContext };

export function useShowWorkspaceStore(): ShowWorkspaceState {
  const store = useContext(ShowWorkspaceStoreContext);
  if (!store) {
    throw new Error("useShowWorkspaceStore must be used within ShowWorkspaceStoreProvider");
  }
  return store;
}
