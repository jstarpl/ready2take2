import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowFixture } from "./fixtures/test-data";
import { MockVmixConnection, mockVmixState } from "./mocks/vmix-mock";
import { MockAtem, MockAtemConnectionStatus, mockAtemState } from "./mocks/atem-mock";

type MockOscClientInstance = {
  host: string;
  port: number;
  sendCalls: string[];
  closeCalls: number;
};

const mockOscState = {
  instances: [] as MockOscClientInstance[],
  reset() {
    this.instances.length = 0;
  },
};

class MockOscClient {
  private instance: MockOscClientInstance;
  constructor(host: string, port: number) {
    this.instance = { host, port, sendCalls: [], closeCalls: 0 };
    mockOscState.instances.push(this.instance);
  }
  async send(address: string) {
    this.instance.sendCalls.push(address);
  }
  async close() {
    this.instance.closeCalls++;
  }
}

type VideoMixerSettingRecord = {
  key: string;
  mode: "none" | "vmix" | "atem" | "companion-osc";
  vmixHost: string;
  vmixPort: number;
  atemHost: string;
  atemPort: number;
  atemMe: number | null;
  companionOscHost: string;
  companionOscPort: number;
  companionOscPage: number;
  companionOscPageWidth: number;
};

type ShowFixtureRecord = Omit<ReturnType<typeof createShowFixture>, "nextCueId"> & {
  currentCueId: string | null;
  nextCueId: string | null;
};

const mockDbState: {
  settings: VideoMixerSettingRecord | null;
  shows: ShowFixtureRecord[];
  showsById: Record<string, ShowFixtureRecord>;
  showFindCalls: Array<{ where?: { currentCueId?: unknown; nextCueId?: unknown } }>;
} = {
  settings: null,
  shows: [],
  showsById: {},
  showFindCalls: [],
};

const takeShowMock = vi.fn(async () => undefined);

