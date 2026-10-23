import { useEffect, useState } from "react";
import type { PublicStyleImage } from "../api/onboarding";
import type { OnboardingController } from "../onboarding/useOnboarding";
import { Icon } from "../components/Icon";
import {
  EmptyGallery,
  PhotoCard,
  PhotoViewer,
} from "../components/PhotoGallery";
import { ErrorNotice, Notice } from "../components/Feedback";

export function ExploreScreen({
  controller: c,
}: {
  controller: OnboardingController;
}) {
  const [expanded, setExpanded] = useState<PublicStyleImage | null>(null);
  const index = c.groups.findIndex((group) => group.id === c.group?.id);
  const previous = c.groups[index - 1],
    next = c.groups[index + 1];
  const focusedStyle = c.route.focus;
  useEffect(() => {
    if (!focusedStyle || c.detailsLoading) return;
    document
      .getElementById(`style-${focusedStyle}`)
      ?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [focusedStyle, c.detailsLoading]);
  if (!c.group)
    return (
      <Notice>
        아직 안내할 장르가 없어요. 다른 의류 범주를 선택해 주세요.
      </Notice>
    );
  const progress = c.session?.photoExploration?.progress;
  const active = new Set(c.groupStyles.map((style) => style.id));
  const definitions = c.group.styleDefinitions.filter(
    (style) => !active.has(style.id),
  );
  const unready = c.group.contentStatus === "not_ready";
  return (
    <section className="explore-screen">
      <nav className="mobile-genres" aria-label="상위 장르">
        {c.groups.map((group) => (
          <button
            key={group.id}
            className={`genre-chip ${group.id === c.group?.id ? "active" : ""}`}
            disabled={c.busy}
            aria-current={group.id === c.group?.id ? "step" : undefined}
            onClick={() => {
              void c.goGroup(group.id);
            }}
          >
            {group.name}
          </button>
        ))}
      </nav>
      <div className="genre-heading">
        <div>
          <div className="heading-kicker">
            <span>상위 장르</span>
            <span className="genre-count">
              {index + 1} / {c.groups.length}
            </span>
          </div>
          <h1>{c.group.name}</h1>
          <p className="lead">{c.group.description}</p>
        </div>
        <div className="selection-guide">
          <Icon name="heart" size={17} />
          <span>
            마음에 드는 조합에 하트를 눌러주세요.
            <br />
            고르지 않고 둘러봐도 괜찮아요.
          </span>
        </div>
      </div>
      {unready && (
        <Notice
          action={() => {
            void c.refreshCatalog();
          }}
          label="새로 확인"
        >
          <strong>스타일 예시 사진을 준비하고 있어요.</strong>
          <p>
            장르를 먼저 둘러보세요. 사진이 등록되면 조합을 살펴보고 취향을 남길
            수 있어요.
          </p>
        </Notice>
      )}
      {c.session?.catalogChanged && (
        <Notice
          action={() => {
            void c.refreshCatalog();
          }}
          label="최신 목록 받기"
        >
          새로 준비된 스타일이 있어요. 현재 선택은 유지하며 목록을 갱신할 수
          있어요.
        </Notice>
      )}
      <div className="style-sections">
        {c.groupStyles.map((style) => {
          const detail = c.details[style.id];
          return (
            <section
              className="style-section"
              id={`style-${style.id}`}
              key={style.id}
              aria-labelledby={`title-${style.id}`}
            >
              <div className="style-heading">
                <div>
                  <h2 id={`title-${style.id}`}>{style.name}</h2>
                  <p>{detail?.description ?? style.description}</p>
                </div>
                {detail && detail.images.length < 4 && (
                  <span className="draft-badge">
                    예시 {detail.images.length}장 · 추가 준비 중
                  </span>
                )}
              </div>
              {c.detailErrors[style.id] ? (
                <ErrorNotice
                  message={c.detailErrors[style.id]}
                  retry={c.retry}
                />
              ) : detail ? (
                <div className="photo-grid">
                  {detail.images.map((image, photoIndex) => (
                    <PhotoCard
                      key={image.id}
                      image={image}
                      index={photoIndex}
                      selected={c.isSelected(image.id)}
                      busy={c.heartDisabled}
                      onZoom={setExpanded}
                      onSelect={(selected) => {
                        void c.prefer(style.id, image.id, selected);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyGallery loading={c.detailsLoading} />
              )}
            </section>
          );
        })}
        {definitions.map((style) => (
          <section className="style-section draft-section" key={style.id}>
            <div className="style-heading">
              <h2>{style.name}</h2>
              <span className="draft-badge">
                {style.contentStatus === "ready"
                  ? "새로운 스타일"
                  : "사진 준비 중"}
              </span>
            </div>
            <EmptyGallery />
            <p className="draft-caption">
              {style.contentStatus === "ready"
                ? "최신 목록을 받으면 이 스타일도 탐색할 수 있어요."
                : "실제 조합 사진이 등록되면 선택할 수 있어요."}
            </p>
          </section>
        ))}
      </div>
      <footer className="explore-footer">
        <div className="footer-progress">
          <div>
            <strong>
              {progress?.completedCount ?? 0}
              <span> / {progress?.totalCount ?? 0}</span>
            </strong>
            <span>살펴본 상위 장르</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="상위 장르 탐색 진행률"
            aria-valuemin={0}
            aria-valuemax={progress?.totalCount || 1}
            aria-valuenow={progress?.completedCount ?? 0}
            aria-valuetext={`${progress?.totalCount ?? 0}개 장르 중 ${progress?.completedCount ?? 0}개 살펴봄 또는 건너뜀`}
          >
            <span
              style={{
                width: `${progress?.totalCount ? (progress.completedCount / progress.totalCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="footer-actions">
          <button
            className="button secondary previous-button"
            disabled={c.busy}
            aria-label={previous ? "이전 장르" : "의류 범주 선택으로 돌아가기"}
            onClick={() =>
              previous
                ? void c.goGroup(previous.id)
                : c.navigate({ view: "category" })
            }
          >
            <Icon name="back" size={18} />
            <span>이전</span>
          </button>
          <button
            className="button ghost skip-group"
            disabled={c.busy}
            onClick={() => {
              void c.skipGroup();
            }}
          >
            이 장르 건너뛰기
          </button>
          <button
            className="button primary"
            disabled={c.busy}
            onClick={() => {
              void c.nextGroup();
            }}
          >
            {next ? "다음 장르" : "선택 확인"}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </footer>
      <PhotoViewer
        image={expanded}
        styleName={
          c.groupStyles.find((style) => style.id === expanded?.styleId)?.name
        }
        genreName={c.group.name}
        close={() => setExpanded(null)}
      />
    </section>
  );
}
