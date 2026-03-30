type CueTrackValueFixture = {
  trackId: string;
  technicalIdentifier: string | null;
};

type CueFixture = {
  id: string;
  cueTrackValues: CueTrackValueFixture[];
};

type TrackFixture = {
  id: string;
  type: string;
};

type ShowFixtureInput = {
  id: string;
  status: "draft" | "live" | "archived";
  currentCueId?: string | null;
  nextCueId: string | null;
  cameraTrackId?: string;
  technicalIdentifier?: string | null;
};

export function createShowFixture(input: ShowFixtureInput) {
  const cameraTrackId = input.cameraTrackId ?? `${input.id}-camera-track`;
  const currentCueId = input.currentCueId === undefined ? null : input.currentCueId;
  const nextCueId = input.nextCueId === undefined ? `${input.id}-cue-1` : input.nextCueId;
  const technicalIdentifier = input.technicalIdentifier ?? "2";

  const tracks: TrackFixture[] = [
    {
      id: cameraTrackId,
      type: "camera",
    },
  ];

  const cueIds = [currentCueId, nextCueId].filter((cueId): cueId is string => cueId !== null);
  const uniqueCueIds = cueIds.length > 0 ? Array.from(new Set(cueIds)) : [`${input.id}-cue-1`];

  const cues: CueFixture[] = uniqueCueIds.map((cueId) => ({
    id: cueId,
    cueTrackValues: [
      {
        trackId: cameraTrackId,
        technicalIdentifier,
      },
    ],
  }));

  return {
    id: input.id,
    status: input.status,
    currentCueId,
    nextCueId,
    tracks,
    cues,
  };
}
