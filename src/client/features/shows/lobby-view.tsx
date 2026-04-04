import { useMemo, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "@/client/lib/trpc";
import { cn, getContrastColor } from "@/client/lib/utils";
import { Cue } from "@/server/db/entities/Cue";
import { Show } from "@/server/db/entities/Show";

interface LobbyItemProps {
    cue: Cue;
    show: Show;
    status: "current" | "next";
    countdownText: string;
    trackValues: Record<string, string | null>;
    cameraColors: Record<string, string>;
}

function LobbyItem({ cue, show, status, countdownText, trackValues, cameraColors }: LobbyItemProps) {
    const isCurrent = status === "current";

    return (
        <div
            className={cn(
                "flex flex-col gap-4 px-8 py-6 border-l-[12px] transition-colors",
                isCurrent
                    ? "border-l-red-500 bg-red-600/20"
                    : "border-l-green-500 bg-green-600/10",
            )}
        >
            <div className="flex items-baseline gap-6 flex-wrap">
                <span
                    className={cn(
                        "font-bold uppercase tracking-widest",
                        isCurrent ? "text-red-400 text-2xl" : "text-green-400 text-xl",
                    )}
                >
                    {isCurrent ? "NOW" : "NEXT"}
                </span>
                <span className={cn("font-mono font-bold", isCurrent ? "text-8xl" : "text-6xl")}>
                    {cue.cueId}
                </span>
                {countdownText.trim() ? (
                    <span
                        className={cn(
                            "font-mono text-muted-foreground",
                            isCurrent ? "text-5xl" : "text-4xl",
                        )}
                    >
                        {countdownText}
                    </span>
                ) : null}
            </div>

            {cue.comment ? (
                <div
                    className={cn(
                        "font-medium text-foreground leading-tight",
                        isCurrent ? "text-5xl" : "text-4xl",
                    )}
                >
                    {cue.comment}
                </div>
            ) : null}

            {show.tracks.length > 0 ? (
                <div className="flex flex-wrap gap-4 mt-1">
                    {show.tracks.map((track: any) => {
                        const value = trackValues[track.id] ?? null;
                        const isCamera = track.type === "camera";
                        const bgColor =
                            isCamera && value ? (cameraColors[value] ?? "transparent") : "transparent";
                        const textColor =
                            isCamera && value && cameraColors[value]
                                ? getContrastColor(cameraColors[value])
                                : undefined;

                        return (
                            <div key={track.id} className="flex flex-col items-center gap-1">
                                <div
                                    className={cn(
                                        "font-mono font-semibold px-4 py-2 rounded",
                                        isCurrent ? "text-4xl" : "text-3xl",
                                    )}
                                    style={{ backgroundColor: bgColor, color: textColor }}
                                >
                                    {value || "—"}
                                </div>
                                <div className="text-muted-foreground text-sm">{track.name}</div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
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

function buildTrackValues(cue: Cue): Record<string, string | null> {
    return (cue.cueTrackValues ?? []).reduce(
        (acc: Record<string, string | null>, ctv: any) => {
            acc[ctv.trackId] = ctv.technicalIdentifier;
            return acc;
        },
        {},
    );
}

function getCueCountdownText(
    cue: Cue,
    currentCue: Cue | undefined,
    currentCueTakenAt: string | Date | null | undefined,
    nowMs: number,
): string {
    if (
        !currentCue ||
        currentCue.cueOffsetMs === null ||
        cue.cueOffsetMs === null ||
        !currentCueTakenAt
    ) {
        return "";
    }

    const takenAtMs = new Date(currentCueTakenAt).getTime();
    if (Number.isNaN(takenAtMs)) {
        return "";
    }

    const remainingMs = cue.cueOffsetMs - currentCue.cueOffsetMs - (nowMs - takenAtMs);
    if (remainingMs <= 0) {
        return "";
    }

    return formatOffset(remainingMs);
}

/** Lobby display – large read-only view of the active show's current and next cues */
export function LobbyView() {
    const { showId } = useParams();
    const utils = trpc.useUtils();
    const [nowMs, setNowMs] = useState(() => Date.now());

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
                if (!showId) return;
                await utils.show.getDetail.invalidate({ showId });
            },
        },
    );

    const show = showQuery.data;
    const orderedCues = useMemo(() => {
        if (!show) return [];
        return show.cues.slice().sort((a: any, b: any) => a.orderKey.localeCompare(b.orderKey));
    }, [show]);

    const currentCue = useMemo(
        () => orderedCues.find((c: any) => c.id === show?.currentCueId),
        [orderedCues, show?.currentCueId],
    );
    const nextCue = useMemo(
        () => orderedCues.find((c: any) => c.id === show?.nextCueId),
        [orderedCues, show?.nextCueId],
    );

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

    if (!showId) {
        return (
            <div className="flex min-h-screen items-center justify-center text-2xl text-muted-foreground">
                No show specified.
            </div>
        );
    }

    if (showQuery.isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center text-2xl text-muted-foreground">
                Loading…
            </div>
        );
    }

    if (!show) {
        return (
            <div className="flex min-h-screen items-center justify-center text-2xl text-muted-foreground">
                Show not found.
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <div className="px-8 py-4 border-b border-border/40 flex items-center justify-between">
                <span className="text-3xl font-semibold text-muted-foreground truncate">
                    {show.name}
                </span>
                <Clock />
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col justify-center gap-6 px-4 py-8">
                {!currentCue && !nextCue ? (
                    <div className="flex items-center justify-center text-4xl text-muted-foreground">
                        No active cue
                    </div>
                ) : (
                    <>
                        {currentCue ? (
                            <LobbyItem
                                cue={currentCue}
                                show={show as Show}
                                status="current"
                                countdownText=""
                                trackValues={buildTrackValues(currentCue)}
                                cameraColors={cameraColors}
                            />
                        ) : null}

                        {nextCue ? (
                            <LobbyItem
                                cue={nextCue}
                                show={show as Show}
                                status="next"
                                countdownText={getCueCountdownText(
                                    nextCue,
                                    currentCue,
                                    show.currentCueTakenAt,
                                    nowMs,
                                )}
                                trackValues={buildTrackValues(nextCue)}
                                cameraColors={cameraColors}
                            />
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}

/** Simple real-time clock displayed in the header */
function Clock() {
    const [time, setTime] = useState(() => new Date());

    useEffect(() => {
        const id = window.setInterval(() => setTime(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const formatted = time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    return (
        <span className="font-mono text-3xl text-muted-foreground tabular-nums">{formatted}</span>
    );
}
