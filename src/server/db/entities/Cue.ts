import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { CueTrackValue } from "./CueTrackValue";
import type { Show } from "./Show";

export class Cue extends BaseRecord {
  show!: Show;
  showId!: string;
  cueId!: string;
  comment!: string;
  cueOffsetMs!: number | null;
  orderKey!: string;
  cueTrackValues!: CueTrackValue[];
}

export const CueSchema = new EntitySchema<Cue>({
  name: "Cue",
  target: Cue,
  tableName: "cues",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    showId: { type: String },
    cueId: { type: String, default: "1" },
    comment: { type: "text" },
    cueOffsetMs: { type: Number, default: 0 },
    orderKey: { type: String, default: "a0" },
  },
  relations: {
    show: {
      type: "many-to-one",
      target: "Show",
      inverseSide: "cues",
      joinColumn: { name: "showId" },
      onDelete: "CASCADE",
    },
    cueTrackValues: { type: "one-to-many", target: "CueTrackValue", inverseSide: "cue" },
  },
});
