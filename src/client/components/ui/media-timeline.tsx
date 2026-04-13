import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/client/lib/utils";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface MediaTimelineMarker {
  id: string;
  label: string;
  value: number;
}

interface MediaTimelineProps {
  value: number;
  max: number;
  disabled?: boolean;
  ariaLabel?: string;
  markers?: MediaTimelineMarker[];
  onChange: (value: number) => void;
  onMarkerSelect?: (value: number) => void;
}

export function MediaTimeline({
  value,
  max,
  disabled = false,
  ariaLabel = "Timeline",
  markers = [],
  onChange,
  onMarkerSelect,
}: MediaTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sliderMax = max > 0 ? max : 1;
  const clampedValue = clamp(value, 0, sliderMax);
  const playedPercent = (clampedValue / sliderMax) * 100;

  const visibleMarkers = useMemo(
    () => markers.map((marker) => ({ ...marker, value: clamp(marker.value, 0, sliderMax) })),
    [markers, sliderMax],
  );

  function getValueFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) {
      return clampedValue;
    }

    const rect = track.getBoundingClientRect();
    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const nextPercent = rect.width > 0 ? relativeX / rect.width : 0;
    return nextPercent * sliderMax;
  }

  function beginDrag(clientX: number) {
    if (disabled) {
      return;
    }

    onChange(getValueFromClientX(clientX));

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      event.stopPropagation();
      onChange(getValueFromClientX(event.clientX));
    }

    function handlePointerUp(event: PointerEvent) {
      onChange(getValueFromClientX(event.clientX));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onChange(clamp(clampedValue - 1000, 0, sliderMax));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onChange(clamp(clampedValue + 1000, 0, sliderMax));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChange(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onChange(sliderMax);
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={sliderMax}
      aria-valuenow={Math.round(clampedValue)}
      className={cn(
        "relative h-8 w-full outline-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.stopPropagation();
        beginDrag(event.clientX);
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-1 -translate-y-1/2 bg-muted/40" />
      <div
        className="pointer-events-none absolute left-0 top-1/2 z-[1] h-1 -translate-y-1/2 bg-primary/70"
        style={{ width: `${playedPercent}%` }}
      />

      <div className="absolute inset-0 z-10">
        {visibleMarkers.map((marker) => {
          const markerPercent = (marker.value / sliderMax) * 100;
          return (
            <button
              key={marker.id}
              type="button"
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-primary/50 bg-primary/80"
              style={{ left: `${markerPercent}%` }}
              title={marker.label}
              disabled={disabled}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onMarkerSelect?.(marker.value);
              }}
              aria-label={marker.label}
            />
          );
        })}
      </div>

      <div
        className="pointer-events-none absolute top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary border-2 bg-background shadow-sm"
        style={{ left: `${playedPercent}%` }}
      />
    </div>
  );
}