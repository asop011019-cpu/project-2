import { useEffect, useRef, useState } from "react";
import type { PublicStyleImage } from "../api/onboarding";
import { Icon } from "./Icon";

export function PhotoCard({
  image,
  selected,
  busy,
  onSelect,
  onZoom,
  index,
}: {
  image: PublicStyleImage;
  selected: boolean;
  busy: boolean;
  index: number;
  onSelect: (selected: boolean) => void;
  onZoom: (image: PublicStyleImage) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <article className={`photo-card ${selected ? "is-selected" : ""}`}>
      <div className="photo-stage">
        {failed ? (
          <div className="photo-failure">
            <Icon name="image" size={28} />
            <span>사진을 불러오지 못했어요</span>
            <button
              className="photo-retry"
              onClick={() => {
                setAttempt((value) => value + 1);
                setFailed(false);
              }}
            >
              다시 불러오기
            </button>
          </div>
        ) : (
          <button
            className="photo-expand"
            onClick={() => onZoom(image)}
            aria-label={`확대 보기: ${image.alt}`}
          >
            <img
              key={`${image.id}-${attempt}`}
              src={image.thumbnailUrl}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading={index < 2 ? "eager" : "lazy"}
              onError={() => setFailed(true)}
            />
            <span className="expand-hint">
              <Icon name="expand" size={17} />
              <span>크게 보기</span>
            </span>
          </button>
        )}
      </div>
      <div className="photo-caption">
        <span>
          조합 {index + 1}
          {image.isGenerated && <small>생성 이미지</small>}
        </span>
        <button
          className={`heart-button ${selected ? "selected" : ""}`}
          disabled={busy}
          aria-label={`${image.alt} ${selected ? "하트 해제" : "하트 선택"}`}
          aria-pressed={selected}
          onClick={() => onSelect(!selected)}
        >
          <Icon name="heart" size={21} filled={selected} />
        </button>
      </div>
    </article>
  );
}

export function EmptyGallery({ loading = false }: { loading?: boolean }) {
  return (
    <div
      className={`photo-grid empty-gallery ${loading ? "is-loading" : ""}`}
      role={loading ? "status" : "group"}
      aria-label={loading ? "사진 불러오는 중" : "실제 예시 사진 준비 중"}
    >
      {[0, 1, 2, 3].map((index) => (
        <div className="empty-photo" key={index} aria-hidden={index > 0}>
          <Icon name="image" size={26} />
          <span>{loading ? "불러오는 중…" : "이미지 준비 중"}</span>
        </div>
      ))}
    </div>
  );
}

export function PhotoViewer({
  image,
  styleName,
  genreName,
  close,
}: {
  image: PublicStyleImage | null;
  styleName?: string;
  genreName?: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!image) return;
    setFailed(false);
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [image?.id]);
  return (
    <dialog
      ref={dialog}
      className="photo-dialog"
      aria-labelledby="photo-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        if (image) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {image && (
        <div className="dialog-content">
          <div className="dialog-header">
            <h2 id="photo-dialog-title">
              {genreName && <small className="viewer-genre">{genreName}</small>}
              {styleName ?? "전체 조합 자세히 보기"}
            </h2>
            <button
              className="icon-button"
              onClick={close}
              aria-label="사진 확대 닫기"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-image">
            {failed ? (
              <div className="photo-failure">
                <Icon name="image" />
                원본 사진을 불러오지 못했어요.
              </div>
            ) : (
              <img
                src={image.originalUrl}
                alt={image.alt}
                width={image.width}
                height={image.height}
                onError={() => setFailed(true)}
              />
            )}
          </div>
          <p className="dialog-caption">{image.alt}</p>
          <p className="photo-credit">
            {image.isGenerated ? "생성 이미지" : "참고 이미지"} ·{" "}
            {image.creator}
            {image.sourceUrl && (
              <>
                {" "}
                ·{" "}
                <a href={image.sourceUrl} target="_blank" rel="noreferrer">
                  출처 보기
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </dialog>
  );
}
