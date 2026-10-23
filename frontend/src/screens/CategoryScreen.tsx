import type { OnboardingController } from "../onboarding/useOnboarding";
import { Icon } from "../components/Icon";

export function CategoryScreen({
  controller: c,
}: {
  controller: OnboardingController;
}) {
  return (
    <section className="category-screen">
      <div className="screen-heading">
        <h1>어떤 옷의 코디를 찾아볼까요?</h1>
        <p className="lead">추천받고 싶은 의류 범주를 골라주세요.</p>
      </div>
      <div className="category-grid">
        {c.catalog?.categories
          .toSorted((a, b) => a.order - b.order)
          .map((category, index) => (
            <button
              key={category.id}
              className={`category-card ${c.session?.selectedCategoryId === category.id ? "chosen" : ""}`}
              disabled={c.busy}
              aria-pressed={c.session?.selectedCategoryId === category.id}
              onClick={() => {
                void c.selectCategory(category.id);
              }}
            >
              <span className={`category-art art-${index}`}>
                <Icon name={index === 0 ? "jacket" : "shirt"} size={116} />
              </span>
              <span className="category-name">
                {category.name}
                <Icon name="arrow" size={25} />
              </span>
              <span className="category-subtitle">
                다양한 스타일의 조합 살펴보기
              </span>
              {c.session?.selectedCategoryId === category.id && (
                <span className="selected-tag">
                  <Icon name="check" size={13} />
                  선택한 범주
                </span>
              )}
            </button>
          ))}
      </div>
      <p className="category-note">
        추천받을 의류 범주예요. 언제든 바꿀 수 있어요.
      </p>
    </section>
  );
}
