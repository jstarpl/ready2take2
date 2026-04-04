import { useMemo, useRef, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSnapshot } from "valtio";
import QRCode from "qrcode";
import { trpc } from "@/client/lib/trpc";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { cn, getContrastColor } from "@/client/lib/utils";
import {
    CueListViewStoreContext,
    CueListViewMode,
    getOrCreateCueListViewStore,
    destroyCueListViewStore,
    useCueListViewStore,
} from "@/client/features/shows/cue-list-view-store";
import { Cue } from "@/server/db/entities/Cue";
import { Show } from "@/server/db/entities/Show";
import { PanelBottom, PanelTop, QrCodeIcon, Rows2 } from "lucide-react";

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

interface CueListItemProps {
    cue: Cue;
    show: Show;
    status: "current" | "next" | "following";
    countdownText: string;
    trackValues: Record<string, string | null>;
    cameraColors: Record<string, string>;
}

function CueListItem({ cue, show, status, countdownText, trackValues, cameraColors }: CueListItemProps) {
    const statusColors = {
        current: "bg-red-600/30 border-l-8 border-l-red-500",
        next: "bg-green-600/30 border-l-8 border-l-green-500",
        following: "border-l-8 border-l-border",
    };

    return (
        <div className={cn("border border-border/50 p-3 transition-colors", statusColors[status])}>
            <div className="grid items-center justify-items-start gap-4 mb-2" style={{ gridTemplateColumns: `minmax(10ch, auto) minmax(10ch, auto) ${show.tracks.length > 0 ? `repeat(${show.tracks.length}, minmax(5ch, auto))` : ""} 1fr` }}>
                <div className="flex-1 justify-self-stretch">
                    <div className="font-mono text-5xl text-muted-foreground">
                        {cue.cueId}
                    </div>
                </div>
                <div className="flex-1 justify-self-end">
                    <div className="font-mono text-4xl text-foreground">
                        {countdownText}
                    </div>
                </div>
                {show.tracks.length > 0 && (
                    show.tracks.map((track: any) => {
                        const value = trackValues[track.id] ?? null;
                        const isCamera = track.type === "camera";
                        const bgColor = isCamera && value ? (cameraColors[value] ?? "transparent") : "transparent";
                        const textColor = isCamera && value && cameraColors[value]
                            ? getContrastColor(cameraColors[value])
                            : undefined;
                        return (
                            <div key={track.id} className="flex flex-col gap-1 relative self-stretch justify-self-stretch self-stretch align-center items-center " style={{ backgroundColor: bgColor }}>
                                <div className="absolute text-muted-foreground text-xs -bottom-4">{track.name}</div>
                                <div
                                    className="text-4xl px-2 py-1"
                                    style={{ color: textColor }}
                                >
                                    {value || "—"}
                                </div>
                            </div>
                        );
                    })
                )}
                <div className="text-4xl text-foreground whitespace-wrap break-words">
                    {cue.comment}
                </div>
            </div>
        </div>
    );
}

