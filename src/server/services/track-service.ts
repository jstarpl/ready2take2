import { appDataSource } from "../db/data-source";
import { Cue } from "../db/entities/Cue";
import { CueTrackValue } from "../db/entities/CueTrackValue";
import { Show } from "../db/entities/Show";
import { Track, type TrackType } from "../db/entities/Track";
import { showEvents } from "../realtime/show-events";

export async function createTrackAndCueTrackValues(showId: string, name: string, type: TrackType = "custom") {
  return appDataSource.transaction(async (manager) => {
    await manager.findOneByOrFail(Show, { id: showId });

    const trackRepository = manager.getRepository(Track);
    const cueRepository = manager.getRepository(Cue);
    const cueTrackValueRepository = manager.getRepository(CueTrackValue);

    const position = await trackRepository.count({ where: { showId } });
    const track = trackRepository.create({ showId, name, type, position });
    const savedTrack = await trackRepository.save(track);

    const cues = await cueRepository.findBy({ showId });
    if (cues.length > 0) {
      await cueTrackValueRepository.save(
        cues.map((cue) =>
          cueTrackValueRepository.create({
            cueId: cue.id,
            trackId: savedTrack.id,
            technicalIdentifier: null,
          }),
        ),
      );
    }

    showEvents.publish({ type: "track.created", showId, entityId: savedTrack.id });
    return savedTrack;
  });
}

export async function updateTrack(trackId: string, name: string) {
  const trackRepository = appDataSource.getRepository(Track);
  const track = await trackRepository.findOneByOrFail({ id: trackId });

  track.name = name;

  const savedTrack = await trackRepository.save(track);
  showEvents.publish({ type: "track.updated", showId: savedTrack.showId, entityId: savedTrack.id });
  return savedTrack;
}

export async function deleteTrack(trackId: string) {
  const trackRepository = appDataSource.getRepository(Track);
  const track = await trackRepository.findOneByOrFail({ id: trackId });

  await trackRepository.delete({ id: trackId });
  showEvents.publish({ type: "track.deleted", showId: track.showId, entityId: track.id });

  return { success: true };
}

export async function reorderTracks(showId: string, trackIds: string[]) {
  return appDataSource.transaction(async (manager) => {
    const trackRepository = manager.getRepository(Track);
    const tracks = await trackRepository.findBy({ showId });

    if (tracks.length !== trackIds.length) {
      throw new Error("Track reorder must include every track in the show.");
    }

    const byId = new Map(tracks.map((track) => [track.id, track]));
    if (trackIds.some((trackId) => !byId.has(trackId)) || new Set(trackIds).size !== trackIds.length) {
      throw new Error("Track reorder contains invalid track ids.");
    }

    trackIds.forEach((trackId, index) => {
      const track = byId.get(trackId)!;
      track.position = index;
    });

    const savedTracks = await trackRepository.save(Array.from(byId.values()));
    showEvents.publish({ type: "track.reordered", showId });
    return savedTracks;
  });
}