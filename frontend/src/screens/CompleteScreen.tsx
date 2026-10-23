import type { OnboardingController } from "../onboarding/useOnboarding";
import { Icon } from "../components/Icon";

export function CompleteScreen({
  controller: c,
}: {
  controller: OnboardingController;
}) {
  const category = c.catalog?.categories.find(
    (category) => category.id === c.session?.selectedCategoryId,
  );
  return (
    <section className="complete-screen">
      <span className="complete-mark">
        <Icon name="check" size={34} />
      </span>
      <p className="eyebrow">취향 탐색 완료</p>
      <h1>
        선택을
        <br />
        저장했어요.
      </h1>
      <p className="lead">이 선택을 바탕으로 취향을 알아갈게요.</p>
      <div className="complete-summary">
        <span>{category?.name}</span>
        <span>
          {c.session?.photoExploration?.progress.completedCount}개 장르 살펴봄
        </span>
        <span>
          선택한 사진{" "}
          {c.session?.imagePreferences.filter((image) => image.selected)
            .length ?? 0}
          장
        </span>
      </div>
      <button
        className="button primary"
        disabled={c.busy}
        onClick={() => {
          void c.edit();
        }}
      >
        취향 수정하기
        <Icon name="arrow" size={18} />
      </button>
      <button
        className="text-button"
        disabled={c.busy}
        onClick={() => {
          void c.review();
        }}
      >
        선택 결과 다시 보기
      </button>
      <p className="complete-note">
        취향은 하나로 정해지지 않아요.
        <br />
        마음이 달라지면 언제든 다시 골라보세요.
      </p>
    </section>
  );
}
