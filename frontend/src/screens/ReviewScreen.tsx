import { useState } from "react";
import type { PublicStyleImage } from "../api/onboarding";
import type { OnboardingController } from "../onboarding/useOnboarding";
import { Icon } from "../components/Icon";
import { Loading, Notice } from "../components/Feedback";
import { PhotoCard, PhotoViewer } from "../components/PhotoGallery";

export function ReviewScreen({
  controller: c,
}: {
  controller: OnboardingController;
}) {
  const [expanded, setExpanded] = useState<PublicStyleImage | null>(null);
  if (c.summaryLoading) return <Loading text="선택을 모으는 중…" />;
  if (!c.summary)
    return (
      <Notice action={c.retry} label="다시 불러오기">
        선택 결과를 불러오지 못했어요. 다시 확인해 주세요.
      </Notice>
    );
  const value = c.summary;
  const category = c.catalog?.categories.find(
    (category) => category.id === value.session.selectedCategoryId,
  );
  const unseen =
    value.session.photoExploration?.genres.filter(
      (genre) => genre.status === "unseen",
    ) ?? [];
  const examples = value.selectedExamples;
  const expandedExample = examples.find(
    (example) => example.image.id === expanded?.id,
  );
  return (
    <section className="review-screen">
      <div className="screen-heading">
        <p className="eyebrow">선택 확인</p>
        <h1>
          {examples.length ? (
            <>선택한 스타일 예시</>
          ) : (
            <>아직 취향을 탐색 중이에요.</>
          )}
        </h1>
        <p className="lead">
          이 선택을 바탕으로 취향을 알아갈게요. 언제든 바꿀 수 있어요.
        </p>
      </div>
      <section className="review-section">
        <div className="section-label">의류 범주</div>
        <div className="review-category">
          <h2>{category?.name}</h2>
          <button
            className="text-button"
            disabled={c.busy}
            onClick={() => c.navigate({ view: "category" })}
          >
            변경하기
          </button>
        </div>
      </section>
      <section className="review-section">
        <h2>
          하트를 누른 사진{" "}
          <span className="muted-count">{examples.length}</span>
        </h2>
        {examples.length ? (
          <div className="photo-grid summary-photos">
            {examples.map(({ image, style, genreGroup }, index) => (
              <div className="selected-example" key={image.id}>
                <PhotoCard
                  image={image}
                  index={index}
                  selected={c.isSelected(image.id)}
                  busy={c.heartDisabled}
                  onZoom={setExpanded}
                  onSelect={(selected) => {
                    void c.prefer(image.styleId, image.id, selected);
                  }}
                />
                <div className="example-label">
                  <span>{genreGroup.name}</span>
                  <strong>{style.name}</strong>
                  <button
                    className="text-button"
                    disabled={c.busy}
                    onClick={() => {
                      void c.edit(style.id);
                    }}
                  >
                    다시 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">
            사진을 선택하지 않아도 괜찮아요. 장르를 모두 살펴보거나 건너뛰면
            완료할 수 있어요.
          </p>
        )}
      </section>
      {unseen.length > 0 && (
        <section className="review-section">
          <h2>아직 살펴보지 않은 장르</h2>
          <div className="unanswered-list">
            {unseen.map(({ genreGroupId: id }) => (
              <button
                key={id}
                disabled={c.busy}
                onClick={() => {
                  void c.goGroup(id);
                }}
              >
                {c.groups.find((group) => group.id === id)?.name}
                <Icon name="arrow" size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
      {value.session.photoExploration && (
        <details className="all-responses">
          <summary>장르 탐색 기록·수정</summary>
          {value.session.photoExploration.genres.map((visit) => (
            <div className="response-row" key={visit.genreGroupId}>
              <span>
                {
                  c.groups.find((group) => group.id === visit.genreGroupId)
                    ?.name
                }
              </span>
              <span>
                {visit.status === "viewed"
                  ? "살펴봄"
                  : visit.status === "skipped"
                    ? "건너뜀"
                    : "아직 안 봄"}
              </span>
              <button
                className="text-button"
                disabled={c.busy}
                onClick={() => {
                  void c.goGroup(visit.genreGroupId);
                }}
              >
                수정
              </button>
            </div>
          ))}
        </details>
      )}
      {!value.session.progress.totalCount && (
        <Notice>
          예시 사진을 준비하고 있어요. 사진이 등록된 뒤 취향 탐색을 완료할 수
          있어요.
        </Notice>
      )}
      <div className="review-actions">
        <button
          className="button secondary"
          disabled={c.busy}
          onClick={() => {
            void c.edit();
          }}
        >
          스타일 다시 보기
        </button>
        <button
          className="button primary"
          disabled={
            c.busy || !value.session.photoExploration?.progress.canComplete
          }
          onClick={() => {
            void c.finish();
          }}
        >
          {c.busy ? "저장 중…" : "온보딩 완료"}
          <Icon name="check" size={18} />
        </button>
      </div>
      {unseen.length > 0 && (
        <p className="completion-help">
          아직 살펴보지 않은 {unseen.length}개 장르를 확인해 주세요. 하트 선택
          없이도 완료할 수 있어요.
        </p>
      )}
      <PhotoViewer
        image={expanded}
        styleName={expandedExample?.style.name}
        genreName={expandedExample?.genreGroup.name}
        close={() => setExpanded(null)}
      />
    </section>
  );
}
