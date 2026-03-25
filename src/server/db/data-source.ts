import "reflect-metadata";
import path from "node:path";
import { DataSource } from "typeorm";
import { CueSchema } from "./entities/Cue";
import { CueTrackValueSchema } from "./entities/CueTrackValue";
import { ProjectSchema } from "./entities/Project";
import { SessionSchema } from "./entities/Session";
import { ShowSchema } from "./entities/Show";
import { ShowMediaFileSchema } from "./entities/ShowMediaFile";
import { TrackSchema } from "./entities/Track";
import { UserSchema } from "./entities/User";

export const appDataSource = new DataSource({
  type: "sqlite",
  database: path.resolve(process.cwd(), "data", "ready2take2.sqlite"),
  entities: [UserSchema, SessionSchema, ProjectSchema, ShowSchema, ShowMediaFileSchema, TrackSchema, CueSchema, CueTrackValueSchema],
  synchronize: true,
  logging: false,
});
