import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";

export type VideoMixerMode = "none" | "vmix" | "atem";

export class VideoMixerSetting extends BaseRecord {
  key!: string;
  mode!: VideoMixerMode;
  vmixHost!: string | null;
  vmixPort!: number | null;
  atemHost!: string | null;
  atemPort!: number | null;
  atemMe!: number | null;
}

export const VideoMixerSettingSchema = new EntitySchema<VideoMixerSetting>({
  name: "VideoMixerSetting",
  target: VideoMixerSetting,
  tableName: "video_mixer_settings",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    key: { type: String, unique: true },
    mode: { type: String, default: "none" },
    vmixHost: { type: String, nullable: true },
    vmixPort: { type: Number, nullable: true },
    atemHost: { type: String, nullable: true },
    atemPort: { type: Number, nullable: true },
    atemMe: { type: Number, nullable: true },
  },
});
