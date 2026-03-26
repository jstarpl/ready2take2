import { useState } from "react";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Trash2 } from "lucide-react";

export function SettingsView() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.cameraColorSetting.list.useQuery();

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

  const [newIdentifier, setNewIdentifier] = useState("");
  const [newColor, setNewColor] = useState("#ffffff");
  const [editColors, setEditColors] = useState<Record<string, string>>({});

  const settings = settingsQuery.data ?? [];

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
    </div>
  );
}
