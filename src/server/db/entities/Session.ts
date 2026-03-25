import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { User } from "./User";

export class Session extends BaseRecord {
  user!: User;
  userId!: string;
  expiresAt!: Date;
}

export const SessionSchema = new EntitySchema<Session>({
  name: "Session",
  target: Session,
  tableName: "sessions",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    userId: { type: String },
    expiresAt: { type: "datetime" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      inverseSide: "sessions",
      joinColumn: { name: "userId" },
      onDelete: "CASCADE",
    },
  },
});
