import { observable } from "@trpc/server/observable";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { projectIdSchema, showCreateSchema, showCuePointerSchema, showIdSchema, showUpdateSchema } from "@/shared/schemas";
import { appDataSource } from "../../db/data-source";
import { Show } from "../../db/entities/Show";
import { showEvents } from "../../realtime/show-events";
import { assignShowCuePointer, createShowWithDefaultTrack, takeShow, updateShowDetails } from "../../services/show-service";
import type { ShowEvent } from "@/shared/types/domain";

export const showRouter = createTRPCRouter({
  listByProject: protectedProcedure.input(projectIdSchema).query(async ({ input }) => {
    return appDataSource.getRepository(Show).find({
      where: { projectId: input.projectId },
      order: { createdAt: "DESC" },
    });
  }),
  create: protectedProcedure.input(showCreateSchema).mutation(async ({ input }) => {
    return createShowWithDefaultTrack(input.projectId, input.name);
  }),
  update: protectedProcedure.input(showUpdateSchema).mutation(async ({ input }) => {
    return updateShowDetails(input.id, input.name, input.status);
  }),
  getDetail: protectedProcedure.input(showIdSchema).query(async ({ input }) => {
    return appDataSource.getRepository(Show).findOne({
      where: { id: input.showId },
      relations: {
        mediaFiles: true,
        tracks: true,
        cues: { cueTrackValues: true },
        currentCue: true,
        nextCue: true,
      },
      order: {
        mediaFiles: { createdAt: "DESC" },
        tracks: { position: "ASC" },
        cues: { orderKey: "ASC" },
      },
    });
  }),
  setCurrentCue: protectedProcedure.input(showCuePointerSchema).mutation(async ({ input }) => {
    return assignShowCuePointer(input.showId, input.cueId, "currentCueId");
  }),
  setNextCue: protectedProcedure.input(showCuePointerSchema).mutation(async ({ input }) => {
    return assignShowCuePointer(input.showId, input.cueId, "nextCueId");
  }),
  take: protectedProcedure.input(showIdSchema).mutation(async ({ input }) => {
    return takeShow(input.showId);
  }),
  subscribe: protectedProcedure.input(showIdSchema).subscription(({ input }) => {
    return observable<ShowEvent>((emit) => {
      const unsubscribe = showEvents.subscribe(input.showId, (event) => {
        emit.next(event);
      });

      return unsubscribe;
    });
  }),
});
