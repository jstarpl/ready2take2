import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { Show } from "./Show";

export class ShowMediaFile extends BaseRecord {
  show!: Show;
  showId!: string;
  originalName!: string;
  storedName!: string;
  mimeType!: string | null;
  sizeBytes!: number;
  publicPath!: string;
}

export const ShowMediaFileSchema = new EntitySchema<ShowMediaFile>({
  name: "ShowMediaFile",
  target: ShowMediaFile,
  tableName: "show_media_files",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    showId: { type: String },
    originalName: { type: String },
    storedName: { type: String },
    mimeType: { type: String, nullable: true },
    sizeBytes: { type: Number },
    publicPath: { type: String },
  },
  relations: {
    show: {
      type: "many-to-one",
      target: "Show",
      inverseSide: "mediaFiles",
      joinColumn: { name: "showId" },
      onDelete: "CASCADE",
    },
  },
});