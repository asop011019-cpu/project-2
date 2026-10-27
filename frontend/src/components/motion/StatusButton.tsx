import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "pending" | "success" | "error";

/**
 * Turns a mutation's state into what the button shows. Success and failure only appear after the
 * server answered (status flips there), and fade back to idle after `ms` or on the next request.
 */
export function useSaveStatus(
  status: "idle" | "pending" | "success" | "error",
  submittedAt: number,
  ms = 1600,
): SaveStatus {
  // Shown straight from the mutation's own status (no gap between "saving" and the result);
  // only the moment it fades back is remembered.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => {
    if (status !== "success" && status !== "error") return;
    const timer = window.setTimeout(() => setDismissedAt(submittedAt), ms);
    return () => window.clearTimeout(timer);
  }, [status, submittedAt, ms]);
  if (status === "idle") return "idle";
  if (status === "pending") return "pending";
  return dismissedAt === submittedAt ? "idle" : status;
}

/**
 * A save button whose one shape changes state in place (MOT-001, after the MORSE reference): the
 * label swaps with a short blur, the fill shifts colour, and the size never changes, so nothing
 * around it moves. Every label sits in the same grid cell, so the widest one sets the width.
 */
export function StatusButton({
  status,
  labels,
  className,
  disabled,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  status: SaveStatus;
  labels: { idle: string; pending: string; success: string; error: string };
}) {
  const states: SaveStatus[] = ["idle", "pending", "success", "error"];
  // Two clicks in the same moment arrive before "pending" re-renders the button as disabled;
  // the second one is dropped until the status moves (or briefly, when no request started).
  const lock = useRef(false);
  useEffect(() => {
    lock.current = false;
  }, [status]);
  return (
    <Button
      {...props}
      onClick={(event) => {
        if (lock.current) return;
        lock.current = true;
        window.setTimeout(() => {
          lock.current = false;
        }, 400);
        onClick?.(event);
      }}
      data-status={status}
      aria-busy={status === "pending" || undefined}
      // A request in flight cannot be sent twice.
      disabled={disabled || status === "pending"}
      className={cn("status-button", className)}
    >
      <span className="status-button-stack">
        {states.map((s) => (
          <span
            key={s}
            className="status-button-label"
            data-active={s === status || undefined}
            aria-hidden={s !== status || undefined}
          >
            {s === "success" && <Check aria-hidden="true" />}
            {s === "error" && <RotateCcw aria-hidden="true" />}
            {labels[s]}
          </span>
        ))}
      </span>
      {status === "pending" && <span className="status-button-progress" aria-hidden="true" />}
    </Button>
  );
}
