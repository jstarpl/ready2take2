import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { CueTrackValue } from "../db/entities/CueTrackValue";
import { Project } from "../db/entities/Project";
import { Show } from "../db/entities/Show";
import { Track } from "../db/entities/Track";
import type { z } from "zod";
import { projectExportPayloadSchema } from "@/shared/schemas";

type ProjectExportPayload = z.infer<typeof projectExportPayloadSchema>;

export async function exportProjectHierarchy(projectId: string): Promise<ProjectExportPayload> {
  const project = await appDataSource.getRepository(Project).findOne({
    where: { id: projectId },
    relations: {
      shows: {
        tracks: true,
        cues: {
          cueTrackValues: true,
        },
      },
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description ?? null,
      shows: [...project.shows]
        .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
        .map((show) => ({
          id: show.id,
          name: show.name,
          status: show.status,
          orderKey: show.orderKey,
          currentCueId: show.currentCueId,
          currentCueTakenAt: show.currentCueTakenAt ? show.currentCueTakenAt.toISOString() : null,
          nextCueId: show.nextCueId,
          tracks: [...show.tracks]
            .sort((a, b) => a.position - b.position)
            .map((track) => ({
              id: track.id,
              name: track.name,
              type: track.type,
              position: track.position,
            })),
          cues: [...show.cues]
            .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
            .map((cue) => ({
              id: cue.id,
              cueId: cue.cueId,
              comment: cue.comment,
              cueOffsetMs: cue.cueOffsetMs,
              orderKey: cue.orderKey,
              cueTrackValues: cue.cueTrackValues.map((cueTrackValue) => ({
                trackId: cueTrackValue.trackId,
                technicalIdentifier: cueTrackValue.technicalIdentifier,
              })),
            })),
        })),
    },
  };
}

export async function importProjectHierarchy(payload: ProjectExportPayload, createdByUserId: string) {
  return appDataSource.transaction(async (manager) => {
    const savedProject = await manager.save(
      manager.create(Project, {
        name: payload.project.name,
        description: payload.project.description ?? null,
        createdByUserId,
      }),
    );

    for (const show of [...payload.project.shows].sort((a, b) => a.orderKey.localeCompare(b.orderKey))) {
      const savedShow = await manager.save(
        manager.create(Show, {
          projectId: savedProject.id,
          name: show.name,
          status: show.status,
          orderKey: show.orderKey,
          currentCueId: null,
          currentCueTakenAt: null,
          nextCueId: null,
        }),
      );

      const sourceTrackIdToImportedTrackId = new Map<string, string>();
      const sourceCueIdToImportedCueId = new Map<string, string>();

      for (const track of [...show.tracks].sort((a, b) => a.position - b.position)) {
        const savedTrack = await manager.save(
          manager.create(Track, {
            showId: savedShow.id,
            name: track.name,
            type: track.type,
            position: track.position,
          }),
        );

        sourceTrackIdToImportedTrackId.set(track.id, savedTrack.id);
      }

      for (const cue of [...show.cues].sort((a, b) => a.orderKey.localeCompare(b.orderKey))) {
        const savedCue = await manager.save(
          manager.create(Cue, {
            showId: savedShow.id,
            cueId: cue.cueId,
            comment: cue.comment,
            cueOffsetMs: cue.cueOffsetMs,
            orderKey: cue.orderKey,
          }),
        );

        sourceCueIdToImportedCueId.set(cue.id, savedCue.id);

        for (const cueTrackValue of cue.cueTrackValues) {
          const importedTrackId = sourceTrackIdToImportedTrackId.get(cueTrackValue.trackId);
          if (!importedTrackId) {
            throw new Error("Imported project references a track that does not exist.");
          }

          await manager.save(
            manager.create(CueTrackValue, {
              cueId: savedCue.id,
              trackId: importedTrackId,
              technicalIdentifier: cueTrackValue.technicalIdentifier,
            }),
          );
        }
      }

      if (show.currentCueId !== null) {
        const importedCurrentCueId = sourceCueIdToImportedCueId.get(show.currentCueId);
        if (!importedCurrentCueId) {
          throw new Error("Imported project current cue pointer references a cue that does not exist.");
        }
        savedShow.currentCueId = importedCurrentCueId;
        savedShow.currentCueTakenAt = show.currentCueTakenAt ? new Date(show.currentCueTakenAt) : null;
      }

      if (show.nextCueId !== null) {
        const importedNextCueId = sourceCueIdToImportedCueId.get(show.nextCueId);
        if (!importedNextCueId) {
          throw new Error("Imported project next cue pointer references a cue that does not exist.");
        }
        savedShow.nextCueId = importedNextCueId;
      }

      await manager.save(savedShow);
    }

    return savedProject;
  });
}
