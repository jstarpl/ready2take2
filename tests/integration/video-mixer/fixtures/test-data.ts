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
  nextCueId: string | null;
  cameraTrackId?: string;
  technicalIdentifier?: string | null;
};

export function createShowFixture(input: ShowFixtureInput) {
  const cameraTrackId = input.cameraTrackId ?? `${input.id}-camera-track`;
  const nextCueId = input.nextCueId ?? `${input.id}-cue-1`;
  const technicalIdentifier = input.technicalIdentifier ?? "2";

  const tracks: TrackFixture[] = [
    {
      id: cameraTrackId,
      type: "camera",
    },
  ];

  const cues: CueFixture[] = [
    {
      id: nextCueId,
      cueTrackValues: [
        {
          trackId: cameraTrackId,
          technicalIdentifier,
        },
      ],
    },
  ];

  return {
    id: input.id,
    status: input.status,
    nextCueId,
    tracks,
    cues,
  };
}
