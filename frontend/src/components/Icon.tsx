import type { CSSProperties } from "react";

const paths = {
  arrow: "m9 5 7 7-7 7M16 12H3",
  back: "m11 5-7 7 7 7M4 12h17",
  check: "m5 12 4 4L19 6",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  close: "m6 6 12 12M6 18 18 6",
  image: "M4 3h16v18H4zM4 16l5-5 4 4 3-2 4 4M15 7h.01",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  info: "M12 8h.01M12 12v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  refresh: "M20 7V2l-3 3a8 8 0 1 0 3 12M20 2h-5",
  skip: "m7 5 7 7-7 7M18 5v14",
  dislike: "M10 3v11l-2 7H5v-6H2V4h8Zm0 0h9l3 9-2 3H10",
  hanger: "M9 6a3 3 0 1 1 4 3v2l9 6v3H2v-3l10-6",
  shirt: "m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 4-7 4-8 0Z",
  jacket:
    "m8 3-5 3-1 16h6l1-11 3 4 3-4 1 11h6L21 6l-5-3-4 8-4-8ZM8 3 6 8l3 3m7-8 2 5-3 3",
} as const;
export function Icon({
  name,
  size = 20,
  className = "",
  filled = false,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
