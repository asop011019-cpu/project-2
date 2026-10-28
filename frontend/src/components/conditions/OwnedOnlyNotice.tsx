import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CHECK_QUERY_KEY, getRecommendationCheck } from "@/lib/wardrobe-api";

function missingText(missing: ("top" | "bottom")[]): string {
  const top = missing.includes("top");
  const bottom = missing.includes("bottom");
  if (top && bottom) return "상의 하나와 바지나 치마 하나를 등록해 주세요.";
  return top ? "상의를 하나 이상 등록해 주세요." : "바지나 치마를 하나 이상 등록해 주세요.";
}

/**
 * WARD-001: 저장된 예산이 0원일 때 서버가 계정 옷장으로 판단한 진행 가능 여부.
 * 추천 결과가 아니라 옷장만으로 코디를 시작할 수 있는지에 대한 안내다.
 */
export function OwnedOnlyNotice({
  onRegister,
  onChangeBudget,
}: {
  onRegister: () => void;
  onChangeBudget: () => void;
}) {
  const check = useQuery({
    queryKey: CHECK_QUERY_KEY,
    queryFn: getRecommendationCheck,
    retry: false,
  });
  const actions = (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        className="tap-feedback h-10 rounded-full px-4"
        onClick={onRegister}
      >
        사진 등록
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="tap-feedback h-10 rounded-full border-input bg-transparent px-4"
        onClick={onChangeBudget}
      >
        금액 변경
      </Button>
    </div>
  );
  if (check.isPending)
    return <p className="text-sm text-muted-foreground">내 옷장을 확인하는 중…</p>;
  if (check.isError || !check.data)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">내 옷장을 확인하지 못했어요.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-full border-input bg-transparent px-4"
          onClick={() => void check.refetch()}
        >
          옷장 다시 확인
        </Button>
      </div>
    );
  const { blockedReason, missing, wardrobeCount } = check.data;
  if (blockedReason === "WARDROBE_EMPTY")
    return (
      <div role="alert" className="rounded-2xl bg-card p-4 ring-1 ring-primary/40">
        <p className="text-sm leading-relaxed text-foreground">
          0원 코디를 이용하려면 먼저 내 옷장에 옷을 등록해주세요.
        </p>
        {actions}
      </div>
    );
  if (blockedReason === "WARDROBE_INSUFFICIENT")
    return (
      <div role="alert" className="rounded-2xl bg-card p-4 ring-1 ring-primary/40">
        <p className="text-sm leading-relaxed text-foreground">
          내 옷장 옷만으로는 아직 코디를 완성할 수 없어요. {missingText(missing)}
        </p>
        {actions}
      </div>
    );
  return (
    <p role="status" className="text-sm text-foreground">
      내 옷장 옷 {wardrobeCount}벌로만 코디를 제안해요.
    </p>
  );
}
