import { createTRPCRouter } from "./trpc";
import { authRouter } from "./routers/auth";
import { cameraColorSettingRouter } from "./routers/camera-color-setting";
import { cueRouter } from "./routers/cue";
import { cueTrackValueRouter } from "./routers/cue-track-value";
import { projectRouter } from "./routers/project";
import { showRouter } from "./routers/show";
import { trackRouter } from "./routers/track";
import { videoMixerSettingRouter } from "./routers/video-mixer-setting";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  project: projectRouter,
  show: showRouter,
  track: trackRouter,
  cue: cueRouter,
  cueTrackValue: cueTrackValueRouter,
  cameraColorSetting: cameraColorSettingRouter,
  videoMixerSetting: videoMixerSettingRouter,
});

export type AppRouter = typeof appRouter;
