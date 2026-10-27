import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/conditions";

/**
 * 손잡이 1~2개짜리 막대. values가 null이면 비활성(회색)이고 누르면 onActivate.
 * 두 손잡이는 서로 교차하지 않는다(같은 값은 허용).
 */
export function RangeBar({
  min,
  max,
  step,
  values,
  thumbLabels,
  valueText,
  disabled,
  onChange,
  onActivate,
  activateLabel,
}: {
  min: number;
  max: number;
  step: number;
  values: number[] | null;
  thumbLabels: string[];
  valueText: (v: number) => string;
  disabled: boolean;
  onChange: (values: number[]) => void;
  onActivate: () => void;
  activateLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const setAt = (index: number, raw: number) => {
    if (!values) return;
    let v = clamp(Math.round((raw - min) / step) * step + min, min, max);
    if (values.length === 2) {
      if (index === 0) v = Math.min(v, values[1]!);
      else v = Math.max(v, values[0]!);
    }
    if (v === values[index]) return;
    const next = [...values];
    next[index] = v;
    onChange(next);
  };

  const valueFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return min + clamp((clientX - rect.left) / rect.width, 0, 1) * (max - min);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!values) {
      onActivate();
      return;
    }
    const raw = valueFromPointer(e.clientX);
    if (raw === null) return;
    let index = 0;
    if (values.length === 2) {
      const d0 = Math.abs(raw - values[0]!);
      const d1 = Math.abs(raw - values[1]!);
      index = d1 < d0 || (d1 === d0 && raw > values[1]!) ? 1 : 0;
    }
    dragIndex.current = index;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setAt(index, raw);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragIndex.current === null) return;
    const raw = valueFromPointer(e.clientX);
    if (raw !== null) setAt(dragIndex.current, raw);
  };
  const endDrag = () => {
    dragIndex.current = null;
  };

  const onKey = (index: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (!values || disabled) return;
    const cur = values[index]!;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    setAt(index, next);
  };

  const active = values !== null;
  return (
    <div
      ref={trackRef}
      className={cn("relative h-11 touch-none select-none", disabled && "opacity-60")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full",
          active ? "bg-secondary" : "bg-muted",
        )}
      />
      {active && (
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
          style={
            values.length === 2
              ? { left: `${pct(values[0]!)}%`, width: `${pct(values[1]!) - pct(values[0]!)}%` }
              : { left: 0, width: `${pct(values[0]!)}%` }
          }
        />
      )}
      {active ? (
        values.map((v, i) => (
          <div
            key={i}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={thumbLabels[i]}
            aria-valuemin={values.length === 2 && i === 1 ? values[0] : min}
            aria-valuemax={values.length === 2 && i === 0 ? values[1] : max}
            aria-valuenow={v}
            aria-valuetext={valueText(v)}
            aria-disabled={disabled || undefined}
            onKeyDown={onKey(i)}
            className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${pct(v)}%`, zIndex: i === dragIndex.current ? 2 : 1 }}
          >
            <span className="h-5 w-5 rounded-full border-2 border-primary bg-background shadow" />
          </div>
        ))
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={activateLabel}
          className="absolute inset-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onActivate}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
