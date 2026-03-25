import { createTRPCRouter, protectedProcedure } from "../trpc";
import { cueCreateSchema, cueDeleteSchema, cueReorderSchema, cueUpdateSchema } from "@/shared/schemas";
import { createCueWithTrackValues, deleteCueAndClearPointers, reorderCues, updateCue } from "../../services/cue-service";

export const cueRouter = createTRPCRouter({
  create: protectedProcedure.input(cueCreateSchema).mutation(async ({ input }) => {
    return createCueWithTrackValues(input.showId, input.comment, input.cueOffsetMs);
  }),
  update: protectedProcedure.input(cueUpdateSchema).mutation(async ({ input }) => {
    return updateCue(input.id, input.comment, input.cueOffsetMs);
  }),
  delete: protectedProcedure.input(cueDeleteSchema).mutation(async ({ input }) => {
    await deleteCueAndClearPointers(input.id);
    return { ok: true };
  }),
  reorder: protectedProcedure.input(cueReorderSchema).mutation(async ({ input }) => {
    await reorderCues(input.showId, input.cueIds);
    return { ok: true };
  }),
});