vi.mock("node-osc", () => ({
  Client: MockOscClient,
}));

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
            companionOscHost: "",
            companionOscPort: 12321,
            companionOscPage: 1,
            companionOscPageWidth: 8,
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
          find: async (query: { where?: { currentCueId?: unknown; nextCueId?: unknown } }) => {
            mockDbState.showFindCalls.push(query);

            let rows = [...mockDbState.shows];

            if (query.where?.currentCueId) {
              rows = rows.filter((show) => show.currentCueId !== null);
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

function expectActiveCuePointerLookupQueries() {
  expect(mockDbState.showFindCalls).toHaveLength(2);
  expect(mockDbState.showFindCalls[0]?.where?.currentCueId).toBeDefined();
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

describe("video mixer guardrails integration", () => {
  let service: typeof import("../../../src/server/services/video-mixer-service");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockVmixState.reset();
    mockAtemState.reset();
    mockOscState.reset();
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
      companionOscHost: "",
      companionOscPort: 8000,
      companionOscPage: 1,
      companionOscPageWidth: 8,
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
      companionOscHost: "",
      companionOscPort: 8000,
      companionOscPage: 1,
      companionOscPageWidth: 8,
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
      companionOscHost: "",
      companionOscPort: 8000,
      companionOscPage: 1,
      companionOscPageWidth: 8,
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

  it("resolves show lookup only when a single show has active cue pointers", async () => {
    const showLiveNoNextCue: ShowFixtureRecord = {
      ...createShowFixture({
        id: "show-live-no-next-cue",
        status: "live",
        currentCueId: null,
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
        currentCueId: null,
        nextCueId: null,
        technicalIdentifier: "CAM_A",
      }),
      createShowFixture({
        id: "show-live-match",
        status: "live",
        currentCueId: null,
        nextCueId: "show-live-match-cue-1",
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
    expectActiveCuePointerLookupQueries();
  });

  it("skips auto-take when multiple shows have active cue pointers", async () => {
    mockDbState.shows = [
      createShowFixture({
        id: "show-with-current",
        status: "live",
        currentCueId: "show-with-current-cue-1",
        nextCueId: null,
        technicalIdentifier: "4",
      }),
      createShowFixture({
        id: "show-with-next",
        status: "draft",
        currentCueId: null,
        nextCueId: "show-with-next-cue-1",
        technicalIdentifier: "7",
      }),
    ];

    const atem = await configureAtemAndConnect(service);

    atem.emit("stateChanged", buildState(1, 7));
    await flushAsync();
    atem.emit("stateChanged", buildState(7, 1));
    await flushAsync();

    expect(takeShowMock).not.toHaveBeenCalled();
    expectActiveCuePointerLookupQueries();
  });

  describe("Companion OSC preview", () => {
    async function configureCompanionOsc(
      svc: typeof import("../../../src/server/services/video-mixer-service"),
      options: {
        host?: string;
        port?: number;
        page?: number;
        pageWidth?: number;
      } = {},
    ) {
      await svc.updateVideoMixerSettings({
        mode: "companion-osc",
        vmixHost: "",
        vmixPort: 8099,
        atemHost: "",
        atemPort: 9910,
        atemMe: null,
        companionOscHost: options.host ?? "127.0.0.1",
        companionOscPort: options.port ?? 12321,
        companionOscPage: options.page ?? 1,
        companionOscPageWidth: options.pageWidth ?? 8,
      });
    }

    function registerShow(showId: string, technicalIdentifier: string) {
      mockDbState.showsById[showId] = {
        ...createShowFixture({
          id: showId,
          status: "live",
          nextCueId: `${showId}-cue-1`,
          technicalIdentifier,
        }),
        nextCueId: `${showId}-cue-1`,
      };
    }

    it("sends OSC press to the correct address for a valid numeric identifier", async () => {
      registerShow("show-osc-1", "9");
      await configureCompanionOsc(service, { page: 1, pageWidth: 8 });

      await service.syncNextCueVideoMixerPreview("show-osc-1");

      // zeroBasedIndex=8 -> row=2, column=1
      expect(mockOscState.instances).toHaveLength(1);
      expect(mockOscState.instances[0]?.sendCalls).toEqual(["/location/1/2/1/press"]);
    });

    it("applies page width to compute row and column", async () => {
      registerShow("show-osc-2", "10");
      await configureCompanionOsc(service, { page: 1, pageWidth: 4 });

      await service.syncNextCueVideoMixerPreview("show-osc-2");

      // zeroBasedIndex=9 -> row=3, column=2
      expect(mockOscState.instances).toHaveLength(1);
      expect(mockOscState.instances[0]?.sendCalls).toEqual(["/location/1/3/2/press"]);
    });

    it("uses the configured page number in the OSC address", async () => {
      registerShow("show-osc-3", "1");
      await configureCompanionOsc(service, { page: 3, pageWidth: 8 });

      await service.syncNextCueVideoMixerPreview("show-osc-3");

      // For identifier 8 and pageWidth 8, this should map to row 1, column 8
      expect(mockOscState.instances).toHaveLength(1);
      expect(mockOscState.instances[0]?.sendCalls).toEqual(["/location/3/1/1/press"]);
    });

    it("handles identifiers that are an exact multiple of the page width", async () => {
      registerShow("show-osc-1-multiple", "8");
      await configureCompanionOsc(service, { page: 1, pageWidth: 8 });

      await service.syncNextCueVideoMixerPreview("show-osc-1-multiple");

      // For identifier 8 and pageWidth 8, this should map to row 1, column 8
      expect(mockOscState.instances).toHaveLength(1);
      expect(mockOscState.instances[0]?.sendCalls).toEqual(["/location/1/1/8/press"]);
    });

    it("closes the OSC client after sending the message", async () => {
      registerShow("show-osc-close", "1");
      await configureCompanionOsc(service);

      await service.syncNextCueVideoMixerPreview("show-osc-close");

      expect(mockOscState.instances).toHaveLength(1);
      expect(mockOscState.instances[0]?.closeCalls).toBe(1);
    });

    it("skips the OSC message when the technical identifier is not a valid integer", async () => {
      registerShow("show-osc-non-numeric", "CAM_A");
      await configureCompanionOsc(service);

      await service.syncNextCueVideoMixerPreview("show-osc-non-numeric");

      expect(mockOscState.instances).toHaveLength(0);
    });

    it("skips the OSC message when the host is not configured", async () => {
      registerShow("show-osc-no-host", "9");
      await configureCompanionOsc(service, { host: "" });

      await service.syncNextCueVideoMixerPreview("show-osc-no-host");

      expect(mockOscState.instances).toHaveLength(0);
    });

    it("reports connection status as connected when host is configured", async () => {
      await configureCompanionOsc(service, { host: "127.0.0.1", port: 12321 });

      const status = await service.getVideoMixerConnectionStatus();

      expect(status.mode).toBe("companion-osc");
      expect(status.state).toBe("connected");
      expect(status.host).toBe("127.0.0.1");
      expect(status.port).toBe(12321);
    });

    it("reports connection status as inactive when host is not configured", async () => {
      await configureCompanionOsc(service, { host: "" });

      const status = await service.getVideoMixerConnectionStatus();

      expect(status.mode).toBe("companion-osc");
      expect(status.state).toBe("inactive");
    });
  });
});
