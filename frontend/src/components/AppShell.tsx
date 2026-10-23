import type { ReactNode } from "react";
import type { OnboardingController } from "../onboarding/useOnboarding";
import { Icon } from "./Icon";

export function AppShell({
  controller: c,
  children,
}: {
  controller: OnboardingController;
  children: ReactNode;
}) {
  const category = c.catalog?.categories.find(
    (category) => category.id === c.session?.selectedCategoryId,
  );
  const step = c.view === "category" ? 0 : c.view === "explore" ? 1 : 2;
  const hasResponses = Boolean(
    c.session?.photoExploration?.progress.completedCount ||
    c.session?.imagePreferences.some((image) => image.selected),
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <aside className="sidebar">
        <a
          href="?view=category"
          className="wordmark"
          onClick={(event) => {
            event.preventDefault();
            if (!c.busy) c.navigate({ view: "category" });
          }}
        >
          <span className="brand-icon">
            <Icon name="hanger" size={22} />
          </span>
          <span>옷의 다음</span>
        </a>
        <div className="sidebar-intro">
          <span className="quiet-label">취향 탐색</span>
          <p>
            좋아하는 조합을
            <br />
            하나씩 찾아보세요.
          </p>
        </div>
        {category && (
          <nav className="genre-nav" aria-label={`${category.name} 상위 장르`}>
            {c.groups.map((group, index) => (
              <button
                key={group.id}
                className={`genre-link ${c.view === "explore" && group.id === c.group?.id ? "active" : ""}`}
                aria-current={
                  c.view === "explore" && group.id === c.group?.id
                    ? "step"
                    : undefined
                }
                disabled={c.busy}
                onClick={() => {
                  void c.goGroup(group.id);
                }}
              >
                <span className="genre-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {group.name}
                {group.contentStatus === "not_ready" && (
                  <span className="sr-only"> · 이미지 준비 중</span>
                )}
              </button>
            ))}
          </nav>
        )}
        <div className="sidebar-bottom">
          <Icon name="heart" size={18} />
          <p>
            잘 몰라도 괜찮아요.
            <br />
            취향은 천천히 알아가면 돼요.
          </p>
        </div>
      </aside>
      <div className="app-panel">
        <header className="topbar">
          <a
            href="?view=category"
            className="mobile-wordmark"
            onClick={(event) => {
              event.preventDefault();
              if (!c.busy) c.navigate({ view: "category" });
            }}
          >
            옷의 다음
          </a>
          <span className="topbar-title">내 취향 찾기</span>
          <div className="topbar-right">
            <span className="save-status" data-saving={c.busy} role="status">
              {c.error
                ? "저장 상태를 확인해 주세요"
                : c.busy
                  ? "저장 중…"
                  : hasResponses
                    ? "선택 저장됨"
                    : "나만의 취향을 찾아보세요"}
            </span>
            {category && (
              <button
                className="category-pill"
                disabled={c.busy}
                onClick={() => c.navigate({ view: "category" })}
              >
                {category.name}
                <span>변경</span>
              </button>
            )}
          </div>
        </header>
        <ol className="steps" aria-label="온보딩 단계">
          {["의류 범주", "스타일 탐색", "선택 확인"].map((name, index) => (
            <li
              key={name}
              className={`step ${index === step ? "current" : ""} ${index < step ? "done" : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              <span>
                {index < step ? <Icon name="check" size={12} /> : index + 1}
              </span>
              {name}
            </li>
          ))}
        </ol>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
