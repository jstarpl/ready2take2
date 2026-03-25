import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { Cue } from "./Cue";
import type { Track } from "./Track";

export class CueTrackValue extends BaseRecord {
  cue!: Cue;
  cueId!: string;
  track!: Track;
  trackId!: string;
  technicalIdentifier!: string | null;
}

export const CueTrackValueSchema = new EntitySchema<CueTrackValue>({
  name: "CueTrackValue",
  target: CueTrackValue,
  tableName: "cue_track_values",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    cueId: { type: String },
    trackId: { type: String },
    technicalIdentifier: { type: String, nullable: true },
  },
  uniques: [{ columns: ["cueId", "trackId"] }],
  relations: {
    cue: {
      type: "many-to-one",
      target: "Cue",
      inverseSide: "cueTrackValues",
      joinColumn: { name: "cueId" },
      onDelete: "CASCADE",
    },
    track: {
      type: "many-to-one",
      target: "Track",
      inverseSide: "cueTrackValues",
      joinColumn: { name: "trackId" },
      onDelete: "CASCADE",
    },
  },
});
