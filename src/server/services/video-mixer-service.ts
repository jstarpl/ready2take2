import { setTimeout as sleep } from "node:timers/promises";
import { Atem, AtemConnectionStatus } from "atem-connection";
import { ConnectionTCP } from "node-vmix";
import { appDataSource } from "../db/data-source";
import { Show } from "../db/entities/Show";
import { VideoMixerSetting, type VideoMixerMode } from "../db/entities/VideoMixerSetting";

const GLOBAL_VIDEO_MIXER_SETTINGS_KEY = "global";
const DEFAULT_VMIX_PORT = 8099;
const DEFAULT_ATEM_PORT = 9910;
const VMIX_CONNECT_TIMEOUT_MS = 5000;
const ATEM_CONNECT_TIMEOUT_MS = 5000;
const MIXER_TEST_DELAY = 1000;

type PersistentVmixConnection = {
  host: string;
  port: number;
  connection: ConnectionTCP;
  connectPromise: Promise<ConnectionTCP> | null;
};

type PersistentAtemConnection = {
  host: string;
  port: number;
  client: Atem;
  connectPromise: Promise<Atem> | null;
};

let persistentVmixConnection: PersistentVmixConnection | null = null;
let persistentAtemConnection: PersistentAtemConnection | null = null;

export type VideoMixerSettingsSnapshot = {
  mode: VideoMixerMode;
  vmixHost: string;
  vmixPort: number;
  atemHost: string;
  atemPort: number;
};

export type VideoMixerPreviewTestResult = {
  mode: Exclude<VideoMixerMode, "none">;
};

export type VideoMixerConnectionStatusResult = {
  mode: VideoMixerMode;
  state: "inactive" | "connecting" | "connected" | "disconnected";
  host: string;
  port: number | null;
};

type ResolvedNextCueTechnicalIdentifier = {
  showId: string;
  cueId: string;
  trackId: string;
  technicalIdentifier: string;
};

export function getDefaultVideoMixerSettings(): VideoMixerSettingsSnapshot {
  return {
    mode: "none",
    vmixHost: "",
    vmixPort: DEFAULT_VMIX_PORT,
    atemHost: "",
    atemPort: DEFAULT_ATEM_PORT,
  };
}

export async function getVideoMixerSettings(): Promise<VideoMixerSettingsSnapshot> {
  const repository = appDataSource.getRepository(VideoMixerSetting);
  const existing = await repository.findOneBy({ key: GLOBAL_VIDEO_MIXER_SETTINGS_KEY });

  if (!existing) {
    return getDefaultVideoMixerSettings();
  }

  return {
    mode: existing.mode,
    vmixHost: existing.vmixHost ?? "",
    vmixPort: existing.vmixPort ?? DEFAULT_VMIX_PORT,
    atemHost: existing.atemHost ?? "",
    atemPort: existing.atemPort ?? DEFAULT_ATEM_PORT,
  };
}

export async function updateVideoMixerSettings(settings: VideoMixerSettingsSnapshot): Promise<VideoMixerSettingsSnapshot> {
  const repository = appDataSource.getRepository(VideoMixerSetting);
  const existing = await repository.findOneBy({ key: GLOBAL_VIDEO_MIXER_SETTINGS_KEY });
  const previousSettings = existing
    ? {
        mode: existing.mode,
        vmixHost: existing.vmixHost ?? "",
        vmixPort: existing.vmixPort ?? DEFAULT_VMIX_PORT,
        atemHost: existing.atemHost ?? "",
        atemPort: existing.atemPort ?? DEFAULT_ATEM_PORT,
      }
    : getDefaultVideoMixerSettings();

  const entity = existing ?? repository.create({ key: GLOBAL_VIDEO_MIXER_SETTINGS_KEY });
  entity.mode = settings.mode;
  entity.vmixHost = settings.vmixHost;
  entity.vmixPort = settings.vmixPort;
  entity.atemHost = settings.atemHost;
  entity.atemPort = settings.atemPort;

  await repository.save(entity);

  const updatedSettings = await getVideoMixerSettings();
  await reconfigurePersistentVideoMixerConnections(previousSettings, updatedSettings);
  return updatedSettings;
}

