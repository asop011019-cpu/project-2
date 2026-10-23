import { AppShell } from "./components/AppShell";
import { ErrorNotice, Loading } from "./components/Feedback";
import { useOnboarding } from "./onboarding/useOnboarding";
import { CategoryScreen } from "./screens/CategoryScreen";
import { ExploreScreen } from "./screens/ExploreScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { CompleteScreen } from "./screens/CompleteScreen";

export function App() {
  const c = useOnboarding();
  return (
    <AppShell controller={c}>
      {c.error && (
        <ErrorNotice
          message={c.error.message}
          dismiss={c.dismissError}
          retry={
            c.error.status === 401
              ? () => {
                  void c.restartExpired();
                }
              : !c.session
                ? () => {
                    void c.initialize();
                  }
                : c.retry
          }
          retryLabel={c.error.status === 401 ? "새로 시작" : "다시 시도"}
        />
      )}
      {c.loading ? (
        <Loading text="취향 탐색을 준비하는 중…" />
      ) : !c.session || !c.catalog ? (
        <div className="initial-error">
          <h1>잠시 연결을 확인해 주세요.</h1>
          <p>서버에 연결하면 저장한 선택을 이어갈 수 있어요.</p>
          <button
            className="button primary"
            onClick={() => {
              void c.initialize();
            }}
          >
            다시 연결
          </button>
        </div>
      ) : c.view === "category" ? (
        <CategoryScreen controller={c} />
      ) : c.view === "review" ? (
        <ReviewScreen controller={c} />
      ) : c.view === "complete" ? (
        <CompleteScreen controller={c} />
      ) : (
        <ExploreScreen controller={c} />
      )}
    </AppShell>
  );
}
