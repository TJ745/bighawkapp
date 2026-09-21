import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "purple";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-tint-blue text-tint-blue-foreground",
  success: "bg-tint-green text-tint-green-foreground",
  warning: "bg-tint-amber text-tint-amber-foreground",
  danger: "bg-tint-red text-tint-red-foreground",
  purple: "bg-tint-purple text-tint-purple-foreground",
};

// One pill style for every status in the app; modules map their statuses to a tone.
export function StatusBadge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: StatusTone }) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
