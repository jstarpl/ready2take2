import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
} = {
  settings: null,
};

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
          find: async () => [],
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

async function configureAtemAndConnect(
  service: typeof import("../../../src/server/services/video-mixer-service"),
  settings: { atemHost: string; atemPort: number; atemMe: number },
) {
  await service.updateVideoMixerSettings({
    mode: "atem",
    vmixHost: "",
    vmixPort: 8099,
    atemHost: settings.atemHost,
    atemPort: settings.atemPort,
    atemMe: settings.atemMe,
  });

  await service.reconnectVideoMixerConnections();

  const atem = mockAtemState.instances[mockAtemState.instances.length - 1];
  if (!atem) {
    throw new Error("Expected an ATEM client instance to be created.");
  }

  return atem;
}

describe("video mixer ATEM reconnect integration", () => {
  let service: typeof import("../../../src/server/services/video-mixer-service");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockAtemState.reset();
    mockDbState.settings = null;

    service = await import("../../../src/server/services/video-mixer-service");
  });

  afterEach(async () => {
    await service.shutdownVideoMixerConnections();
  });

  it("disposes and reconnects when ATEM host/port changes", async () => {
    const firstClient = await configureAtemAndConnect(service, {
      atemHost: "127.0.0.1",
      atemPort: 9910,
      atemMe: 0,
    });
    const instancesBeforeUpdate = mockAtemState.instances.length;

    await service.updateVideoMixerSettings({
      mode: "atem",
      vmixHost: "",
      vmixPort: 8099,
      atemHost: "127.0.0.2",
      atemPort: 9911,
      atemMe: 0,
    });
    await flushAsync();

    const secondClient = mockAtemState.instances[mockAtemState.instances.length - 1];

    expect(mockAtemState.instances.length).toBe(instancesBeforeUpdate + 1);
    expect(secondClient).not.toBe(firstClient);
    expect(firstClient.disconnectCalls.length).toBe(1);
    expect(firstClient.destroyCalls.length).toBe(1);
    expect(secondClient.connectCalls[0]).toEqual({ host: "127.0.0.2", port: 9911 });
  });

  it("disposes and reconnects when ATEM M/E changes", async () => {
    const firstClient = await configureAtemAndConnect(service, {
      atemHost: "127.0.0.1",
      atemPort: 9910,
      atemMe: 0,
    });
    const instancesBeforeUpdate = mockAtemState.instances.length;

    await service.updateVideoMixerSettings({
      mode: "atem",
      vmixHost: "",
      vmixPort: 8099,
      atemHost: "127.0.0.1",
      atemPort: 9910,
      atemMe: 1,
    });
    await flushAsync();

    const secondClient = mockAtemState.instances[mockAtemState.instances.length - 1];

    expect(mockAtemState.instances.length).toBe(instancesBeforeUpdate + 1);
    expect(secondClient).not.toBe(firstClient);
    expect(firstClient.disconnectCalls.length).toBe(1);
    expect(firstClient.destroyCalls.length).toBe(1);
    expect(secondClient.connectCalls[0]).toEqual({ host: "127.0.0.1", port: 9910 });
  });
});
