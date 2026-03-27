import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowFixture } from "./fixtures/test-data";
import { MockVmixConnection, mockVmixState } from "./mocks/vmix-mock";
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

type ShowFixtureRecord = Omit<ReturnType<typeof createShowFixture>, "nextCueId"> & {
  nextCueId: string | null;
};

const mockDbState: {
  settings: VideoMixerSettingRecord | null;
  shows: ShowFixtureRecord[];
  showsById: Record<string, ShowFixtureRecord>;
  showFindCalls: Array<{ where?: { status?: unknown; nextCueId?: unknown } }>;
} = {
  settings: null,
  shows: [],
  showsById: {},
  showFindCalls: [],
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
          findOne: async (query: { where: { id: string } }) => mockDbState.showsById[query.where.id] ?? null,
          find: async (query: { where?: { status?: unknown; nextCueId?: unknown } }) => {
            mockDbState.showFindCalls.push(query);

            let rows = [...mockDbState.shows];

            if (query.where?.status === "live") {
              rows = rows.filter((show) => show.status === "live");
            } else if (query.where?.status) {
              rows = rows.filter((show) => show.status !== "live");
            }

            if (query.where?.nextCueId) {
              rows = rows.filter((show) => show.nextCueId !== null);
            }

            return rows;
          },
        };
      }

      throw new Error(`Unsupported repository request for entity ${entity?.name ?? "unknown"}.`);
    },
  },
}));

async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function expectLiveAndFallbackShowLookupQueries() {
  expect(mockDbState.showFindCalls).toHaveLength(2);
  expect(mockDbState.showFindCalls[0]?.where?.status).toBe("live");
  expect(mockDbState.showFindCalls[0]?.where?.nextCueId).toBeDefined();
  expect(mockDbState.showFindCalls[1]?.where?.status).toBeDefined();
  expect(mockDbState.showFindCalls[1]?.where?.status).not.toBe("live");
  expect(mockDbState.showFindCalls[1]?.where?.nextCueId).toBeDefined();
}

function buildState(programInput: number, previewInput: number) {
  return {
    video: {
      mixEffects: [
        {
          programInput,
          previewInput,
        },
      ],
    },
  };
}

async function configureAtemAndConnect(service: typeof import("../../../src/server/services/video-mixer-service")) {
  await service.updateVideoMixerSettings({
    mode: "atem",
    vmixHost: "",
    vmixPort: 8099,
    atemHost: "127.0.0.1",
    atemPort: 9910,
    atemMe: 0,
  });

  await service.reconnectVideoMixerConnections();

  const atem = mockAtemState.instances[mockAtemState.instances.length - 1];
  if (!atem) {
    throw new Error("Expected an ATEM client instance to be created.");
  }

  return atem;
}

