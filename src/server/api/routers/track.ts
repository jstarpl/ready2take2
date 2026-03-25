import { createTRPCRouter, protectedProcedure } from "../trpc";
import { trackCreateSchema, trackDeleteSchema, trackReorderSchema, trackUpdateSchema } from "@/shared/schemas";
import { createTrackAndCueTrackValues, deleteTrack, reorderTracks, updateTrack } from "../../services/track-service";

export const trackRouter = createTRPCRouter({
  create: protectedProcedure.input(trackCreateSchema).mutation(async ({ input }) => {
    return createTrackAndCueTrackValues(input.showId, input.name);
  }),
  delete: protectedProcedure.input(trackDeleteSchema).mutation(async ({ input }) => {
    return deleteTrack(input.id);
  }),
  update: protectedProcedure.input(trackUpdateSchema).mutation(async ({ input }) => {
    return updateTrack(input.id, input.name);
  }),
  reorder: protectedProcedure.input(trackReorderSchema).mutation(async ({ input }) => {
    return reorderTracks(input.showId, input.trackIds);
  }),
});
