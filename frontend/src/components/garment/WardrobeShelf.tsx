import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { garmentImageSrc, type Garment, type GarmentType } from "@/lib/onboarding-api";

const GARMENT_TYPE_LABEL: Record<GarmentType, string> = {
  top: "상의",
  pants: "바지",
  skirt: "치마",
  outer: "아우터",
};

/**
 * WARD-001 내 옷장: 서버에 저장된 옷만 보인다(사진을 고르기만 한 옷은 없음).
 * 옷 정보 확인은 사용자가 고른 것이며 AI 분석이 아니다.
 */
export function WardrobeShelf({
  items,
  referenceId,
  loading,
  failed,
  disabled,
  busyId,
  onSelect,
  onDelete,
  onNew,
  onRetry,
}: {
  items: Garment[];
  referenceId: string | null;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  /** 기준 선택·삭제 요청 중인 항목 */
  busyId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** 기준 옷과 다른 새 옷을 등록하도록 입력을 비운다 */
  onNew: (() => void) | null;
  onRetry: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = items.find((item) => item.id === confirmId);
  return (
    <section aria-labelledby="wardrobe-title" className="mt-14 border-t border-border pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="wardrobe-title"
            className="font-display text-2xl font-extrabold tracking-tight text-foreground"
          >
            내 옷장{" "}
            {items.length > 0 && <span className="text-muted-foreground">{items.length}</span>}
          </h2>
          <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            저장한 옷이 모두 여기에 모여요. 하나를 골라 코디의 기준으로 쓸 수 있어요.
          </p>
        </div>
        {onNew && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="tap-feedback h-10 rounded-full border-input bg-transparent px-4"
            disabled={disabled}
            onClick={onNew}
          >
            <Plus size={16} aria-hidden="true" />새 옷 등록
          </Button>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">옷장을 불러오는 중…</p>
      ) : failed ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">옷장을 불러오지 못했어요.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="tap-feedback h-9 rounded-full border-input bg-transparent px-4"
            onClick={onRetry}
          >
            옷장 다시 불러오기
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          아직 저장한 옷이 없어요. 위에서 사진을 저장하면 여기에 쌓여요.
        </p>
      ) : (
        <ul
          aria-label="내 옷장"
          className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {items.map((item) => {
            const isReference = item.id === referenceId;
            const busy = busyId === item.id;
            const label = GARMENT_TYPE_LABEL[item.garmentType];
            const name = [item.brand, item.productName].filter(Boolean).join(" ");
            return (
              <li
                key={item.id}
                aria-current={isReference || undefined}
                aria-label={`${label}${name ? `, ${name}` : ""}${isReference ? ", 지금 기준 옷" : ""}`}
                className={`flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ${isReference ? "ring-2 ring-primary" : "ring-border"}`}
              >
                <div className="relative aspect-[3/4] bg-muted">
                  <img
                    src={garmentImageSrc(item)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {isReference && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                      기준 옷
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="text-sm font-bold text-foreground">{label}</p>
                  {name && <p className="truncate text-xs text-muted-foreground">{name}</p>}
                  <p className="text-xs text-muted-foreground">
                    {item.attributes && !item.attributes.needsConfirmation
                      ? "옷 정보 확인함"
                      : "옷 정보 확인 전"}
                  </p>
                  <div className="mt-auto flex items-center gap-2 pt-2">
                    {!isReference && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="tap-feedback h-9 flex-1 rounded-full border-input bg-transparent px-3 text-xs"
                        disabled={disabled || busyId !== null}
                        onClick={() => onSelect(item.id)}
                      >
                        {busy ? "바꾸는 중…" : "기준으로"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${label} 삭제`}
                      className="tap-feedback ml-auto h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
                      disabled={disabled || busyId !== null}
                      onClick={() => setConfirmId(item.id)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={confirming !== undefined}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 옷을 내 옷장에서 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 옷의 사진과 정보만 삭제돼요. 다른 옷은 그대로예요. 되돌릴 수 없어요.
              {confirming?.id === referenceId && " 지금 기준 옷이라 기준도 비게 돼요."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) onDelete(confirming.id);
                setConfirmId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
