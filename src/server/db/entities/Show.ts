import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { Cue } from "./Cue";
import type { Project } from "./Project";
import type { ShowMediaFile } from "./ShowMediaFile";
import type { Track } from "./Track";

export class Show extends BaseRecord {
  project!: Project;
  projectId!: string;
  name!: string;
  status!: "draft" | "live" | "archived";
  currentCueId!: string | null;
  currentCueTakenAt!: Date | null;
  currentCue!: Cue | null;
  nextCueId!: string | null;
  nextCue!: Cue | null;
  mediaFiles!: ShowMediaFile[];
  tracks!: Track[];
  cues!: Cue[];
}

export const ShowSchema = new EntitySchema<Show>({
  name: "Show",
  target: Show,
  tableName: "shows",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    projectId: { type: String },
    name: { type: String },
    status: { type: String, default: "draft" },
    currentCueId: { type: String, nullable: true },
    currentCueTakenAt: { type: "datetime", nullable: true },
    nextCueId: { type: String, nullable: true },
  },
  relations: {
    project: {
      type: "many-to-one",
      target: "Project",
      inverseSide: "shows",
      joinColumn: { name: "projectId" },
      onDelete: "CASCADE",
    },
    currentCue: {
      type: "one-to-one",
      target: "Cue",
      joinColumn: { name: "currentCueId" },
      nullable: true,
      onDelete: "SET NULL",
    },
    nextCue: {
      type: "one-to-one",
      target: "Cue",
      joinColumn: { name: "nextCueId" },
      nullable: true,
      onDelete: "SET NULL",
    },
    mediaFiles: { type: "one-to-many", target: "ShowMediaFile", inverseSide: "show" },
    tracks: { type: "one-to-many", target: "Track", inverseSide: "show" },
    cues: { type: "one-to-many", target: "Cue", inverseSide: "show" },
  },
});
