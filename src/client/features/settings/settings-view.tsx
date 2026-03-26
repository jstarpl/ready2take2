import { useEffect, useState } from "react";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Trash2 } from "lucide-react";

type VideoMixerMode = "none" | "vmix" | "atem";

export function SettingsView() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.cameraColorSetting.list.useQuery();
  const videoMixerSettingsQuery = trpc.videoMixerSetting.get.useQuery();
  const videoMixerStatusQuery = trpc.videoMixerSetting.getStatus.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const upsertMutation = trpc.cameraColorSetting.upsert.useMutation({
    onSuccess: async () => {
      setNewIdentifier("");
      setNewColor("#ffffff");
      await utils.cameraColorSetting.list.invalidate();
    },
  });

  const deleteMutation = trpc.cameraColorSetting.delete.useMutation({
    onSuccess: async () => {
      await utils.cameraColorSetting.list.invalidate();
    },
  });

  const updateVideoMixerSettingsMutation = trpc.videoMixerSetting.update.useMutation({
    onSuccess: async (settings) => {
      setVideoMixerMode(settings.mode);
      setVmixHost(settings.vmixHost);
      setVmixPort(String(settings.vmixPort));
      setAtemHost(settings.atemHost);
      setAtemPort(String(settings.atemPort));
      await Promise.all([utils.videoMixerSetting.get.invalidate(), utils.videoMixerSetting.getStatus.invalidate()]);
    },
  });

  const testVideoMixerPreviewMutation = trpc.videoMixerSetting.testPreview.useMutation({
    onSuccess: (result) => {
      setVideoMixerTestStatus(`Sent test preview to ${result.mode === "vmix" ? "vMix" : "ATEM"} target.`);
      setVideoMixerTestError(null);
      void utils.videoMixerSetting.getStatus.invalidate();
    },
    onError: (error) => {
      setVideoMixerTestError(error.message);
      setVideoMixerTestStatus(null);
    },
  });

  const reconnectVideoMixerMutation = trpc.videoMixerSetting.reconnect.useMutation({
    onSuccess: async () => {
      setVideoMixerTestError(null);
      await utils.videoMixerSetting.getStatus.invalidate();
    },
    onError: (error) => {
      setVideoMixerTestError(error.message);
    },
  });

  const [newIdentifier, setNewIdentifier] = useState("");
  const [newColor, setNewColor] = useState("#ffffff");
  const [editColors, setEditColors] = useState<Record<string, string>>({});
  const [videoMixerMode, setVideoMixerMode] = useState<VideoMixerMode>("none");
  const [vmixHost, setVmixHost] = useState("");
  const [vmixPort, setVmixPort] = useState("8099");
  const [atemHost, setAtemHost] = useState("");
  const [atemPort, setAtemPort] = useState("9910");
  const [videoMixerTestStatus, setVideoMixerTestStatus] = useState<string | null>(null);
  const [videoMixerTestError, setVideoMixerTestError] = useState<string | null>(null);

  const settings = settingsQuery.data ?? [];
  const connectionStatus = videoMixerStatusQuery.data;

  useEffect(() => {
    const settings = videoMixerSettingsQuery.data;
    if (!settings) {
      return;
    }

    setVideoMixerMode(settings.mode);
    setVmixHost(settings.vmixHost);
    setVmixPort(String(settings.vmixPort));
    setAtemHost(settings.atemHost);
    setAtemPort(String(settings.atemPort));
  }, [videoMixerSettingsQuery.data]);

  function handleAddSubmit(event: React.FormEvent) {
    event.preventDefault();
    const id = newIdentifier.trim();
    if (!id || upsertMutation.isPending) return;
    upsertMutation.mutate({ identifier: id, color: newColor });
  }

  function handleEditColor(settingId: string, identifier: string, color: string) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    upsertMutation.mutate({ identifier, color });
    setEditColors((prev) => {
      const next = { ...prev };
      delete next[settingId];
      return next;
    });
  }

  function handleVideoMixerSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsedVmixPort = Number.parseInt(vmixPort, 10);
    const parsedAtemPort = Number.parseInt(atemPort, 10);

    if (Number.isNaN(parsedVmixPort) || Number.isNaN(parsedAtemPort) || updateVideoMixerSettingsMutation.isPending) {
      return;
    }

    updateVideoMixerSettingsMutation.mutate({
      mode: videoMixerMode,
      vmixHost,
      vmixPort: parsedVmixPort,
      atemHost,
      atemPort: parsedAtemPort,
    });
  }

  function handleVideoMixerTest(event: React.FormEvent) {
    event.preventDefault();

    setVideoMixerTestStatus(null);
    setVideoMixerTestError(null);
    testVideoMixerPreviewMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>Camera Track Color Settings</CardTitle>
          <CardDescription>
            Assign a display color to each technical identifier used in camera-type tracks. These colors are shown in the
            cue workspace to help distinguish camera assignments at a glance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="flex items-end gap-3" onSubmit={handleAddSubmit}>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Identifier
              </label>
              <Input
                value={newIdentifier}
                onChange={(e) => setNewIdentifier(e.target.value)}
                placeholder="e.g. 1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border border-input bg-background p-1"
                />
                <Input
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="#ffffff"
                  className="w-28 font-mono"
                />
              </div>
            </div>
            <Button type="submit" disabled={!newIdentifier.trim() || upsertMutation.isPending}>
              Add
            </Button>
          </form>

          <div className="space-y-2">
            {settings.length === 0 && (
              <div className="border border-dashed border-border/70 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                No color settings yet. Add one above.
              </div>
            )}
            {settings.map((setting) => {
              const localColor = editColors[setting.id] ?? setting.color;
              return (
                <div
                  key={setting.id}
                  className="flex items-center gap-3 border border-border/70 bg-background/65 px-4 py-3"
                >
                  <div
                    className="h-6 w-6 shrink-0 rounded-full border border-border/50"
                    style={{ backgroundColor: setting.color }}
                  />
                  <div className="min-w-0 flex-1 font-mono font-semibold">{setting.identifier}</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={localColor}
                      onChange={(e) => setEditColors((prev) => ({ ...prev, [setting.id]: e.target.value }))}
                      onBlur={(e) => handleEditColor(setting.id, setting.identifier, e.target.value)}
                      className="h-8 w-12 cursor-pointer rounded border border-input bg-background p-0.5"
                    />
                    <Input
                      value={localColor}
                      onChange={(e) => setEditColors((prev) => ({ ...prev, [setting.id]: e.target.value }))}
                      onBlur={(e) => handleEditColor(setting.id, setting.identifier, e.target.value)}
                      className="w-24 font-mono text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: setting.id })}
                    disabled={deleteMutation.isPending}
                    aria-label={`Delete color for ${setting.identifier}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-card/75">
        <CardHeader>
          <CardTitle>Video Mixer Integration</CardTitle>
          <CardDescription>
            Choose whether cue next-state changes should drive a mixer preview update. The system uses the technical
            identifier from the first camera-type track on the next cue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleVideoMixerSubmit}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active integration
              </label>
              <select
                value={videoMixerMode}
                onChange={(event) => setVideoMixerMode(event.target.value as VideoMixerMode)}
                className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="none">None</option>
                <option value="vmix">vMix</option>
                <option value="atem">ATEM</option>
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">vMix host</label>
                <Input value={vmixHost} onChange={(event) => setVmixHost(event.target.value)} placeholder="eg. 127.0.0.1" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">vMix port</label>
                <Input value={vmixPort} onChange={(event) => setVmixPort(event.target.value)} placeholder="eg. 8099" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ATEM host</label>
                <Input value={atemHost} onChange={(event) => setAtemHost(event.target.value)} placeholder="eg. 192.168.10.240" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ATEM port</label>
                <Input value={atemPort} onChange={(event) => setAtemPort(event.target.value)} placeholder="eg. 9910" />
              </div>
            </div>

            <div className="rounded border border-border/70 bg-background/40 p-3 text-sm text-muted-foreground">
              vMix uses the technical identifier as the preview input selector. ATEM trims the identifier and converts
              it to a number before selecting preview input.
            </div>

            <div className="rounded border border-border/70 bg-background/40 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">Connection status</div>
                  <div className="mt-1 text-muted-foreground">
                    {renderVideoMixerConnectionStatus(connectionStatus, videoMixerStatusQuery.isLoading)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => reconnectVideoMixerMutation.mutate()}
                  disabled={
                    reconnectVideoMixerMutation.isPending ||
                    videoMixerStatusQuery.isLoading ||
                    videoMixerMode === "none"
                  }
                >
                  Reconnect
                </Button>
              </div>
            </div>

            <Button type="submit" disabled={updateVideoMixerSettingsMutation.isPending || videoMixerSettingsQuery.isLoading}>
              Save mixer settings
            </Button>
          </form>

          <form className="mt-6 space-y-3 border-t border-border/60 pt-4" onSubmit={handleVideoMixerTest}>
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Test mixer connection
              </label>
            </div>

            <div className="text-sm text-muted-foreground">
              This changes the preview on the video mixer in a sequence to test the connection.
            </div>

            {videoMixerTestStatus ? (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {videoMixerTestStatus}
              </div>
            ) : null}

            {videoMixerTestError ? (
              <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {videoMixerTestError}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="outline"
              disabled={testVideoMixerPreviewMutation.isPending || videoMixerMode === "none"}
            >
              Test
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function renderVideoMixerConnectionStatus(
  status:
    | {
        mode: VideoMixerMode;
        state: "inactive" | "connecting" | "connected" | "disconnected";
        host: string;
        port: number | null;
      }
    | undefined,
  isLoading: boolean,
) {
  if (isLoading && !status) {
    return "Loading status...";
  }

  if (!status || status.mode === "none") {
    return "No integration active.";
  }

  const endpoint = status.host ? `${status.host}${status.port ? `:${status.port}` : ""}` : "not configured";
  const label = status.mode === "vmix" ? "vMix" : "ATEM";

  if (status.state === "connected") {
    return `${label} connected at ${endpoint}.`;
  }

  if (status.state === "connecting") {
    return `${label} is connecting to ${endpoint}.`;
  }

  if (status.state === "inactive") {
    return `${label} is selected but not fully configured.`;
  }

  return `${label} is not connected. Current target: ${endpoint}.`;
}
