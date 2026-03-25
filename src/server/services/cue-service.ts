import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { CueTrackValue } from "../db/entities/CueTrackValue";
import { Show } from "../db/entities/Show";
import { Track } from "../db/entities/Track";
import { showEvents } from "../realtime/show-events";

export async function createCueWithTrackValues(showId: string, comment: string, cueOffsetMs: number | null) {
  return appDataSource.transaction(async (manager) => {
    const show = await manager.findOneByOrFail(Show, { id: showId });
    const cueRepository = manager.getRepository(Cue);
    const cueTrackValueRepository = manager.getRepository(CueTrackValue);
    const tracks = await manager.findBy(Track, { showId });
    const cueCount = await cueRepository.count({ where: { showId } });

    const cue = cueRepository.create({
      show,
      showId,
      comment,
      cueOffsetMs: cueOffsetMs ?? undefined,
      orderKey: String(cueCount).padStart(4, "0"),
    });

    const savedCue = await cueRepository.save(cue);

    if (tracks.length > 0) {
      await cueTrackValueRepository.save(
        tracks.map((track) =>
          cueTrackValueRepository.create({
            cueId: savedCue.id,
            trackId: track.id,
            technicalIdentifier: null,
          }),
        ),
      );
    }

    showEvents.publish({ type: "cue.created", showId, entityId: savedCue.id });
    return savedCue;
  });
}

export async function reorderCues(showId: string, cueIds: string[]) {
  return appDataSource.transaction(async (manager) => {
    const cueRepository = manager.getRepository(Cue);
    const cues = await cueRepository.findBy({ showId });
    const byId = new Map(cues.map((cue) => [cue.id, cue]));

    cueIds.forEach((cueId, index) => {
      const cue = byId.get(cueId);
      if (cue) {
        cue.orderKey = String(index).padStart(4, "0");
      }
    });

    await cueRepository.save(Array.from(byId.values()));
    showEvents.publish({ type: "cue.reordered", showId });
  });
}

export async function updateCue(cueId: string, comment: string, cueOffsetMs: number | null) {
  const cueRepository = appDataSource.getRepository(Cue);
  const cue = await cueRepository.findOneByOrFail({ id: cueId });

  cue.comment = comment;
  cue.cueOffsetMs = cueOffsetMs;

  const saved = await cueRepository.save(cue);
  showEvents.publish({ type: "cue.updated", showId: cue.showId, entityId: saved.id });
  return saved;
}

export async function updateCueTrackValue(cueId: string, trackId: string, technicalIdentifier: string | null) {
  const cueRepository = appDataSource.getRepository(Cue);
  const trackRepository = appDataSource.getRepository(Track);
  const cueTrackValueRepository = appDataSource.getRepository(CueTrackValue);

  const cue = await cueRepository.findOneByOrFail({ id: cueId });
  const track = await trackRepository.findOneByOrFail({ id: trackId });

  if (cue.showId !== track.showId) {
    throw new Error("Cue and track must belong to the same show.");
  }

  const existing = await cueTrackValueRepository.findOne({ where: { cueId, trackId } });

  if (!existing) {
    const created = cueTrackValueRepository.create({ cueId, trackId, technicalIdentifier });
    const saved = await cueTrackValueRepository.save(created);
    showEvents.publish({ type: "cueTrackValue.updated", showId: cue.showId, entityId: saved.id });
    return saved;
  }

  existing.technicalIdentifier = technicalIdentifier;
  const saved = await cueTrackValueRepository.save(existing);
  showEvents.publish({ type: "cueTrackValue.updated", showId: cue.showId, entityId: saved.id });
  return saved;
}

export async function deleteCueAndClearPointers(cueId: string) {
  await appDataSource.transaction(async (manager) => {
    const cueRepository = manager.getRepository(Cue);
    const showRepository = manager.getRepository(Show);
    const cue = await cueRepository.findOneByOrFail({ id: cueId });
    const show = await showRepository.findOneByOrFail({ id: cue.showId });

    if (show.currentCueId === cueId) {
      show.currentCueId = null;
    }

    if (show.nextCueId === cueId) {
      show.nextCueId = null;
    }

    await showRepository.save(show);
    await cueRepository.delete({ id: cueId });

    showEvents.publish({ type: "cue.deleted", showId: show.id, entityId: cueId });
  });
}
