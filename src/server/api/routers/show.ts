import { observable } from "@trpc/server/observable";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { nullSchema, projectIdSchema, showCreateSchema, showCuePointerSchema, showIdSchema, showReorderSchema, showUpdateSchema } from "@/shared/schemas";
import { appDataSource } from "../../db/data-source";
import { Show } from "../../db/entities/Show";
import { showEvents } from "../../realtime/show-events";
import { assignShowCuePointer, createShowWithDefaultTrack, deleteShow, moveNextCueBackward, moveNextCueForward, resetShow, reorderShows, takeShow, updateShowDetails } from "../../services/show-service";
import type { ShowEvent } from "@/shared/types/domain";
import { IsNull } from "typeorm/find-options/operator/IsNull.js";
import { Not } from "typeorm/find-options/operator/Not.js";

export const showRouter = createTRPCRouter({
  listByProject: protectedProcedure.input(projectIdSchema).query(async ({ input }) => {
    return appDataSource.getRepository(Show).find({
      where: { projectId: input.projectId },
      order: { orderKey: "ASC" },
    });
  }),
  create: protectedProcedure.input(showCreateSchema).mutation(async ({ input }) => {
    return createShowWithDefaultTrack(input.projectId, input.name);
  }),
  reorder: protectedProcedure.input(showReorderSchema).mutation(async ({ input }) => {
    return reorderShows(input.projectId, input.showIds);
  }),
  delete: protectedProcedure.input(showIdSchema).mutation(async ({ input }) => {
    return deleteShow(input.showId);
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
  getActiveShowDetail: protectedProcedure.input(nullSchema).query(async () => {
    const allShows = await appDataSource.getRepository(Show).find();

    const activeShow = allShows.find((show) => show.currentCueId !== null || show.nextCueId !== null);

    if (!activeShow) {
      return null;
    }

    return appDataSource.getRepository(Show).findOne({
      where: { id: activeShow.id },
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
  reset: protectedProcedure.input(showIdSchema).mutation(async ({ input }) => {
    return resetShow(input.showId);
  }),
  moveNextForward: protectedProcedure.input(showIdSchema).mutation(async ({ input }) => {
    return moveNextCueForward(input.showId);
  }),
  moveNextBackward: protectedProcedure.input(showIdSchema).mutation(async ({ input }) => {
    return moveNextCueBackward(input.showId);
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
