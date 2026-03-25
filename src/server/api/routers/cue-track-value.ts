import { createTRPCRouter, protectedProcedure } from "../trpc";
import { cueTrackValueUpdateSchema } from "@/shared/schemas";
import { updateCueTrackValue } from "../../services/cue-service";

export const cueTrackValueRouter = createTRPCRouter({
  update: protectedProcedure.input(cueTrackValueUpdateSchema).mutation(async ({ input }) => {
    return updateCueTrackValue(input.cueId, input.trackId, input.technicalIdentifier);
  }),
});