describe("video mixer guardrails integration", () => {
  let service: typeof import("../../../src/server/services/video-mixer-service");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockVmixState.reset();
    mockAtemState.reset();
    mockDbState.settings = null;
    mockDbState.shows = [];
    mockDbState.showsById = {};
    mockDbState.showFindCalls = [];

    service = await import("../../../src/server/services/video-mixer-service");
  });

  afterEach(async () => {
    await service.shutdownVideoMixerConnections();
  });

  it("skips ATEM preview updates when technical identifier is non-numeric", async () => {
    mockDbState.showsById["show-non-numeric"] = createShowFixture({
      id: "show-non-numeric",
      status: "live",
      nextCueId: "show-non-numeric-cue-1",
      technicalIdentifier: "CAM_A",
    });

    await service.updateVideoMixerSettings({
      mode: "atem",
      vmixHost: "",
      vmixPort: 8099,
      atemHost: "127.0.0.1",
      atemPort: 9910,
      atemMe: 0,
    });
    await service.reconnectVideoMixerConnections();

    const atem = mockAtemState.instances[mockAtemState.instances.length - 1];
    if (!atem) {
      throw new Error("Expected ATEM instance to exist.");
    }

    await service.syncNextCueVideoMixerPreview("show-non-numeric");

    expect(atem.changePreviewInputCalls).toHaveLength(0);
  });

  it("reports vmix status as connecting then connected", async () => {
    mockVmixState.autoConnectOnConnectCall = false;

    await service.updateVideoMixerSettings({
      mode: "vmix",
      vmixHost: "127.0.0.1",
      vmixPort: 8099,
      atemHost: "",
      atemPort: 9910,
      atemMe: null,
    });

    const connectingStatus = await service.getVideoMixerConnectionStatus();
    expect(connectingStatus.mode).toBe("vmix");
    expect(connectingStatus.state).toBe("connecting");

    const connection = mockVmixState.instances[mockVmixState.instances.length - 1];
    if (!connection) {
      throw new Error("Expected vMix connection instance to exist.");
    }

    connection.simulateConnect();
    await flushAsync();

    const connectedStatus = await service.getVideoMixerConnectionStatus();
    expect(connectedStatus.mode).toBe("vmix");
    expect(connectedStatus.state).toBe("connected");
  });

  it("reports atem status as connecting then connected", async () => {
    let hasConnectResolver = false;
    let resolveConnect: () => void = () => {
      throw new Error("ATEM connect resolver was not initialized.");
    };

    const connectSpy = vi.spyOn(MockAtem.prototype, "connect").mockImplementation(function (this: MockAtem) {
      this.status = MockAtemConnectionStatus.CONNECTING;

      return new Promise<void>((resolve) => {
        hasConnectResolver = true;
        resolveConnect = () => {
          this.status = MockAtemConnectionStatus.CONNECTED;
          resolve();
        };
      });
    });

    await service.updateVideoMixerSettings({
      mode: "atem",
      vmixHost: "",
      vmixPort: 8099,
      atemHost: "127.0.0.1",
      atemPort: 9910,
      atemMe: 0,
    });

    const connectingStatus = await service.getVideoMixerConnectionStatus();
    expect(connectingStatus.mode).toBe("atem");
    expect(connectingStatus.state).toBe("connecting");

    if (!hasConnectResolver) {
      throw new Error("Expected deferred ATEM connect resolver to be available.");
    }

    resolveConnect();
    await flushAsync();

    const connectedStatus = await service.getVideoMixerConnectionStatus();
    expect(connectedStatus.mode).toBe("atem");
    expect(connectedStatus.state).toBe("connected");

    connectSpy.mockRestore();
  });

  it("resolves show lookup candidates using live-first filtering", async () => {
    const showLiveNoNextCue: ShowFixtureRecord = {
      ...createShowFixture({
        id: "show-live-no-next-cue",
        status: "live",
        nextCueId: "show-live-no-next-cue-cue-1",
        technicalIdentifier: "7",
      }),
      nextCueId: null,
    };

    mockDbState.shows = [
      showLiveNoNextCue,
      createShowFixture({
        id: "show-live-non-numeric",
        status: "live",
        nextCueId: "show-live-non-numeric-cue-1",
        technicalIdentifier: "CAM_A",
      }),
      createShowFixture({
        id: "show-live-match",
        status: "live",
        nextCueId: "show-live-match-cue-1",
        technicalIdentifier: "7",
      }),
      createShowFixture({
        id: "show-draft-match",
        status: "draft",
        nextCueId: "show-draft-match-cue-1",
        technicalIdentifier: "7",
      }),
      createShowFixture({
        id: "show-archived-match",
        status: "archived",
        nextCueId: "show-archived-match-cue-1",
        technicalIdentifier: "7",
      }),
    ];

    const atem = await configureAtemAndConnect(service);

    atem.emit("stateChanged", buildState(1, 7));
    await flushAsync();
    atem.emit("stateChanged", buildState(7, 1));
    await flushAsync();

    expect(takeShowMock).toHaveBeenCalledTimes(1);
    expect(takeShowMock).toHaveBeenCalledWith("show-live-match");
    expectLiveAndFallbackShowLookupQueries();
  });

  it("uses deterministic fallback ordering when no live show matches", async () => {
    mockDbState.shows = [
      createShowFixture({
        id: "show-live-no-match",
        status: "live",
        nextCueId: "show-live-no-match-cue-1",
        technicalIdentifier: "9",
      }),
      createShowFixture({
        id: "show-draft-fallback-first",
        status: "draft",
        nextCueId: "show-draft-fallback-first-cue-1",
        technicalIdentifier: "7",
      }),
      createShowFixture({
        id: "show-archived-fallback-second",
        status: "archived",
        nextCueId: "show-archived-fallback-second-cue-1",
        technicalIdentifier: "7",
      }),
    ];

    const atem = await configureAtemAndConnect(service);

    atem.emit("stateChanged", buildState(1, 7));
    await flushAsync();
    atem.emit("stateChanged", buildState(7, 1));
    await flushAsync();

    expect(takeShowMock).toHaveBeenCalledTimes(1);
    expect(takeShowMock).toHaveBeenCalledWith("show-draft-fallback-first");
    expectLiveAndFallbackShowLookupQueries();
  });
});
