import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { Project } from "../db/entities/Project";
import { Show } from "../db/entities/Show";
import { Track } from "../db/entities/Track";
import { showEvents } from "../realtime/show-events";
import { deleteAllShowMediaFiles } from "./show-media-service";
import { triggerNextCueVideoMixerAutomation } from "./video-mixer-service";

export async function createShowWithDefaultTrack(projectId: string, name: string) {
  return appDataSource.transaction(async (manager) => {
    const project = await manager.findOneByOrFail(Project, { id: projectId });
    const existingShows = await manager.find(Show, { where: { projectId: project.id } });

    const show = manager.create(Show, {
      project,
      projectId: project.id,
      name,
      status: "draft",
      orderKey: String(existingShows.length).padStart(4, "0"),
      currentCueId: null,
      currentCueTakenAt: null,
      nextCueId: null,
    });

    const savedShow = await manager.save(show);

    const defaultTrack = manager.create(Track, {
      show: savedShow,
      showId: savedShow.id,
      name: "Camera",
      type: "camera",
      position: 0,
    });

    await manager.save(defaultTrack);

    showEvents.publish({ type: "show.updated", showId: savedShow.id, entityId: savedShow.id });
    return savedShow;
  });
}

export async function deleteShow(showId: string) {
  const showRepository = appDataSource.getRepository(Show);
  const show = await showRepository.findOneByOrFail({ id: showId });
  await showRepository.remove(show);
  await deleteAllShowMediaFiles(showId);
}

export async function reorderShows(projectId: string, showIds: string[]) {
  return appDataSource.transaction(async (manager) => {
    const showRepository = manager.getRepository(Show);
    const shows = await showRepository.findBy({ projectId });

    if (shows.length !== showIds.length) {
      throw new Error("Show reorder must include every show in the project.");
    }

    const byId = new Map(shows.map((s) => [s.id, s]));
    if (showIds.some((id) => !byId.has(id)) || new Set(showIds).size !== showIds.length) {
      throw new Error("Show reorder contains invalid show ids.");
    }

    showIds.forEach((showId, index) => {
      byId.get(showId)!.orderKey = String(index).padStart(4, "0");
    });

    await showRepository.save(Array.from(byId.values()));
  });
}

export async function assignShowCuePointer(showId: string, cueId: string | null, field: "currentCueId" | "nextCueId") {
  const showRepository = appDataSource.getRepository(Show);
  const cueRepository = appDataSource.getRepository(Cue);

  const show = await showRepository.findOneByOrFail({ id: showId });

  if (cueId) {
    const cue = await cueRepository.findOneByOrFail({ id: cueId });
    if (cue.showId !== show.id) {
      throw new Error("Cue does not belong to the selected show.");
    }
  }

  show[field] = cueId;
  if (field === "currentCueId") {
    show.currentCueTakenAt = cueId ? new Date() : null;
  }
  await showRepository.save(show);

  showEvents.publish({
    type: field === "currentCueId" ? "show.currentCueChanged" : "show.nextCueChanged",
    showId: show.id,
    entityId: cueId ?? show.id,
  });

  if (field === "nextCueId") {
    triggerNextCueVideoMixerAutomation(show.id);
  }

  return show;
}

export async function takeShow(showId: string) {
  return appDataSource.transaction(async (manager) => {
    const showRepository = manager.getRepository(Show);

    const show = await showRepository.findOne({
      where: { id: showId },
      relations: {
        cues: true,
      },
      order: {
        cues: {
          orderKey: "ASC",
        },
      },
    });

    if (!show) {
      throw new Error("Show not found.");
    }

    if (!show.nextCueId) {
      throw new Error("No next cue is set for this show.");
    }

    const nextCueIndex = show.cues.findIndex((cue) => cue.id === show.nextCueId);

    if (nextCueIndex === -1) {
      throw new Error("Next cue does not belong to the selected show.");
    }

    const currentCueId = show.cues[nextCueIndex]?.id ?? null;
    const followingCueId = show.cues[nextCueIndex + 1]?.id ?? null;

    show.currentCueId = currentCueId;
    show.currentCueTakenAt = currentCueId ? new Date() : null;
    show.nextCueId = followingCueId;

    const savedShow = await showRepository.save(show);

    showEvents.publish({
      type: "show.currentCueChanged",
      showId: savedShow.id,
      entityId: currentCueId,
    });
    showEvents.publish({
      type: "show.nextCueChanged",
      showId: savedShow.id,
      entityId: followingCueId
    });

    triggerNextCueVideoMixerAutomation(savedShow.id);

    return savedShow;
  });
}

export async function resetShow(showId: string) {
  return appDataSource.transaction(async (manager) => {
    const showRepository = manager.getRepository(Show);

    const show = await showRepository.findOne({
      where: { id: showId },
      relations: {
        cues: true,
      },
      order: {
        cues: {
          orderKey: "ASC",
        },
      },
    });

    if (!show) {
      throw new Error("Show not found.");
    }

    show.currentCueId = null;
    show.currentCueTakenAt = null;
    show.nextCueId = null;

    const savedShow = await showRepository.save(show);

    showEvents.publish({
      type: "show.currentCueChanged",
      showId: savedShow.id,
      entityId: undefined,
    });
    showEvents.publish({
      type: "show.nextCueChanged",
      showId: savedShow.id,
      entityId: undefined,
    });

    triggerNextCueVideoMixerAutomation(savedShow.id);

    return savedShow;
  });
}

export async function updateShowDetails(showId: string, name: string, status: Show["status"]) {
  const showRepository = appDataSource.getRepository(Show);
  const show = await showRepository.findOneByOrFail({ id: showId });

  show.name = name;
  show.status = status;

  const savedShow = await showRepository.save(show);
  showEvents.publish({ type: "show.updated", showId: savedShow.id, entityId: savedShow.id });
  return savedShow;
}
