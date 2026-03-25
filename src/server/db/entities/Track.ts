import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { CueTrackValue } from "./CueTrackValue";
import type { Show } from "./Show";

export type TrackType = "custom" | "camera";

export class Track extends BaseRecord {
  show!: Show;
  showId!: string;
  name!: string;
  type!: TrackType;
  position!: number;
  cueTrackValues!: CueTrackValue[];
}

export const TrackSchema = new EntitySchema<Track>({
  name: "Track",
  target: Track,
  tableName: "tracks",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    showId: { type: String },
    name: { type: String },
    type: { type: String, default: "custom" },
    position: { type: Number, default: 0 },
  },
  relations: {
    show: {
      type: "many-to-one",
      target: "Show",
      inverseSide: "tracks",
      joinColumn: { name: "showId" },
      onDelete: "CASCADE",
    },
    cueTrackValues: { type: "one-to-many", target: "CueTrackValue", inverseSide: "track" },
  },
});
