import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";

export class CameraColorSetting extends BaseRecord {
  identifier!: string;
  color!: string;
}

export const CameraColorSettingSchema = new EntitySchema<CameraColorSetting>({
  name: "CameraColorSetting",
  target: CameraColorSetting,
  tableName: "camera_color_settings",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    identifier: { type: String, unique: true },
    color: { type: String },
  },
});
