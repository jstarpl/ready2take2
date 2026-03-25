import { useMemo, useRef, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSnapshot } from "valtio";
import { trpc } from "@/client/lib/trpc";
import { Card, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { cn } from "@/client/lib/utils";
import {
    CueListViewStoreContext,
    getOrCreateCueListViewStore,
    destroyCueListViewStore,
    useCueListViewStore,
} from "@/client/features/shows/cue-list-view-store";
import { Cue } from "@/server/db/entities/Cue";
import { Show } from "@/server/db/entities/Show";

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

interface CueListItemProps {
    cue: Cue;
    show: Show;
    status: "current" | "next" | "following";
    trackValues: Record<string, string | null>;
}

function CueListItem({ cue, show, status, trackValues }: CueListItemProps) {
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
                        {cue.cueOffsetMs !== null ? formatOffset(cue.cueOffsetMs) : "—"}
                    </div>
                </div>
                {show.tracks.length > 0 && (
                    show.tracks.map((track: any) => (
                        <div key={track.id} className="flex flex-col gap-1 relative self-stretch justify-self-stretch align-center items-center">
                            <div className="absolute text-muted-foreground text-xs -bottom-3">{track.name}</div>
                            <div className="text-4xl text-foreground px-2 py-1">
                                {trackValues[track.id] || "—"}
                            </div>
                        </div>
                    ))
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

    const showQuery = trpc.show.getDetail.useQuery(
        { showId: showId ?? "" },
        { enabled: Boolean(showId) },
    );

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
    const currentCue = orderedCues.find((c: any) => c.id === safeShow.currentCueId);
    const nextCueIndex = orderedCues.findIndex((c: any) => c.id === safeShow.nextCueId);

    // Build top pane cues: current + next + up to 23 following
    // If current exists, start from current; otherwise start from next
    let topPaneCues = [];
    if (nextCueIndex !== -1) {
        topPaneCues = orderedCues.slice(nextCueIndex, nextCueIndex + 25);
    } else {
        topPaneCues = orderedCues.slice(0, 25).filter((cue) => cue.id !== safeShow.currentCueId);
    }

    // Build bottom pane: cues filtered by selected track and technical identifier
    let bottomPaneCues: any[] = [];
    if (snapshot.selectedTrackId && snapshot.selectedTechnicalIdentifier) {
        bottomPaneCues = orderedCues.filter((cue: any) => {
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

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
            {/* Top pane */}
            <div style={{ height: `${snapshot.splitterPositionPercent}%` }} className="flex flex-col border-b border-border/50 overflow-hidden">
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
                                        trackValues={trackValues}
                                    />
                                );
                            })}
                        </>
                    )}
                </div>
            </div>

            {/* Splitter */}
            <div
                ref={splitterRef}
                onPointerDown={handleSplitterPointerDown}
                className={cn(
                    "h-1 bg-border/50 hover:bg-primary/50 cursor-row-resize transition-colors",
                    isDraggingSplitter && "bg-primary",
                )}
                aria-label="Resize panes"
            />

            {/* Bottom pane */}
            <div style={{ height: `${100 - snapshot.splitterPositionPercent}%` }} className="flex flex-col overflow-hidden">
                <div className="border-b border-border/50 bg-background/50 px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        {/* Track selector */}
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                Track
                            </label>
                            <select
                                value={snapshot.selectedTrackId || ""}
                                onChange={(e) => {
                                    store.selectedTrackId = e.target.value || null;
                                    store.selectedTechnicalIdentifier = null;
                                }}
                                className="w-full rounded border border-border/70 bg-background px-3 py-2 text-sm"
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
                            <select
                                value={snapshot.selectedTechnicalIdentifier || ""}
                                onChange={(e) => {
                                    store.selectedTechnicalIdentifier = e.target.value || null;
                                }}
                                disabled={!snapshot.selectedTrackId}
                                className="w-full rounded border border-border/70 bg-background px-3 py-2 text-sm disabled:opacity-50"
                            >
                                <option value="">— Select value —</option>
                                {selectedTrackTechnicalIdentifiers.map((identifier) => (
                                    <option key={identifier} value={identifier}>
                                        {identifier}
                                    </option>
                                ))}
                            </select>
                        </div>
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
                                    trackValues={trackValues}
                                />
                            );
                        })
                    )}
                </div>
            </div>
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
