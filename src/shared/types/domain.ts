export type ShowEventType =
  | "show.updated"
  | "mediaFile.created"
  | "mediaFile.deleted"
  | "track.created"
  | "track.reordered"
  | "track.updated"
  | "track.deleted"
  | "cue.created"
  | "cue.updated"
  | "cue.deleted"
  | "cue.reordered"
  | "cue.imported"
  | "cueTrackValue.updated"
  | "show.currentCueChanged"
  | "show.nextCueChanged";

export type ShowEvent = {
  type: ShowEventType;
  showId: string;
  entityId?: string;
};
