import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowFixture } from "./fixtures/test-data";
import { MockVmixConnection, mockVmixState } from "./mocks/vmix-mock";
import { MockAtemConnectionStatus, mockAtemState } from "./mocks/atem-mock";

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
  shows: any[];
} = {
  settings: null,
  shows: [],
};

const takeShowMock = vi.fn(async () => undefined);

vi.mock("node-vmix", () => ({
  ConnectionTCP: MockVmixConnection,
}));

vi.mock("atem-connection", () => ({
  Atem: class {
    status: MockAtemConnectionStatus = MockAtemConnectionStatus.CLOSED;

    constructor() {
      mockAtemState.createInstance();
    }

    async connect() {
      this.status = MockAtemConnectionStatus.CONNECTED;
    }

    async disconnect() {
      this.status = MockAtemConnectionStatus.CLOSED;
    }

    async destroy() {
      return undefined;
    }

    on() {
      return undefined;
    }

    off() {
      return undefined;
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
          find: async (query: { where?: { status?: unknown; nextCueId?: unknown } }) => {
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

async function configureVmixAndConnect(service: typeof import("../../../src/server/services/video-mixer-service")) {
  await service.updateVideoMixerSettings({
    mode: "vmix",
    vmixHost: "127.0.0.1",
    vmixPort: 8099,
    atemHost: "",
    atemPort: 9910,
    atemMe: null,
  });

  await service.reconnectVideoMixerConnections();

  const connection = mockVmixState.instances[mockVmixState.instances.length - 1];
  if (!connection) {
    throw new Error("Expected a vMix connection instance to be created.");
  }

  return connection;
}

describe("video mixer reconnect integration", () => {
  let service: typeof import("../../../src/server/services/video-mixer-service");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockVmixState.reset();
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

  it("re-subscribes to tally after vMix reconnect", async () => {
    const connection = await configureVmixAndConnect(service);

    const initialSubscribes = connection.sendCalls.filter((call) => call === "SUBSCRIBE TALLY").length;
    expect(initialSubscribes).toBe(1);

    connection.emit("connect");
    await flushAsync();

    const reconnectSubscribes = connection.sendCalls.filter((call) => call === "SUBSCRIBE TALLY").length;
    expect(reconnectSubscribes).toBe(2);
  });

  it("does not duplicate tally listeners across repeated reconnect events", async () => {
    const connection = await configureVmixAndConnect(service);

    expect(connection.listenerCount("tally")).toBe(1);

    connection.emit("connect");
    connection.emit("connect");
    connection.emit("connect");
    await flushAsync();

    expect(connection.listenerCount("tally")).toBe(1);

    connection.emit("tally", "12");
    await flushAsync();
    connection.emit("tally", "21");
    await flushAsync();

    expect(takeShowMock).toHaveBeenCalledTimes(1);
    expect(takeShowMock).toHaveBeenCalledWith("show-live");
  });

  it("ignores stale vMix events after integration is disabled", async () => {
    const connection = await configureVmixAndConnect(service);

    await service.updateVideoMixerSettings({
      mode: "none",
      vmixHost: "",
      vmixPort: 8099,
      atemHost: "",
      atemPort: 9910,
      atemMe: null,
    });

    const subscribeCountAfterDisable = connection.sendCalls.filter((call) => call === "SUBSCRIBE TALLY").length;

    connection.emit("connect");
    connection.emit("tally", "12");
    connection.emit("tally", "21");
    await flushAsync();

    const subscribeCountAfterStaleEvents = connection.sendCalls.filter((call) => call === "SUBSCRIBE TALLY").length;

    expect(subscribeCountAfterDisable).toBe(1);
    expect(subscribeCountAfterStaleEvents).toBe(1);
    expect(takeShowMock).not.toHaveBeenCalled();
  });
});
