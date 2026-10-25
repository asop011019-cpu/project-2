import { useRef } from "react";
import { Camera, ImageOff, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const ACCEPT = "image/jpeg,image/png,image/webp";

interface GarmentPhotoProps {
  /** 복원 중(스켈레톤 표시, 버튼 비활성) */
  restoring: boolean;
  /** 사진 파일을 읽는 중 */
  reading: boolean;
  /** 표시할 이미지 URL (로컬 미리보기 우선, 없으면 저장본) */
  imageUrl: string | null;
  /** 현재 표시 중인 이미지가 아직 저장되지 않은 로컬 미리보기인지 */
  isLocalPreview: boolean;
  /** 서버 저장 사진을 불러오지 못했는지 (404·연결 실패) */
  imageFailed: boolean;
  /** 형식·용량 등 사진 오류 문구 */
  error: string | null;
  /** 저장 중 등 입력 잠금 */
  disabled: boolean;
  onFile: (file: File) => void;
  /** 서버 저장 사진 로드 실패 */
  onImageError: () => void;
  /** 서버 저장 사진 다시 불러오기 */
  onImageRetry: () => void;
  /** 로컬 미리보기 삭제 (저장본은 건드리지 않음) */
  onClearLocal: () => void;
  /** 저장본 삭제 확인 열기 */
  onDeleteSaved: () => void;
}

/** 코드로 그린 추상 의류 라인 — 빈 작업대의 절제된 그래픽 (실제 상품 이미지 아님) */
function GarmentLineArt() {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      aria-hidden="true"
      className="h-16 w-auto text-muted-foreground"
    >
      {/* 겹친 프레임 */}
      <rect x="6" y="12" width="62" height="74" rx="8" stroke="currentColor" strokeOpacity="0.25" />
      <rect x="18" y="6" width="62" height="74" rx="8" stroke="currentColor" strokeOpacity="0.45" />
      {/* 바지 라인 */}
      <path
        d="M34 24h24l4 48h-11l-5-29-5 29h-11l4-48Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />
      {/* 옷걸이 */}
      <path
        d="M46 24v-5a4 4 0 1 1 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
}

export function GarmentPhoto({
  restoring,
  reading,
  imageUrl,
  isLocalPreview,
  imageFailed,
  error,
  disabled,
  onFile,
  onImageError,
  onImageRetry,
  onClearLocal,
  onDeleteSaved,
}: GarmentPhotoProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 발생하도록 초기화
    e.target.value = "";
    if (file) onFile(file);
  };

  if (restoring) {
    return (
      <div aria-busy="true" aria-label="저장된 하의를 불러오는 중">
        <Skeleton className="aspect-[3/4] w-full rounded-3xl" />
      </div>
    );
  }

  const busy = disabled || reading;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleChange}
      />

      {imageUrl ? (
        /* 사진이 있을 때: 깊이 있는 스테이지 위에 전체 형태를 그대로 표시 */
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-background ring-1 ring-border shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
          {imageFailed ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">
                저장된 사진을 불러오지 못했어요.
                <br />
                입력한 정보는 그대로 남아 있습니다.
              </p>
              <Button
                type="button"
                variant="outline"
                className="tap-feedback h-11 rounded-full border-input bg-transparent px-5"
                disabled={busy}
                onClick={onImageRetry}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                사진 다시 불러오기
              </Button>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt="등록한 기준 하의 사진"
              className="h-full w-full object-contain"
              onError={onImageError}
            />
          )}

          {reading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm"
              role="status"
            >
              <p className="rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground">
                사진을 확인하는 중…
              </p>
            </div>
          )}

          {!reading && (
            <div className="absolute bottom-3 right-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="tap-feedback h-10 rounded-full bg-background/80 px-4 backdrop-blur"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                교체
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="tap-feedback h-10 rounded-full bg-background/80 px-4 backdrop-blur"
                disabled={busy}
                onClick={isLocalPreview ? onClearLocal : onDeleteSaved}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                삭제
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* 빈 상태: 화면을 통째로 먹지 않는 컴팩트한 작업대 */
        <div className="panel-lift relative overflow-hidden rounded-3xl bg-card ring-1 ring-border">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
          />
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-center">
            <GarmentLineArt />
            <p className="text-sm leading-relaxed text-muted-foreground">
              코디의 기준이 될 하의 사진 한 장을 올려 주세요.
              <br />
              JPEG, PNG, WebP · 10MB 이하
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                className="tap-feedback h-11 rounded-full px-6 font-bold"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                사진 선택
              </Button>
              <Button
                type="button"
                variant="outline"
                className="tap-feedback h-11 rounded-full border-input bg-transparent px-5 lg:hidden"
                disabled={busy}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                촬영하기
              </Button>
            </div>
          </div>

          {reading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm"
              role="status"
            >
              <p className="rounded-full bg-secondary px-4 py-2 text-sm text-secondary-foreground">
                사진을 확인하는 중…
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
