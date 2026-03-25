import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { formatOffset } from "@/client/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type RouterOutput = inferRouterOutputs<AppRouter>;
type ShowDetail = NonNullable<RouterOutput["show"]["getDetail"]>;

type MediaKind = "image" | "video" | "audio" | "none";

function getMediaKind(mimeType: string | null | undefined, fileName: string) {
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }

  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }

  if (mimeType?.startsWith("audio/")) {
    return "audio" as const;
  }

  const normalizedFileName = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(normalizedFileName)) {
    return "image" as const;
  }

  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(normalizedFileName)) {
    return "video" as const;
  }

  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(normalizedFileName)) {
    return "audio" as const;
  }

  return "none" as const;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isTypingInFormField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || Boolean(target.closest("[contenteditable='true'], [contenteditable='']"))) {
    return true;
  }

  return Boolean(target.closest("input, textarea, select"));
}

interface ShowMediaPlayerProps {
  show: ShowDetail;
  serverUrl: string;
}

export function ShowMediaPlayer({ show, serverUrl }: ShowMediaPlayerProps) {
  const [selectedMediaFileId, setSelectedMediaFileId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selectedMediaFile = useMemo(
    () => show.mediaFiles.find((file) => file.id === selectedMediaFileId) ?? null,
    [show.mediaFiles, selectedMediaFileId],
  );

  const mediaKind: MediaKind = useMemo(() => {
    if (!selectedMediaFile) {
      return "none";
    }

    return getMediaKind(selectedMediaFile.mimeType, selectedMediaFile.originalName);
  }, [selectedMediaFile]);

  const mediaSrc = selectedMediaFile ? `${serverUrl}${selectedMediaFile.publicPath}` : null;
  const isVideo = mediaKind === "video";

  function getActiveMediaElement() {
    return isVideo ? videoRef.current : audioRef.current;
  }

  const cuesWithOffset = useMemo(() => {
    return show.cues
      .filter((cue) => cue.cueOffsetMs !== null)
      .map((cue) => ({
        id: cue.id,
        comment: cue.comment,
        offsetMs: cue.cueOffsetMs as number,
      }));
  }, [show.cues]);

  useEffect(() => {
    if (!selectedMediaFileId) {
      return;
    }

    const stillExists = show.mediaFiles.some((file) => file.id === selectedMediaFileId);
    if (stillExists) {
      return;
    }

    audioRef.current?.pause();
    videoRef.current?.pause();
    setSelectedMediaFileId(null);
    setIsPlaying(false);
    setDurationMs(0);
    setCurrentTimeMs(0);
    setPlaybackError(null);
  }, [show.mediaFiles, selectedMediaFileId]);

  useEffect(() => {
    audioRef.current?.pause();
    videoRef.current?.pause();
    setIsPlaying(false);
    setDurationMs(0);
    setCurrentTimeMs(0);
    setPlaybackError(null);
  }, [selectedMediaFileId]);

  useEffect(() => {
    setPlaybackError(null);
  }, [mediaSrc]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (isTypingInFormField(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        void handleTogglePlayback();
        return;
      }

      if (key === "j") {
        event.preventDefault();
        jumpBy(-1);
        return;
      }

      if (key === "l") {
        event.preventDefault();
        jumpBy(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentTimeMs, durationMs, selectedMediaFileId, isVideo]);

  function updateFromElementTime() {
    const mediaElement = getActiveMediaElement();
    if (!mediaElement) {
      return;
    }

    setCurrentTimeMs(mediaElement.currentTime * 1000);
  }

  function updateFromElementMetadata() {
    const mediaElement = getActiveMediaElement();
    if (!mediaElement) {
      return;
    }

    const nextDurationMs = Number.isFinite(mediaElement.duration) ? mediaElement.duration * 1000 : 0;
    setDurationMs(nextDurationMs > 0 ? nextDurationMs : 0);
  }

  async function handleTogglePlayback() {
    const mediaElement = getActiveMediaElement();
    if (!mediaElement || !selectedMediaFile) {
      return;
    }

    setPlaybackError(null);

    if (mediaElement.paused) {
      try {
        await mediaElement.play();
      } catch {
        setPlaybackError("Playback failed.");
      }
      return;
    }

    mediaElement.pause();
  }

  function seekTo(nextTimeMs: number) {
    const mediaElement = getActiveMediaElement();
    if (!mediaElement || durationMs <= 0) {
      return;
    }

    const clampedTimeMs = clamp(nextTimeMs, 0, durationMs);
    mediaElement.currentTime = clampedTimeMs / 1000;
    setCurrentTimeMs(clampedTimeMs);
  }

  function jumpBy(seconds: number) {
    const mediaElement = getActiveMediaElement();
    if (!mediaElement) {
      return;
    }

    const targetMs = currentTimeMs + seconds * 1000;
    const maxMs = durationMs > 0 ? durationMs : currentTimeMs;
    seekTo(clamp(targetMs, 0, maxMs));
  }

  const sliderMax = durationMs > 0 ? durationMs : 1;
  const sliderValue = clamp(currentTimeMs, 0, sliderMax);
  const controlsDisabled = !selectedMediaFile || durationMs <= 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-3">
        <div className="relative mb-3">
          <div className="pointer-events-none absolute inset-0 flex items-center px-1">
            <div className="h-1 w-full bg-muted/40" />
          </div>
          <Input
            type="range"
            min={0}
            max={sliderMax}
            value={sliderValue}
            className="relative z-10 h-8 w-full cursor-pointer border-0 bg-transparent px-0"
            onChange={(event) => seekTo(Number(event.target.value))}
            disabled={!selectedMediaFile}
            aria-label="Seek media"
          />
          {durationMs > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
              {cuesWithOffset.map((cue) => {
                const markerPosition = clamp((cue.offsetMs / durationMs) * 100, 0, 100);
                return (
                  <button
                    key={cue.id}
                    type="button"
                    className="pointer-events-auto absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 border border-primary/50 bg-primary/80"
                    style={{ left: `${markerPosition}%` }}
                    title={`${cue.comment || "Cue"} (${formatOffset(cue.offsetMs)})`}
                    onClick={() => seekTo(cue.offsetMs)}
                    aria-label={`Seek to cue ${cue.comment || formatOffset(cue.offsetMs)}`}
                  />
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {isVideo && mediaSrc ? (
              <video
                ref={videoRef}
                src={mediaSrc}
                className="h-24 w-40 border border-border/70 bg-black object-cover"
                onLoadedMetadata={updateFromElementMetadata}
                onTimeUpdate={updateFromElementTime}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setPlaybackError("Playback failed.")}
              />
            ) : null}
            {!isVideo ? (
              <audio
                ref={audioRef}
                src={mediaSrc ?? undefined}
                preload="metadata"
                onLoadedMetadata={updateFromElementMetadata}
                onTimeUpdate={updateFromElementTime}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setPlaybackError("Playback failed.")}
                className="hidden"
              />
            ) : null}

            <div className="min-w-[220px] space-y-1">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Media file</div>
              <select
                className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm"
                value={selectedMediaFileId ?? ""}
                onChange={(event) => setSelectedMediaFileId(event.target.value || null)}
              >
                <option value="">Select media file</option>
                {show.mediaFiles.map((mediaFile) => (
                  <option key={mediaFile.id} value={mediaFile.id}>
                    {mediaFile.originalName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => jumpBy(-10)} disabled={controlsDisabled}>
              -10s
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpBy(-5)} disabled={controlsDisabled}>
              -5s
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpBy(-1)} disabled={controlsDisabled}>
              -1s
            </Button>
            <Button
              size="default"
              className="h-12 w-12 px-0 rounded-full"
              onClick={() => void handleTogglePlayback()}
              disabled={!selectedMediaFile}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpBy(1)} disabled={controlsDisabled}>
              +1s
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpBy(5)} disabled={controlsDisabled}>
              +5s
            </Button>
            <Button size="sm" variant="outline" onClick={() => jumpBy(10)} disabled={controlsDisabled}>
              +10s
            </Button>
          </div>

          <div className="flex flex-col items-end gap-2 min-w-[220px]">
            <div className="text-2xl text-muted-foreground font-mono">
              {formatOffset(Math.round(currentTimeMs))} / {durationMs > 0 ? formatOffset(Math.round(durationMs)) : "00:00"}
            </div>
            {playbackError ? <div className="text-xs text-destructive">{playbackError}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
