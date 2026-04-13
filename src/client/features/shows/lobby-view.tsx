import { useMemo, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "@/client/lib/trpc";
import { cn, getContrastColor } from "@/client/lib/utils";
import { Cue } from "@/server/db/entities/Cue";
import { Show } from "@/server/db/entities/Show";
import { ShowEventType } from "@/shared/types/domain";

interface LobbyItemProps {
    cue: Cue;
    show: Show;
    status: "current" | "next" | "following";
    countdownText: string;
    trackValues: Record<string, string | null>;
    cameraColors: Record<string, string>;
}

function LobbyItem({ cue, show, status, countdownText, trackValues, cameraColors }: LobbyItemProps) {
    const isCurrent = status === "current";
    const isNext = status === "next";

    const firstCameraTrack = show.tracks.find((t) => t.type === "camera");

    const otherTracks = show.tracks.filter((t) => t.id !== firstCameraTrack?.id);

    const value = trackValues[firstCameraTrack?.id ?? ""] ?? null;
    const isCamera = firstCameraTrack?.type === "camera";
    const bgColor =
        isCamera && value ? (cameraColors[value] ?? "transparent") : "transparent";
    const textColor =
        isCamera && value && cameraColors[value]
            ? getContrastColor(cameraColors[value])
            : undefined;

    return (
        <div
            className={cn(
                "flex flex-col gap-4 px-8 py-6 border-l-[12px] transition-colors",
                isCurrent
                    ? "border-l-red-500 bg-red-600/20"
                    : isNext
                        ? "border-l-green-500 bg-green-600/10"
                        : "border-l-transparent bg-transparent border-b-[1px]",
            )}
        >
            <div className="flex items-baseline gap-6 flex-wrap">
                <div className={cn("font-mono font-bold text-6xl min-w-[3ch]")}>
                    {cue.cueId}
                </div>
                <div
                    className={cn(
                        "font-mono text-muted-foreground min-w-[6ch] text-5xl",
                    )}
                >
                    {countdownText}
                </div>
                {firstCameraTrack ? (
                        <div key={firstCameraTrack.id} className="flex flex-col items-center gap-1">
                            <div
                                className={cn(
                                    "font-semibold px-4 py-2 text-7xl min-w-[2ch] text-center",
                                )}
                                style={{ backgroundColor: bgColor, color: textColor }}
                            >
                                {value || "—"}
                            </div>
                            <div className="text-muted-foreground text-sm">{firstCameraTrack.name}</div>
                        </div>
                ) : null}
                <div
                    className={cn(
                        "font-medium text-foreground leading-tight flex-1",
                        isCurrent ? "text-5xl" : "text-4xl",
                    )}
                >
                    {cue.comment}
                </div>
                <div
                    className={cn(
                        "font-bold uppercase tracking-widest",
                        isCurrent ? "text-red-400 text-2xl" : isNext ? "text-green-400 text-xl" : "text-blue-400 text-xl",
                    )}
                >
                    {isCurrent ? "NOW" : isNext ? "NEXT" : null}
                </div>
            </div>

            {otherTracks.length > 0 ? (
                <div className="flex flex-wrap gap-4 mt-1">
                    {otherTracks.map((track: any) => {
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
                                        isCurrent ? "text-3xl" : "text-3xl",
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
    const utils = trpc.useUtils();
    const [nowMs, setNowMs] = useState(() => Date.now());

    const showQuery = trpc.show.getActiveShowDetail.useQuery(
        null,
        { enabled: true },
    );

    const cameraColorsQuery = trpc.cameraColorSetting.list.useQuery();
    const cameraColors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const entry of cameraColorsQuery.data ?? []) {
            map[entry.identifier] = entry.color;
        }
        return map;
    }, [cameraColorsQuery.data]);

    const show = showQuery.data;
    const showId = show?.id;

    trpc.show.subscribe.useSubscription(
        { showId: "*" },
        {
            enabled: true,
            onData: async (data) => {
                if (data.type === "show.currentCueChanged" || data.type === "show.nextCueChanged") {
                    await utils.show.getActiveShowDetail.invalidate();
                } else if (data.showId === showId) {
                    await utils.show.getActiveShowDetail.invalidate();
                }
            },
        },
    );

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
            <div className="flex min-h-screen items-center justify-center text-2xl text-muted-foreground flex-col gap-4">
                <div>
                    No active show found.
                </div>
                <Clock />
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
            <div className="flex min-h-screen items-center justify-center text-2xl text-muted-foreground flex-col gap-4">
                <div>
                    No active show found.
                </div>
                <Clock />
            </div>
        );
    }

    const currentCueIndex = orderedCues.findIndex((c: any) => c.id === show.currentCueId);
    const nextCueIndex = orderedCues.findIndex((c: any) => c.id === show.nextCueId);

    // Build top pane cues: current + next + up to 23 following
    // If current exists, start from current; otherwise start from next
    let followingCues = [] as Cue[];
    if (nextCueIndex !== -1) {
        followingCues = orderedCues.slice(nextCueIndex, undefined);
    } else if (currentCueIndex === -1) {
        followingCues = orderedCues.filter((cue) => cue.id !== show.currentCueId);
    }

    return (
        <div className="min-h-screen w-full max-h-screen flex flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <div className="px-8 py-4 border-b border-border/40 flex items-center justify-between">
                <span className="text-3xl font-semibold text-muted-foreground truncate">
                    {show.name}
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col justify-start px-4">
                {!currentCue && !nextCue ? (
                    <div className="flex items-center justify-center text-4xl text-muted-foreground">
                        No active cue
                    </div>
                ) : (
                    <>
                        {currentCue ? (
                            <LobbyItem
                                cue={currentCue}
                                show={show}
                                status="current"
                                countdownText=""
                                trackValues={buildTrackValues(currentCue)}
                                cameraColors={cameraColors}
                            />
                        ) : null}

                        {followingCues.map((cue) => {
                            return (<LobbyItem
                                key={cue.id}
                                cue={cue}
                                show={show}
                                status={cue.id === show.nextCueId ? "next" : "following"}
                                countdownText={getCueCountdownText(
                                    cue,
                                    currentCue,
                                    show.currentCueTakenAt,
                                    nowMs,
                                )}
                                trackValues={buildTrackValues(cue)}
                                cameraColors={cameraColors}
                            />)
                        })}
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
        <span className="font-mono text-5xl text-muted-foreground tabular-nums">{formatted}</span>
    );
}