function formatOffset(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getCueCountdownText(
    cue: Cue,
    currentCue: Cue | undefined,
    currentCueTakenAt: string | Date | null | undefined,
    nowMs: number,
): string {
    if (!currentCue || currentCue.cueOffsetMs === null || cue.cueOffsetMs === null || !currentCueTakenAt) {
        return "\u00A0";
    }

    const takenAtMs = new Date(currentCueTakenAt).getTime();
    if (Number.isNaN(takenAtMs)) {
        return "\u00A0";
    }

    const remainingMs = cue.cueOffsetMs - currentCue.cueOffsetMs - (nowMs - takenAtMs);
    if (remainingMs <= 0) {
        return "\u00A0";
    }

    return formatOffset(remainingMs);
}

/** Provider component for the cue-list-view store */
function CueListViewStoreProvider({
    showId,
    children,
}: {
    showId: string;
    children: React.ReactNode;
}) {
    const store = useMemo(() => {
        return getOrCreateCueListViewStore(showId);
    }, [showId]);

    useEffect(() => {
        return () => {
            destroyCueListViewStore(showId);
        };
    }, [showId]);

    return (
        <CueListViewStoreContext.Provider value={store}>
            {children}
        </CueListViewStoreContext.Provider>
    );
}

/** Inner component that displays the two-pane cue list view */
function CueListViewContent() {
    const { showId } = useParams();
    const store = useCueListViewStore();
    const snapshot = useSnapshot(store);
    const utils = trpc.useUtils();
    const splitterRef = useRef<HTMLDivElement | null>(null);
    const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
    const [qrCodeError, setQrCodeError] = useState<string | null>(null);

    const showQuery = trpc.show.getDetail.useQuery(
        { showId: showId ?? "" },
        { enabled: Boolean(showId) },
    );

    const cameraColorsQuery = trpc.cameraColorSetting.list.useQuery();
    const cameraColors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const entry of cameraColorsQuery.data ?? []) {
            map[entry.identifier] = entry.color;
        }
        return map;
    }, [cameraColorsQuery.data]);

    trpc.show.subscribe.useSubscription(
        { showId: showId ?? "" },
        {
            enabled: Boolean(showId),
            onData: async () => {
                if (!showId) {
                    return;
                }
                await utils.show.getDetail.invalidate({ showId });
                await utils.project.list.invalidate();
            },
        },
    );

    // Compute derived values that will be used in hooks
    const show = showQuery.data;
    const orderedCues = useMemo(() => {
        if (!show) return [];
        return show.cues.sort((a: any, b: any) => a.orderKey.localeCompare(b.orderKey));
    }, [show]);

    // Get unique technical identifiers for the selected track (must be before early returns)
    const selectedTrackTechnicalIdentifiers = useMemo(() => {
        if (!snapshot.selectedTrackId || orderedCues.length === 0) return [];
        const identifiers = new Set<string>();
        orderedCues.forEach((cue: any) => {
            const cueTrackValue = cue.cueTrackValues?.find(
                (ctv: any) => ctv.trackId === snapshot.selectedTrackId,
            );
            if (cueTrackValue?.technicalIdentifier) {
                identifiers.add(cueTrackValue.technicalIdentifier);
            }
        });
        return Array.from(identifiers).sort();
    }, [snapshot.selectedTrackId, orderedCues]);

    const currentCue = orderedCues.find((c: any) => c.id === show?.currentCueId);
    const shareUrl = useMemo(() => {
        if (typeof window === "undefined") {
            return "";
        }
        return window.location.href;
    }, [snapshot.selectedTrackId, snapshot.selectedTechnicalIdentifier]);

    useEffect(() => {
        if (!isQrModalOpen || !shareUrl) {
            return;
        }

        let cancelled = false;
        setQrCodeError(null);
        setQrCodeDataUrl("");

        QRCode.toDataURL(shareUrl, { width: 320, margin: 2 })
            .then((dataUrl) => {
                if (cancelled) {
                    return;
                }
                setQrCodeDataUrl(dataUrl);
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }
                setQrCodeError("Could not generate QR code.");
            });

        return () => {
            cancelled = true;
        };
    }, [isQrModalOpen, shareUrl]);

    useEffect(() => {
        if (!show?.currentCueTakenAt || !currentCue || currentCue.cueOffsetMs === null) {
            return;
        }

        setNowMs(Date.now());
        const intervalId = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [currentCue, show?.currentCueTakenAt]);

    useEffect(() => {
        function parseHash() {
            const params = new URLSearchParams(window.location.hash.slice(1));
            const trackId = params.get("trackId");
            const identifier = params.get("identifier");
            const view = params.get("view");
            if (trackId) {
                store.selectedTrackId = trackId;
            }
            if (identifier) {
                store.selectedTechnicalIdentifier = identifier;
            }
            if (view === "top" || view === "bottom" || view === "both") {
                store.viewMode = view;
            }
        }

        // On initial load, parse hash for selected track and technical identifier
        parseHash();

        window.addEventListener("hashchange", parseHash);

        return () => {
            window.removeEventListener("hashchange", parseHash);
        };
    }, []);

    // Now safe to have early returns
    if (!showId) {
        return (
            <Card className="bg-card/75 m-4">
                <CardHeader>
                    <CardTitle>Invalid show</CardTitle>
                    <CardDescription>Could not find show ID in route.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (showQuery.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                Loading cues...
            </div>
        );
    }

    if (!showQuery.data) {
        return (
            <Card className="bg-card/75 m-4">
                <CardHeader>
                    <CardTitle>Show not found</CardTitle>
                    <CardDescription>The show you requested could not be found.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    // Calculate cue windows
    // After guards, show is guaranteed to be non-null
    const safeShow = show!;
    const currentCueIndex = orderedCues.findIndex((c: any) => c.id === safeShow.currentCueId);
    const nextCueIndex = orderedCues.findIndex((c: any) => c.id === safeShow.nextCueId);

    // Build top pane cues: current + next + up to 23 following
    // If current exists, start from current; otherwise start from next
    let topPaneCues = [] as Cue[];
    if (nextCueIndex !== -1) {
        topPaneCues = orderedCues.slice(nextCueIndex, undefined);
    } else if (currentCueIndex === -1) {
        topPaneCues = orderedCues.filter((cue) => cue.id !== safeShow.currentCueId);
    }

    // Build bottom pane: cues filtered by selected track and technical identifier
    let bottomPaneCues: any[] = [];
    if (snapshot.selectedTrackId && snapshot.selectedTechnicalIdentifier) {
        bottomPaneCues = orderedCues.slice(currentCueIndex >= 0 ? currentCueIndex : nextCueIndex >= 0 ? nextCueIndex : 0, undefined).filter((cue: any) => {
            const cueTrackValue = cue.cueTrackValues?.find(
                (ctv: any) => ctv.trackId === snapshot.selectedTrackId,
            );
            return cueTrackValue?.technicalIdentifier === snapshot.selectedTechnicalIdentifier;
        });
    }

    // Splitter dragging
    function handleSplitterPointerDown() {
        setIsDraggingSplitter(true);

        function handlePointerMove(event: PointerEvent) {
            const container = splitterRef.current?.parentElement;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const relativeY = clamp(event.clientY - rect.top, 0, rect.height);
            const nextPercent = rect.height > 0 ? (relativeY / rect.height) * 100 : 50;
            store.splitterPositionPercent = clamp(nextPercent, 20, 80);
        }

        function handlePointerUp() {
            setIsDraggingSplitter(false);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        }

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
    }

    function handleSelectedTrackChange(selectedTrackId?: string) {
        store.selectedTrackId = selectedTrackId || null;
        store.selectedTechnicalIdentifier = null;
        updateHash(selectedTrackId || null, null);
    }

    function handleSelectedTechnicalIdentifierChange(selectedTechnicalIdentifier?: string) {
        store.selectedTechnicalIdentifier = selectedTechnicalIdentifier || null;
        updateHash(store.selectedTrackId, selectedTechnicalIdentifier || null);
    }

    function updateHash(selectedTrackId: string | null, selectedTechnicalIdentifier: string | null, viewMode?: CueListViewMode) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (selectedTrackId) {
            params.set("trackId", selectedTrackId);
        } else {
            params.delete("trackId");
        }
        if (selectedTechnicalIdentifier) {
            params.set("identifier", selectedTechnicalIdentifier);
        } else {
            params.delete("identifier");
        }
        const resolvedViewMode = viewMode ?? store.viewMode;
        if (resolvedViewMode && resolvedViewMode !== "both") {
            params.set("view", resolvedViewMode);
        } else {
            params.delete("view");
        }
        window.location.hash = params.toString();
    }

    function handleViewModeChange(newViewMode: CueListViewMode) {
        store.viewMode = newViewMode;
        updateHash(store.selectedTrackId, store.selectedTechnicalIdentifier, newViewMode);
    }

    const viewModeToggle = (
        <div className="flex gap-1">
            <Button
                type="button"
                variant={snapshot.viewMode === "top" ? "default" : "outline"}
                size="sm"
                title="Top pane only"
                onClick={() => handleViewModeChange("top")}
            >
                <PanelTop size={16} />
            </Button>
            <Button
                type="button"
                variant={snapshot.viewMode === "both" ? "default" : "outline"}
                size="sm"
                title="Both panes"
                onClick={() => handleViewModeChange("both")}
            >
                <Rows2 size={16} />
            </Button>
            <Button
                type="button"
                variant={snapshot.viewMode === "bottom" ? "default" : "outline"}
                size="sm"
                title="Bottom pane only"
                onClick={() => handleViewModeChange("bottom")}
            >
                <PanelBottom size={16} />
            </Button>
        </div>
    );

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
            {/* Top pane */}
            {(snapshot.viewMode === "both" || snapshot.viewMode === "top") && (
                <div
                    style={snapshot.viewMode === "both" ? { height: `${snapshot.splitterPositionPercent}%` } : undefined}
                    className={cn("flex flex-col border-b border-border/50 overflow-hidden", snapshot.viewMode === "top" && "flex-1")}
                >
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {topPaneCues.length === 0 && !currentCue ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No cues to display
                            </div>
                        ) : (
                            <>
                                {currentCue !== undefined ? (
                                    <CueListItem
                                        key={currentCue.id}
                                        cue={currentCue}
                                        show={safeShow}
                                        status={"current"}
                                        countdownText={'\u00A0'}
                                        cameraColors={cameraColors}
                                        trackValues={currentCue.cueTrackValues?.reduce(
                                            (acc: Record<string, string | null>, ctv: any) => {
                                                acc[ctv.trackId] = ctv.technicalIdentifier;
                                                return acc;
                                            },
                                            {},
                                        )}
                                    />
                                ) : null}
                                {topPaneCues.map((cue: any, idx: number) => {
                                    let status: "current" | "next" | "following" = "following";
                                    if (cue.id === safeShow.currentCueId) {
                                        status = "current";
                                    } else if (cue.id === safeShow.nextCueId) {
                                        status = "next";
                                    }

                                    const trackValues = cue.cueTrackValues?.reduce(
                                        (acc: Record<string, string | null>, ctv: any) => {
                                            acc[ctv.trackId] = ctv.technicalIdentifier;
                                            return acc;
                                        },
                                        {},
                                    );

                                    return (
                                        <CueListItem
                                            key={cue.id}
                                            cue={cue}
                                            show={safeShow}
                                            status={status}
                                            countdownText={getCueCountdownText(cue, currentCue, safeShow.currentCueTakenAt, nowMs)}
                                            cameraColors={cameraColors}
                                            trackValues={trackValues}
                                        />
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Splitter — only when showing both panes */}
            {snapshot.viewMode === "both" && (
                <div
                    ref={splitterRef}
                    onPointerDown={handleSplitterPointerDown}
                    className={cn(
                        "h-1 bg-border/50 hover:bg-primary/50 cursor-row-resize transition-colors",
                        isDraggingSplitter && "bg-primary",
                    )}
                    aria-label="Resize panes"
                />
            )}

            {/* Bottom pane */}
            {(snapshot.viewMode === "both" || snapshot.viewMode === "bottom") && (
                <div
                    style={snapshot.viewMode === "both" ? { height: `${100 - snapshot.splitterPositionPercent}%` } : undefined}
                    className={cn("flex flex-col overflow-hidden", snapshot.viewMode === "bottom" && "flex-1")}
                >
                    <div className="border-b border-border/50 bg-background/50 px-4 py-3 space-y-3">
                        <div className="flex items-end gap-3">
                            <div className="grid grid-cols-2 gap-3 flex-1">
                                {/* Track selector */}
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                        Track
                                    </label>
                                    <select
                                        value={snapshot.selectedTrackId || ""}
                                        onChange={(e) => handleSelectedTrackChange(e.target.value || undefined)}
                                        className="w-full border border-border/70 bg-background px-3 py-2 text-sm"
                                    >
                                        <option value="">— Select track —</option>
                                        {safeShow.tracks.map((track: any) => (
                                            <option key={track.id} value={track.id}>
                                                {track.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Technical identifier selector */}
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                        Value
                                    </label>
                                    <div className="flex gap-2">
                                        <select
                                            value={snapshot.selectedTechnicalIdentifier || ""}
                                            onChange={(e) => handleSelectedTechnicalIdentifierChange(e.target.value || undefined)}
                                            disabled={!snapshot.selectedTrackId}
                                            className="w-full border border-border/70 bg-background px-3 py-2 text-sm disabled:opacity-50"
                                        >
                                            <option value="">— Select value —</option>
                                            {selectedTrackTechnicalIdentifiers.map((identifier) => (
                                                <option key={identifier} value={identifier}>
                                                    {identifier}
                                                </option>
                                            ))}
                                        </select>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0"
                                            onClick={() => setIsQrModalOpen(true)}
                                        >
                                            <QrCodeIcon size={20} />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* View mode toggle */}
                            {viewModeToggle}
                        </div>
                    </div>

                    {/* Bottom pane content */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {bottomPaneCues.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                {snapshot.selectedTrackId && snapshot.selectedTechnicalIdentifier
                                    ? "No cues match the selected filter"
                                    : "Select a track and value to filter cues"}
                            </div>
                        ) : (
                            bottomPaneCues.map((cue: any) => {
                                let status: "current" | "next" | "following" = "following";
                                if (cue.id === safeShow.currentCueId) {
                                    status = "current";
                                } else if (cue.id === safeShow.nextCueId) {
                                    status = "next";
                                }

                                const trackValues = cue.cueTrackValues?.reduce(
                                    (acc: Record<string, string | null>, ctv: any) => {
                                        acc[ctv.trackId] = ctv.technicalIdentifier;
                                        return acc;
                                    },
                                    {},
                                );

                                return (
                                    <CueListItem
                                        key={cue.id}
                                        cue={cue}
                                        show={safeShow}
                                        status={status}
                                        countdownText={getCueCountdownText(cue, currentCue, safeShow.currentCueTakenAt, nowMs)}
                                        cameraColors={cameraColors}
                                        trackValues={trackValues}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* When only the top pane is shown, render the view mode toggle in a thin bar at the bottom */}
            {snapshot.viewMode === "top" && (
                <div className="border-t border-border/50 bg-background/50 px-4 py-2 flex items-center justify-end">
                    {viewModeToggle}
                </div>
            )}

            {isQrModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
                    <Card className="w-full max-w-sm bg-card/95">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>Open on mobile</CardTitle>
                                <CardDescription>Scan this QR code to open this exact cue list view.</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setIsQrModalOpen(false)}>
                                Close
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center gap-3">
                                {qrCodeError ? (
                                    <div className="text-sm text-destructive">{qrCodeError}</div>
                                ) : qrCodeDataUrl ? (
                                    <img
                                        src={qrCodeDataUrl}
                                        alt="QR code for current cue list URL"
                                        className="h-64 w-64 rounded border border-border/70 bg-white p-2"
                                    />
                                ) : (
                                    <div className="text-sm text-muted-foreground">Generating QR code…</div>
                                )}
                                <div className="w-full break-all text-xs text-muted-foreground">{shareUrl}</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </div>
    );
}

/** Wrapper component that provides the store and renders the view */
export function CueListView() {
    const { showId } = useParams();

    if (!showId) {
        return (
            <Card className="bg-card/75 m-4">
                <CardHeader>
                    <CardTitle>Invalid show</CardTitle>
                    <CardDescription>Could not find show ID in route.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <CueListViewStoreProvider showId={showId}>
            <CueListViewContent />
        </CueListViewStoreProvider>
    );
}