export function triggerNextCueVideoMixerAutomation(showId: string) {
  void syncNextCueVideoMixerPreview(showId).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[video-mixer] Failed to update preview for show ${showId}: ${message}`);
  });
}

export async function testVideoMixerPreview(): Promise<VideoMixerPreviewTestResult> {
  const settings = await getVideoMixerSettings();

  if (settings.mode === "none") {
    throw new Error("No video mixer integration is currently active.");
  }

  if (settings.mode === "vmix") {
    const vmix = await getPersistentVmixConnection(settings);
    await vmix.send({ Function: "PreviewInput", Input: "1" });
    console.info(`[video-mixer] Sent test preview to vMix using input 1.`);
    await sleep(MIXER_TEST_DELAY);
    await vmix.send({ Function: "PreviewInput", Input: "2" });
    console.info(`[video-mixer] Sent test preview to vMix using input 2.`);
    await sleep(MIXER_TEST_DELAY);
    await vmix.send({ Function: "PreviewInput", Input: "1" });
    console.info(`[video-mixer] Sent test preview to vMix using input 1.`);
    
    return {
      mode: "vmix",
    };
  }

  const atem = await getPersistentAtemConnection(settings);
  await atem.changePreviewInput(1);
  console.info(`[video-mixer] Sent test preview to ATEM using input 1.`);
  await sleep(MIXER_TEST_DELAY);
  await atem.changePreviewInput(2);
  console.info(`[video-mixer] Sent test preview to ATEM using input 2.`);
  await sleep(MIXER_TEST_DELAY);
  await atem.changePreviewInput(1);
  console.info(`[video-mixer] Sent test preview to ATEM using input 1.`);

  return {
    mode: "atem",
  };
}

export async function getVideoMixerConnectionStatus(): Promise<VideoMixerConnectionStatusResult> {
  const settings = await getVideoMixerSettings();

  if (settings.mode === "none") {
    return {
      mode: "none",
      state: "inactive",
      host: "",
      port: null,
    };
  }

  if (settings.mode === "vmix") {
    const connection = persistentVmixConnection;
    if (!shouldUseVmix(settings)) {
      return {
        mode: "vmix",
        state: "inactive",
        host: settings.vmixHost,
        port: settings.vmixPort,
      };
    }

    if (!connection || connection.host !== settings.vmixHost || connection.port !== settings.vmixPort) {
      return {
        mode: "vmix",
        state: "disconnected",
        host: settings.vmixHost,
        port: settings.vmixPort,
      };
    }

    if (connection.connection.connected()) {
      return {
        mode: "vmix",
        state: "connected",
        host: connection.host,
        port: connection.port,
      };
    }

    return {
      mode: "vmix",
      state: connection.connectPromise ? "connecting" : "disconnected",
      host: connection.host,
      port: connection.port,
    };
  }

  const connection = persistentAtemConnection;
  if (!shouldUseAtem(settings)) {
    return {
      mode: "atem",
      state: "inactive",
      host: settings.atemHost,
      port: settings.atemPort,
    };
  }

  if (!connection || connection.host !== settings.atemHost || connection.port !== settings.atemPort) {
    return {
      mode: "atem",
      state: "disconnected",
      host: settings.atemHost,
      port: settings.atemPort,
    };
  }

  if (connection.client.status === AtemConnectionStatus.CONNECTED) {
    return {
      mode: "atem",
      state: "connected",
      host: connection.host,
      port: connection.port,
    };
  }

  return {
    mode: "atem",
    state: connection.connectPromise || connection.client.status === AtemConnectionStatus.CONNECTING ? "connecting" : "disconnected",
    host: connection.host,
    port: connection.port,
  };
}

export async function reconnectVideoMixerConnections(): Promise<VideoMixerConnectionStatusResult> {
  const settings = await getVideoMixerSettings();

  if (settings.mode === "none") {
    return getVideoMixerConnectionStatus();
  }

  if (settings.mode === "vmix") {
    disposePersistentVmixConnection();

    if (shouldUseVmix(settings)) {
      await getPersistentVmixConnection(settings);
    }

    return getVideoMixerConnectionStatus();
  }

  await disposePersistentAtemConnection();

  if (shouldUseAtem(settings)) {
    await getPersistentAtemConnection(settings);
  }

  return getVideoMixerConnectionStatus();
}

export async function shutdownVideoMixerConnections() {
  disposePersistentVmixConnection();
  await disposePersistentAtemConnection();
}

export async function syncNextCueVideoMixerPreview(showId: string) {
  const settings = await getVideoMixerSettings();

  if (settings.mode === "none") {
    return;
  }

  const resolvedIdentifier = await resolveNextCueTechnicalIdentifier(showId);
  if (!resolvedIdentifier) {
    return;
  }

  if (settings.mode === "vmix") {
    await sendPreviewToVmix(settings, resolvedIdentifier);
    return;
  }

  await sendPreviewToAtem(settings, resolvedIdentifier);
}

async function resolveNextCueTechnicalIdentifier(showId: string): Promise<ResolvedNextCueTechnicalIdentifier | null> {
  const show = await appDataSource.getRepository(Show).findOne({
    where: { id: showId },
    relations: {
      tracks: true,
      cues: { cueTrackValues: true },
    },
    order: {
      tracks: { position: "ASC" },
      cues: { orderKey: "ASC" },
    },
  });

  if (!show?.nextCueId) {
    return null;
  }

  const nextCue = show.cues.find((cue) => cue.id === show.nextCueId);
  if (!nextCue) {
    return null;
  }

  const firstCameraTrack = show.tracks.find((track) => track.type === "camera");
  if (!firstCameraTrack) {
    return null;
  }

  const technicalIdentifier = nextCue.cueTrackValues.find((value) => value.trackId === firstCameraTrack.id)?.technicalIdentifier?.trim();
  if (!technicalIdentifier) {
    return null;
  }

  return {
    showId,
    cueId: nextCue.id,
    trackId: firstCameraTrack.id,
    technicalIdentifier,
  };
}

async function sendPreviewToVmix(
  settings: VideoMixerSettingsSnapshot,
  resolvedIdentifier: ResolvedNextCueTechnicalIdentifier,
) {
  const vmix = await getPersistentVmixConnection(settings);
  await vmix.send({ Function: "PreviewInput", Input: resolvedIdentifier.technicalIdentifier });
  console.info(
    `[video-mixer] vMix preview updated for show ${resolvedIdentifier.showId} using input ${resolvedIdentifier.technicalIdentifier}.`,
  );
}

async function sendPreviewToAtem(
  settings: VideoMixerSettingsSnapshot,
  resolvedIdentifier: ResolvedNextCueTechnicalIdentifier,
) {
  const inputNumber = Number.parseInt(resolvedIdentifier.technicalIdentifier.trim(), 10);
  if (Number.isNaN(inputNumber)) {
    console.warn(
      `[video-mixer] Skipping ATEM preview update because technical identifier '${resolvedIdentifier.technicalIdentifier}' is not a valid number.`,
    );
    return;
  }

  const atem = await getPersistentAtemConnection(settings);
  await atem.changePreviewInput(inputNumber);
  console.info(`[video-mixer] ATEM preview updated to input ${inputNumber} for show ${resolvedIdentifier.showId}.`);
}

async function reconfigurePersistentVideoMixerConnections(
  previousSettings: VideoMixerSettingsSnapshot,
  nextSettings: VideoMixerSettingsSnapshot,
) {
  if (!shouldUseVmix(nextSettings) || haveVmixParametersChanged(previousSettings, nextSettings)) {
    disposePersistentVmixConnection();
  }

  if (!shouldUseAtem(nextSettings) || haveAtemParametersChanged(previousSettings, nextSettings)) {
    await disposePersistentAtemConnection();
  }

  if (shouldUseVmix(nextSettings)) {
    void getPersistentVmixConnection(nextSettings).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[video-mixer] Failed to establish persistent vMix connection: ${message}`);
    });
  }

  if (shouldUseAtem(nextSettings)) {
    void getPersistentAtemConnection(nextSettings).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[video-mixer] Failed to establish persistent ATEM connection: ${message}`);
    });
  }
}

async function getPersistentVmixConnection(settings: VideoMixerSettingsSnapshot): Promise<ConnectionTCP> {
  if (!shouldUseVmix(settings)) {
    throw new Error("vMix integration is not configured.");
  }

  if (
    persistentVmixConnection &&
    (persistentVmixConnection.host !== settings.vmixHost || persistentVmixConnection.port !== settings.vmixPort)
  ) {
    disposePersistentVmixConnection();
  }

  if (!persistentVmixConnection) {
    const connection = new ConnectionTCP(settings.vmixHost, {
      autoReconnect: true,
      disableAutoConnectOnInit: true,
      port: settings.vmixPort,
    });

    persistentVmixConnection = {
      host: settings.vmixHost,
      port: settings.vmixPort,
      connection,
      connectPromise: null,
    };
  }

  if (persistentVmixConnection.connection.connected()) {
    return persistentVmixConnection.connection;
  }

  if (!persistentVmixConnection.connectPromise) {
    const currentConnection = persistentVmixConnection;
    currentConnection.connectPromise = connectToVmix(
      currentConnection.connection,
      currentConnection.host,
      currentConnection.port,
    )
      .then(() => currentConnection.connection)
      .finally(() => {
        if (persistentVmixConnection === currentConnection) {
          currentConnection.connectPromise = null;
        }
      });

    return currentConnection.connectPromise;
  }

  return persistentVmixConnection.connectPromise;
}

async function getPersistentAtemConnection(settings: VideoMixerSettingsSnapshot): Promise<Atem> {
  if (!shouldUseAtem(settings)) {
    throw new Error("ATEM integration is not configured.");
  }

  if (
    persistentAtemConnection &&
    (persistentAtemConnection.host !== settings.atemHost || persistentAtemConnection.port !== settings.atemPort)
  ) {
    await disposePersistentAtemConnection();
  }

  if (!persistentAtemConnection) {
    persistentAtemConnection = {
      host: settings.atemHost,
      port: settings.atemPort,
      client: new Atem(),
      connectPromise: null,
    };
  }

  if (persistentAtemConnection.client.status === AtemConnectionStatus.CONNECTED) {
    return persistentAtemConnection.client;
  }

  if (!persistentAtemConnection.connectPromise) {
    const currentConnection = persistentAtemConnection;
    currentConnection.connectPromise = withTimeout(
      currentConnection.client.connect(currentConnection.host, currentConnection.port),
      ATEM_CONNECT_TIMEOUT_MS,
      "ATEM connection timed out.",
    )
      .then(() => currentConnection.client)
      .finally(() => {
        if (persistentAtemConnection === currentConnection) {
          currentConnection.connectPromise = null;
        }
      });

    return currentConnection.connectPromise;
  }

  return persistentAtemConnection.connectPromise;
}

function disposePersistentVmixConnection() {
  if (!persistentVmixConnection) {
    return;
  }

  persistentVmixConnection.connection.shutdown();
  persistentVmixConnection = null;
}

async function disposePersistentAtemConnection() {
  if (!persistentAtemConnection) {
    return;
  }

  const connection = persistentAtemConnection;
  persistentAtemConnection = null;

  await connection.client.disconnect().catch(() => undefined);
  await connection.client.destroy().catch(() => undefined);
}

function shouldUseVmix(settings: VideoMixerSettingsSnapshot) {
  return settings.mode === "vmix" && settings.vmixHost.trim().length > 0;
}

function shouldUseAtem(settings: VideoMixerSettingsSnapshot) {
  return settings.mode === "atem" && settings.atemHost.trim().length > 0;
}

function haveVmixParametersChanged(
  previousSettings: VideoMixerSettingsSnapshot,
  nextSettings: VideoMixerSettingsSnapshot,
) {
  return previousSettings.vmixHost !== nextSettings.vmixHost || previousSettings.vmixPort !== nextSettings.vmixPort;
}

function haveAtemParametersChanged(
  previousSettings: VideoMixerSettingsSnapshot,
  nextSettings: VideoMixerSettingsSnapshot,
) {
  return previousSettings.atemHost !== nextSettings.atemHost || previousSettings.atemPort !== nextSettings.atemPort;
}

async function connectToVmix(connection: ConnectionTCP, host: string, port: number) {
  await new Promise<void>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error("vMix connection timed out."));
    }, VMIX_CONNECT_TIMEOUT_MS);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error?: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error("Failed to connect to vMix."));
    };

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      connection.off("connect", onConnect);
      connection.off("error", onError);
    };

    connection.on("connect", onConnect);
    connection.on("error", onError);

    try {
      connection.connect(host, port);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Failed to connect to vMix."));
    }
  });
}


async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutHandle);
        reject(error);
      },
    );
  });
}