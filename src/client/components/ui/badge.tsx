import { cn } from "@/client/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}
