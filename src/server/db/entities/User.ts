import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { Project } from "./Project";
import type { Session } from "./Session";

export class User extends BaseRecord {
  username!: string;
  displayName!: string | null;
  passwordHash!: string;
  forcePasswordChange!: boolean;
  sessions!: Session[];
  createdProjects!: Project[];
}

export const UserSchema = new EntitySchema<User>({
  name: "User",
  target: User,
  tableName: "users",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    username: { type: String, unique: true },
    displayName: { type: String, nullable: true },
    passwordHash: { type: String },
    forcePasswordChange: { type: Boolean, default: false },
  },
  relations: {
    sessions: { type: "one-to-many", target: "Session", inverseSide: "user" },
    createdProjects: { type: "one-to-many", target: "Project", inverseSide: "createdByUser" },
  },
});
