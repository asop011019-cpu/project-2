import { Icon } from "./Icon";

export function Loading({ text = "불러오는 중…" }: { text?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  );
}
export function Notice({
  children,
  action,
  label,
}: {
  children: React.ReactNode;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="notice">
      <Icon name="info" />
      <div>{children}</div>
      {action && (
        <button className="text-button" onClick={action}>
          {label ?? "다시 확인"}
        </button>
      )}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
  dismiss,
  retryLabel = "다시 시도",
}: {
  message: string;
  retry?: () => void;
  dismiss?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="error-notice" role="alert">
      <Icon name="info" />
      <p>{message}</p>
      {retry && (
        <button className="text-button" onClick={retry}>
          {retryLabel}
        </button>
      )}
      {dismiss && (
        <button
          className="icon-button"
          aria-label="오류 안내 닫기"
          onClick={dismiss}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
