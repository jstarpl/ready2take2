import { videoMixerPreviewTestSchema, videoMixerSettingsUpdateSchema } from "@/shared/schemas";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { getVideoMixerConnectionStatus, getVideoMixerSettings, reconnectVideoMixerConnections, testVideoMixerPreview, updateVideoMixerSettings } from "../../services/video-mixer-service";

export const videoMixerSettingRouter = createTRPCRouter({
  get: protectedProcedure.query(async () => {
    return getVideoMixerSettings();
  }),

  getStatus: protectedProcedure.query(async () => {
    return getVideoMixerConnectionStatus();
  }),

  update: protectedProcedure.input(videoMixerSettingsUpdateSchema).mutation(async ({ input }) => {
    return updateVideoMixerSettings(input);
  }),

  reconnect: protectedProcedure.mutation(async () => {
    return reconnectVideoMixerConnections();
  }),

  testPreview: protectedProcedure.input(videoMixerPreviewTestSchema).mutation(async () => {
    return testVideoMixerPreview();
  }),
});
