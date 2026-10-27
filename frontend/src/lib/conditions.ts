/** 코디 조건 값 모델. null = 아직 안 정함, "any" = 상관없음. 둘을 절대 섞지 않는다. */
export type Any = "any";
export type Occasion = "daily" | "work_school" | "date_gathering" | "formal_event" | "outdoor";
export interface TemperatureRange {
  min: number;
  max: number;
}
export interface ConditionValues {
  temperatureC: TemperatureRange | Any | null;
  occasions: [Occasion] | Any | null;
  formality: number | Any | null;
  additionalBudgetKrw: number | Any | null;
}
export interface Conditions extends ConditionValues {
  updatedAt: string | null;
}

export const TEMP_MIN = -20;
export const TEMP_MAX = 40;
export const DEFAULT_TEMP: TemperatureRange = { min: 10, max: 20 };
export const BUDGET_MIN = 10_000;
export const BUDGET_MAX = 5_000_000;
export const BUDGET_PRESETS = [50_000, 100_000, 200_000, 300_000, 500_000] as const;
export const BUDGET_RANGE_MESSAGE = "1만 원~500만 원 사이로 입력해 주세요.";

export const OCCASIONS: { value: Occasion; label: string }[] = [
  { value: "daily", label: "일상" },
  { value: "work_school", label: "출근·등교" },
  { value: "date_gathering", label: "데이트·모임" },
  { value: "formal_event", label: "격식 행사" },
  { value: "outdoor", label: "야외활동" },
];

export const EMPTY_VALUES: ConditionValues = {
  temperatureC: null,
  occasions: null,
  formality: null,
  additionalBudgetKrw: null,
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function temperatureZone(c: number): string {
  if (c <= 0) return "추움";
  if (c <= 10) return "쌀쌀함";
  if (c <= 19) return "선선함";
  if (c <= 27) return "따뜻함";
  return "더움";
}

export function formalityLabel(v: number): string {
  if (v <= 20) return "편안함";
  if (v <= 40) return "조금 편안함";
  if (v < 60) return "중간";
  if (v <= 70) return "조금 격식";
  return "격식";
}

export function formatKrw(v: number): string {
  return `${v.toLocaleString("ko-KR")}원`;
}

/** 직접 입력 문자열 → 정수(숫자 외 문자 제거). 비어 있으면 null. */
export function parseBudgetInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

export function formatBudgetInput(text: string): string {
  const n = parseBudgetInput(text);
  return n === null ? "" : n.toLocaleString("ko-KR");
}

export function isBudgetInRange(n: number): boolean {
  return Number.isInteger(n) && n >= BUDGET_MIN && n <= BUDGET_MAX;
}

/** 네 항목만 담은 정규 형태(PUT 본문과 같음). */
export function toValues(c: ConditionValues): ConditionValues {
  return {
    temperatureC: c.temperatureC,
    occasions: c.occasions,
    formality: c.formality,
    additionalBudgetKrw: c.additionalBudgetKrw,
  };
}

export function sameValues(a: ConditionValues, b: ConditionValues): boolean {
  return JSON.stringify(toValues(a)) === JSON.stringify(toValues(b));
}

/** 로컬 검증. 필드 키 → 문구. */
export function validateValues(v: ConditionValues): Partial<Record<keyof ConditionValues, string>> {
  const errors: Partial<Record<keyof ConditionValues, string>> = {};
  const t = v.temperatureC;
  if (t && t !== "any") {
    if (
      !Number.isInteger(t.min) ||
      !Number.isInteger(t.max) ||
      t.min < TEMP_MIN ||
      t.max > TEMP_MAX ||
      t.min > t.max
    )
      errors.temperatureC = "-20°C~40°C 사이로 정해 주세요.";
  }
  const f = v.formality;
  if (typeof f === "number" && (!Number.isInteger(f) || f < 0 || f > 100))
    errors.formality = "0~100 사이로 정해 주세요.";
  const b = v.additionalBudgetKrw;
  if (typeof b === "number" && !isBudgetInRange(b))
    errors.additionalBudgetKrw = BUDGET_RANGE_MESSAGE;
  return errors;
}

/** 서버 issue.path → 화면 항목. */
export function fieldForIssuePath(path: string | undefined): keyof ConditionValues | null {
  if (!path) return null;
  const head = path.split(/[.[]/)[0];
  return head === "temperatureC" ||
    head === "occasions" ||
    head === "formality" ||
    head === "additionalBudgetKrw"
    ? head
    : null;
}

export const DRAFT_KEY = "conditions-draft-v1";

function isValues(x: unknown): x is ConditionValues {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return ["temperatureC", "occasions", "formality", "additionalBudgetKrw"].every((k) => k in o);
}

export function readDraft(): ConditionValues | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValues(parsed) ? toValues(parsed) : null;
  } catch {
    return null;
  }
}

export function writeDraft(v: ConditionValues) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(toValues(v)));
  } catch {
    // 저장소를 쓸 수 없으면 보관하지 않는다
  }
}

export function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
