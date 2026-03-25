import { EntitySchema } from "typeorm";
import { BaseRecord } from "./BaseRecord";
import type { Show } from "./Show";
import type { User } from "./User";

export class Project extends BaseRecord {
  name!: string;
  description!: string | null;
  createdByUser!: User;
  createdByUserId!: string;
  shows!: Show[];
}

export const ProjectSchema = new EntitySchema<Project>({
  name: "Project",
  target: Project,
  tableName: "projects",
  columns: {
    id: { type: "varchar", primary: true, generated: "uuid" },
    createdAt: { type: "datetime", createDate: true },
    updatedAt: { type: "datetime", updateDate: true },
    name: { type: String },
    description: { type: String, nullable: true },
    createdByUserId: { type: String },
  },
  relations: {
    createdByUser: {
      type: "many-to-one",
      target: "User",
      inverseSide: "createdProjects",
      joinColumn: { name: "createdByUserId" },
      onDelete: "RESTRICT",
    },
    shows: { type: "one-to-many", target: "Show", inverseSide: "project" },
  },
});
