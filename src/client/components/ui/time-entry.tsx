import * as React from "react";
import { Input } from "@/client/components/ui/input";
import { cn } from "@/client/lib/utils";

function formatTimeEntry(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }

  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseTimeEntry(value: string): number | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  if (/^\d+$/.test(trimmedValue)) {
    return Number(trimmedValue) * 1000;
  }

  const normalizedValue = trimmedValue.replace(/\s+/g, "");
  const [minutesPart, secondsPart = "", ...rest] = normalizedValue.split(":");
  if (rest.length > 0 || !/^\d+$/.test(minutesPart) || (secondsPart !== "" && !/^\d+$/.test(secondsPart))) {
    return null;
  }

  const minutes = Number(minutesPart);
  const seconds = secondsPart === "" ? 0 : Number(secondsPart);
  return (minutes * 60 + seconds) * 1000;
}

export interface TimeEntryProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> {
  value: number | null;
  onValueChange?: (value: number | null) => void;
}

export const TimeEntry = React.forwardRef<HTMLInputElement, TimeEntryProps>(
  ({ className, onBlur, onFocus, onValueChange, placeholder = "0:00", value, ...props }, ref) => {
    const [draftValue, setDraftValue] = React.useState(() => formatTimeEntry(value));
    const isFocusedRef = React.useRef(false);

    React.useEffect(() => {
      if (!isFocusedRef.current) {
        setDraftValue(formatTimeEntry(value));
      }
    }, [value]);

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const nextDraftValue = event.target.value;
      setDraftValue(nextDraftValue);

      if (!nextDraftValue.trim()) {
        onValueChange?.(null);
        return;
      }

      const parsedValue = parseTimeEntry(nextDraftValue);
      if (parsedValue !== null) {
        onValueChange?.(parsedValue);
      }
    }

    function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
      isFocusedRef.current = false;

      if (!draftValue.trim()) {
        onValueChange?.(null);
        setDraftValue("");
        onBlur?.(event);
        return;
      }

      const parsedValue = parseTimeEntry(draftValue);
      if (parsedValue !== null) {
        onValueChange?.(parsedValue);
        setDraftValue(formatTimeEntry(parsedValue));
      } else {
        setDraftValue(formatTimeEntry(value));
      }

      onBlur?.(event);
    }

    return (
      <Input
        {...props}
        ref={ref}
        autoComplete="off"
        className={cn("font-mono", className)}
        inputMode="text"
        placeholder={placeholder}
        spellCheck={false}
        type="text"
        value={draftValue}
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={(event) => {
          isFocusedRef.current = true;
          onFocus?.(event);
        }}
      />
    );
  },
);

TimeEntry.displayName = "TimeEntry";