import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RAW_TEXT_MAX,
  axesForType,
  visibleOptions,
  type AttributeValues,
  type AxisDef,
} from "@/lib/garment-attributes";
import type { GarmentType } from "@/lib/onboarding-api";
import { cn } from "@/lib/utils";

interface GarmentAttributesProps {
  garmentType: GarmentType;
  values: AttributeValues;
  rawText: string;
  /** 사진·종류가 바뀌어 다시 확인이 필요한지 */
  needsConfirmation: boolean;
  /** 409 등으로 서버 값을 다시 불러왔을 때 안내 */
  notice: string | null;
  /** 저장 실패 안내 */
  error: string | null;
  disabled: boolean;
  saving: boolean;
  canSave: boolean;
  onToggle: (axis: AxisDef, value: string) => void;
  onRawText: (value: string) => void;
  onSave: () => void;
}

function isSelected(values: AttributeValues, axis: AxisDef, value: string): boolean {
  const current = values[axis.key];
  if (axis.multi) return Array.isArray(current) && current.includes(value);
  return current === value;
}

export function GarmentAttributes({
  garmentType,
  values,
  rawText,
  needsConfirmation,
  notice,
  error,
  disabled,
  saving,
  canSave,
  onToggle,
  onRawText,
  onSave,
}: GarmentAttributesProps) {
  const axes = axesForType(garmentType);

  return (
    <section aria-label="옷 정보 확인" className="border-t border-border pt-7">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold tracking-[0.18em] text-primary">03</span>
        <span className="text-sm font-bold text-foreground">옷 정보 확인</span>
        <span className="text-xs text-muted-foreground">선택</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        사진을 보고 직접 골라 주세요. 모르는 항목은 "모름"을 누르거나 비워 두면 됩니다.
      </p>

      {needsConfirmation && (
        <p
          role="status"
          className="mt-4 rounded-2xl bg-card p-4 text-sm leading-relaxed text-foreground ring-1 ring-border"
        >
          사진이나 옷 종류가 바뀌었어요. 정보를 확인하고 다시 저장해 주세요.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-2xl bg-card p-4 text-sm leading-relaxed text-foreground ring-1 ring-border"
        >
          {notice}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {axes.map((axis) => {
          const options = visibleOptions(axis, garmentType, values);
          if (options.length === 0) return null;
          return (
            <div key={axis.key}>
              <div id={`attr-label-${axis.key}`} className="text-sm text-muted-foreground">
                {axis.label}
                {axis.multi && <span className="ml-1 text-xs">중복 선택 가능</span>}
              </div>
              <div
                role="group"
                aria-labelledby={`attr-label-${axis.key}`}
                className="mt-2 flex flex-wrap gap-2"
              >
                {options.map((option) => {
                  const selected = isSelected(values, axis, option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => onToggle(axis, option.value)}
                      className={cn(
                        "tap-feedback min-h-10 rounded-full px-4 text-sm font-bold",
                        selected
                          ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                          : "bg-secondary text-secondary-foreground ring-1 ring-border hover:bg-accent",
                        disabled && "opacity-60",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div>
          <label htmlFor="garment-raw-text" className="text-sm text-muted-foreground">
            직접 적기(선택)
          </label>
          <Input
            id="garment-raw-text"
            value={rawText}
            maxLength={RAW_TEXT_MAX}
            disabled={disabled}
            onChange={(e) => onRawText(e.target.value)}
            placeholder="예: 상품 라벨에 적힌 섬유 정보"
            className="mt-2 h-11 rounded-xl border-transparent bg-secondary px-4 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        className="tap-feedback mt-5 h-11 w-full rounded-full border-input bg-transparent font-bold"
        disabled={!canSave}
        onClick={onSave}
      >
        {saving ? "저장 중…" : "옷 정보 저장"}
      </Button>
    </section>
  );
}
