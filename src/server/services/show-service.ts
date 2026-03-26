import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { Project } from "../db/entities/Project";
import { Show } from "../db/entities/Show";
import { Track } from "../db/entities/Track";
import { showEvents } from "../realtime/show-events";
import { triggerNextCueVideoMixerAutomation } from "./video-mixer-service";

export async function createShowWithDefaultTrack(projectId: string, name: string) {
  return appDataSource.transaction(async (manager) => {
    const project = await manager.findOneByOrFail(Project, { id: projectId });

    const show = manager.create(Show, {
      project,
      projectId: project.id,
      name,
      status: "draft",
      currentCueId: null,
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
    show.nextCueId = followingCueId;

    const savedShow = await showRepository.save(show);

    showEvents.publish({
      type: "show.currentCueChanged",
      showId: savedShow.id,
      entityId: currentCueId ?? savedShow.id,
    });
    showEvents.publish({
      type: "show.nextCueChanged",
      showId: savedShow.id,
      entityId: followingCueId ?? savedShow.id,
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
