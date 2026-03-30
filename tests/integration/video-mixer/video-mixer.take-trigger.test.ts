import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowFixture } from "./fixtures/test-data";
import { MockVmixConnection } from "./mocks/vmix-mock";
import { MockAtem, MockAtemConnectionStatus, mockAtemState } from "./mocks/atem-mock";

type VideoMixerSettingRecord = {
  key: string;
  mode: "none" | "vmix" | "atem";
  vmixHost: string;
  vmixPort: number;
  atemHost: string;
  atemPort: number;
  atemMe: number | null;
};

const mockDbState: {
  settings: VideoMixerSettingRecord | null;
  shows: Array<ReturnType<typeof createShowFixture>>;
} = {
  settings: null,
  shows: [],
};

const takeShowMock = vi.fn(async () => undefined);

vi.mock("node-vmix", () => ({
  ConnectionTCP: MockVmixConnection,
}));

vi.mock("atem-connection", () => ({
  Atem: class extends MockAtem {
    constructor() {
      super();
      mockAtemState.instances.push(this);
    }
  },
  AtemConnectionStatus: MockAtemConnectionStatus,
}));

vi.mock("../../../src/server/lib/logger", () => ({
  getLogger: () => ({
    info: (_parts: TemplateStringsArray, ..._values: unknown[]) => undefined,
    warn: (_parts: TemplateStringsArray, ..._values: unknown[]) => undefined,
    error: (_parts: TemplateStringsArray, ..._values: unknown[]) => undefined,
  }),
}));

vi.mock("../../../src/server/services/show-service", () => ({
  takeShow: takeShowMock,
}));

vi.mock("../../../src/server/db/data-source", () => ({
  appDataSource: {
    getRepository: (entity: { name?: string }) => {
      if (entity?.name === "VideoMixerSetting") {
        return {
          findOneBy: async () => mockDbState.settings,
          create: (input: { key: string }) => ({
            key: input.key,
            mode: "none",
            vmixHost: "",
            vmixPort: 8099,
            atemHost: "",
            atemPort: 9910,
            atemMe: 0,
          }),
          save: async (record: VideoMixerSettingRecord) => {
            mockDbState.settings = {
              ...record,
            };
            return record;
          },
        };
      }

      if (entity?.name === "Show") {
        return {
          find: async (query: { where?: { currentCueId?: unknown; nextCueId?: unknown } }) => {
            let rows = [...mockDbState.shows];

            if (query.where?.currentCueId) {
              rows = rows.filter((show) => show.currentCueId !== null);
            }

            if (query.where?.nextCueId) {
              rows = rows.filter((show) => show.nextCueId !== null);
            }

            return rows;
          },
          findOne: async () => null,
        };
      }

      throw new Error(`Unsupported repository request for entity ${entity?.name ?? "unknown"}.`);
    },
  },
}));

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buildState(programInput: number, previewInput: number, meCount = 2) {
  const mixEffects = Array.from({ length: meCount }, () => ({
    programInput: 1,
    previewInput: 2,
  }));

  mixEffects[0] = {
    programInput,
    previewInput,
  };

  return {
    video: {
      mixEffects,
    },
  };
}

function buildStateForMe(me: number, programInput: number, previewInput: number, meCount = 2) {
  const mixEffects = Array.from({ length: meCount }, () => ({
    programInput: 1,
    previewInput: 2,
  }));

  mixEffects[me] = {
    programInput,
    previewInput,
  };

  return {
    video: {
      mixEffects,
    },
  };
}

async function configureAtemAndConnect(
  service: typeof import("../../../src/server/services/video-mixer-service"),
  atemMe: number,
) {
  await service.updateVideoMixerSettings({
    mode: "atem",
    vmixHost: "",
    vmixPort: 8099,
    atemHost: "127.0.0.1",
    atemPort: 9910,
    atemMe,
    companionOscHost: "",
    companionOscPort: 8000,
    companionOscPage: 1,
    companionOscPageWidth: 8,
  });

  await service.reconnectVideoMixerConnections();

  const atem = mockAtemState.instances[mockAtemState.instances.length - 1];
  if (!atem) {
    throw new Error("Expected an ATEM client instance to be created.");
  }

  return atem;
}

describe("video mixer take-trigger integration", () => {
  let service: typeof import("../../../src/server/services/video-mixer-service");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockAtemState.reset();
    mockDbState.settings = null;
    mockDbState.shows = [
      createShowFixture({
        id: "show-live",
        status: "live",
        nextCueId: "show-live-cue-1",
        technicalIdentifier: "2",
      }),
    ];

    service = await import("../../../src/server/services/video-mixer-service");
  });

  afterEach(async () => {
    await service.shutdownVideoMixerConnections();
  });

  it("triggers take on ATEM program/preview swap for the configured M/E", async () => {
    const atem = await configureAtemAndConnect(service, 0);

    atem.emit("stateChanged", buildState(1, 2));
    await flushAsync();

    atem.emit("stateChanged", buildState(2, 1));
    await flushAsync();

    expect(takeShowMock).toHaveBeenCalledTimes(1);
    expect(takeShowMock).toHaveBeenCalledWith("show-live");
  });

  it("does not trigger take when only a different M/E bus changes", async () => {
    const atem = await configureAtemAndConnect(service, 1);

    atem.emit("stateChanged", buildStateForMe(0, 1, 2));
    await flushAsync();

    atem.emit("stateChanged", buildStateForMe(0, 2, 1));
    await flushAsync();

    expect(takeShowMock).not.toHaveBeenCalled();
  });

  it("does not trigger take when multiple shows have active cue pointers", async () => {
    mockDbState.shows = [
      createShowFixture({
        id: "show-current",
        status: "draft",
        currentCueId: "show-current-cue-1",
        nextCueId: null,
        technicalIdentifier: "2",
      }),
      createShowFixture({
        id: "show-next",
        status: "live",
        currentCueId: null,
        nextCueId: "show-next-cue-1",
        technicalIdentifier: "2",
      }),
    ];

    const atem = await configureAtemAndConnect(service, 0);

    atem.emit("stateChanged", buildState(1, 2));
    await flushAsync();

    atem.emit("stateChanged", buildState(2, 1));
    await flushAsync();

    expect(takeShowMock).not.toHaveBeenCalled();
  });

  it("does not trigger take when no show matches the switched program input", async () => {
    mockDbState.shows = [
      createShowFixture({
        id: "show-live-no-match",
        status: "live",
        nextCueId: "show-live-no-match-cue-1",
        technicalIdentifier: "9",
      }),
    ];

    const atem = await configureAtemAndConnect(service, 0);

    atem.emit("stateChanged", buildState(1, 2));
    await flushAsync();

    atem.emit("stateChanged", buildState(2, 1));
    await flushAsync();

    expect(takeShowMock).not.toHaveBeenCalled();
  });
});
