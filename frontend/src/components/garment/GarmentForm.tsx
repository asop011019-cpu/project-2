import { Input } from "@/components/ui/input";
import type { GarmentType } from "@/lib/onboarding-api";
import {
  BRAND_MAX,
  PRODUCT_NAME_MAX,
  PURCHASE_URL_MAX,
  type FieldErrors,
} from "@/lib/garment-form";
import { cn } from "@/lib/utils";

interface GarmentFormProps {
  garmentType: GarmentType | null;
  brand: string;
  productName: string;
  purchaseUrl: string;
  fieldErrors: FieldErrors;
  disabled: boolean;
  onGarmentType: (value: GarmentType) => void;
  onBrand: (value: string) => void;
  onProductName: (value: string) => void;
  onPurchaseUrl: (value: string) => void;
}

const TYPE_OPTIONS: { value: GarmentType; label: string }[] = [
  { value: "pants", label: "바지" },
  { value: "skirt", label: "치마" },
];

function StepLabel({ step, title, optional }: { step: string; title: string; optional?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-bold tracking-[0.18em] text-primary">{step}</span>
      <span className="text-sm font-bold text-foreground">{title}</span>
      {optional && <span className="text-xs text-muted-foreground">선택</span>}
    </div>
  );
}

const inputClass =
  "mt-2 h-11 rounded-xl border-transparent bg-secondary px-4 text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring";

export function GarmentForm({
  garmentType,
  brand,
  productName,
  purchaseUrl,
  fieldErrors,
  disabled,
  onGarmentType,
  onBrand,
  onProductName,
  onPurchaseUrl,
}: GarmentFormProps) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div id="garment-type-label">
          <StepLabel step="01" title="종류" />
        </div>
        <div
          role="group"
          aria-labelledby="garment-type-label"
          className="mt-3 grid grid-cols-2 gap-2"
        >
          {TYPE_OPTIONS.map((option) => {
            const selected = garmentType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onGarmentType(option.value)}
                className={cn(
                  "tap-feedback h-12 rounded-full text-sm font-bold",
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
        {fieldErrors.garmentType && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {fieldErrors.garmentType}
          </p>
        )}
      </div>

      <div className="border-t border-border pt-7">
        <StepLabel step="02" title="추가 정보" optional />
        <div className="mt-4 flex flex-col gap-5">
          <div>
            <label htmlFor="garment-brand" className="text-sm text-muted-foreground">
              브랜드
            </label>
            <Input
              id="garment-brand"
              value={brand}
              maxLength={BRAND_MAX}
              disabled={disabled}
              onChange={(e) => onBrand(e.target.value)}
              placeholder="예: 브랜드 이름"
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.brand)}
            />
            {fieldErrors.brand && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {fieldErrors.brand}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="garment-product-name" className="text-sm text-muted-foreground">
              제품명
            </label>
            <Input
              id="garment-product-name"
              value={productName}
              maxLength={PRODUCT_NAME_MAX}
              disabled={disabled}
              onChange={(e) => onProductName(e.target.value)}
              placeholder="예: 와이드 슬랙스"
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.productName)}
            />
            {fieldErrors.productName && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {fieldErrors.productName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="garment-purchase-url" className="text-sm text-muted-foreground">
              구매처 링크
            </label>
            <Input
              id="garment-purchase-url"
              type="url"
              inputMode="url"
              value={purchaseUrl}
              maxLength={PURCHASE_URL_MAX}
              disabled={disabled}
              onChange={(e) => onPurchaseUrl(e.target.value)}
              placeholder="https://"
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.purchaseUrl)}
            />
            {fieldErrors.purchaseUrl && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {fieldErrors.purchaseUrl}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
