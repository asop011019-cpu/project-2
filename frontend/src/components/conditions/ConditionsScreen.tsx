import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { AccountLink } from "@/components/auth/AuthShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/onboarding-api";
import { getConditions, putConditions } from "@/lib/conditions-api";
import {
  BUDGET_PRESETS,
  BUDGET_RANGE_MESSAGE,
  DEFAULT_FORMALITY,
  DEFAULT_TEMP,
  EMPTY_VALUES,
  OCCASIONS,
  OWNED_ONLY_NOTICE,
  TEMP_MAX,
  TEMP_MIN,
  clamp,
  clearDraft,
  conditionHints,
  fieldForIssuePath,
  formalityLabel,
  formatBudgetInput,
  formatKrw,
  isBudgetInRange,
  parseBudgetInput,
  readDraft,
  sameValues,
  temperatureZone,
  toValues,
  unansweredLabels,
  validateValues,
  withDefaults,
  writeDraft,
  type ConditionValues,
  type Conditions,
} from "@/lib/conditions";
import { RangeBar } from "./RangeBar";
import { OwnedOnlyNotice } from "./OwnedOnlyNotice";

export const CONDITIONS_QUERY_KEY = ["onboarding", "conditions"] as const;
type FieldKey = keyof ConditionValues;

function navigate(href: string) {
  window.dispatchEvent(new CustomEvent("auth-navigation", { detail: href }));
}

function Chip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap-feedback min-h-11 rounded-full px-4 text-sm font-bold",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground ring-1 ring-border hover:bg-accent",
        disabled && "opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  id,
  title,
  status,
  error,
  hint,
  children,
}: {
  id: string;
  title: string;
  status: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-base font-bold text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground" data-testid={`${id}-status`}>
          {status}
        </p>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
      {hint && !error && (
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2.5 text-sm leading-relaxed text-secondary-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  plus,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  plus?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-11 w-11 shrink-0 rounded-full border-input bg-transparent"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {plus ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
    </Button>
  );
}

function ClearButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-60"
    >
      선택 지우기
    </button>
  );
}

export function ConditionsScreen({ authReady = true }: { authReady?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CONDITIONS_QUERY_KEY,
    queryFn: getConditions,
    enabled: authReady,
    retry: false,
  });
  const [values, setValues] = useState<ConditionValues>(EMPTY_VALUES);
  const [budgetCustom, setBudgetCustom] = useState(false);
  const [budgetText, setBudgetText] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const initialized = useRef(false);
  /**
   * 0원 알림(WARD-001): 0원으로 들어갈 때 한 번. 저장된 0원을 불러올 때는 띄우지 않고,
   * 다른 금액으로 바꿨다가 다시 0원이 되면 다시 알린다.
   */
  const zeroAck = useRef(false);
  const [zeroPrompt, setZeroPrompt] = useState<{ thenSave: boolean } | null>(null);
  const budgetInput = useRef<HTMLInputElement>(null);

  // Temperature and formality start from their defaults; saving sends them as chosen values.
  const saved: ConditionValues | null = query.data ? withDefaults(toValues(query.data)) : null;

  const applyValues = (v: ConditionValues) => {
    setValues(v);
    const b = v.additionalBudgetKrw;
    const custom =
      typeof b === "number" && b !== 0 && !(BUDGET_PRESETS as readonly number[]).includes(b);
    setBudgetCustom(custom);
    setBudgetText(custom ? formatBudgetInput(String(b)) : "");
  };

  useEffect(() => {
    if (initialized.current || !query.data) return;
    initialized.current = true;
    zeroAck.current = query.data.additionalBudgetKrw === 0;
    const draft = readDraft();
    if (draft) {
      applyValues(withDefaults(draft));
      setDraftRestored(true);
    } else applyValues(withDefaults(toValues(query.data)));
  }, [query.data]);

  const dirty = saved !== null && !sameValues(values, saved);
  const latest = useRef({ values, dirty });
  latest.current = { values, dirty };

  // 로그인/동의 화면으로 이동하기 직전에 저장 안 된 네 항목만 보관한다.
  useEffect(() => {
    const onNav = (event: Event) => {
      const href = (event as CustomEvent<string>).detail ?? "";
      if ((href.startsWith("/login") || href.startsWith("/consent-update")) && latest.current.dirty)
        writeDraft(latest.current.values);
    };
    window.addEventListener("auth-navigation", onNav);
    return () => window.removeEventListener("auth-navigation", onNav);
  }, []);

  useEffect(() => {
    if (!savedNotice) return;
    const t = window.setTimeout(() => setSavedNotice(false), 2000);
    return () => window.clearTimeout(t);
  }, [savedNotice]);

  const mutation = useMutation({
    mutationFn: putConditions,
    onSuccess: (result: Conditions) => {
      queryClient.setQueryData(CONDITIONS_QUERY_KEY, result);
      applyValues(withDefaults(toValues(result)));
      zeroAck.current = result.additionalBudgetKrw === 0;
      clearDraft();
      setDraftRestored(false);
      setServerErrors({});
      setSaveError(null);
      setSavedNotice(true);
    },
    onError: (error: unknown) => {
      const err =
        error instanceof ApiError
          ? error
          : new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" });
      if (err.status === 400 && err.code === "INVALID_INPUT" && err.issues?.length) {
        const map: Partial<Record<FieldKey, string>> = {};
        for (const issue of err.issues) {
          const key = fieldForIssuePath(issue.path);
          if (key && !map[key]) map[key] = issue.message || "값을 확인해 주세요.";
        }
        setServerErrors(map);
      }
      setSaveError(err);
    },
  });

  const locked = mutation.isPending || !query.data;
  const update = (patch: Partial<ConditionValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    const keys = Object.keys(patch) as FieldKey[];
    setServerErrors((e) => {
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
    setSavedNotice(false);
  };

  const budgetOutOfRange =
    budgetCustom && budgetText !== "" && !isBudgetInRange(parseBudgetInput(budgetText) ?? 0);
  const localErrors = validateValues(values);
  const errors: Partial<Record<FieldKey, string>> = { ...localErrors, ...serverErrors };
  if (budgetOutOfRange) errors.additionalBudgetKrw = BUDGET_RANGE_MESSAGE;
  const canSave =
    dirty && !mutation.isPending && !budgetOutOfRange && Object.keys(localErrors).length === 0;
  const hints = conditionHints(values);
  const unanswered = unansweredLabels(values);

  const handleSave = () => {
    if (!canSave) return;
    if (values.additionalBudgetKrw === 0 && !zeroAck.current) {
      setZeroPrompt({ thenSave: true });
      return;
    }
    setSaveError(null);
    mutation.mutate(toValues(values));
  };

  /** 사용자가 고른 예산. 0원이 처음이면 알림부터, 다른 금액이면 다음 0원 때 다시 알린다. */
  const setBudget = (next: ConditionValues["additionalBudgetKrw"]) => {
    if (next !== 0) zeroAck.current = false;
    update({ additionalBudgetKrw: next });
    if (next === 0 && !zeroAck.current) setZeroPrompt({ thenSave: false });
  };
  const confirmZero = () => {
    zeroAck.current = true;
    const thenSave = zeroPrompt?.thenSave;
    setZeroPrompt(null);
    setBudgetCustom(false);
    setBudgetText("");
    update({ additionalBudgetKrw: 0 });
    if (thenSave) {
      setSaveError(null);
      mutation.mutate(toValues({ ...values, additionalBudgetKrw: 0 }));
    }
  };
  /** 금액 변경: 0원을 풀고 직접 입력란으로 보낸다. */
  const changeBudget = () => {
    setZeroPrompt(null);
    zeroAck.current = false;
    setBudgetCustom(true);
    setBudgetText("");
    update({ additionalBudgetKrw: null });
    window.setTimeout(() => budgetInput.current?.focus(), 0);
  };

  const sessionExpired =
    (saveError?.status === 401 && saveError.code === "SESSION_REQUIRED") ||
    (query.error instanceof ApiError &&
      query.error.status === 401 &&
      query.error.code === "SESSION_REQUIRED");

  // --- 기온 ---
  const t = values.temperatureC;
  const tRange = t && t !== "any" ? t : null;
  // The big line shows the chosen numbers; the header then names the feel so the two never repeat.
  const tempStatus =
    t === null
      ? "아직 안 정함"
      : t === "any"
        ? "상관없음"
        : t.min === t.max || temperatureZone(t.min) === temperatureZone(t.max)
          ? temperatureZone(t.min)
          : `${temperatureZone(t.min)} ~ ${temperatureZone(t.max)}`;
  const setTemp = (min: number, max: number) =>
    update({
      temperatureC: { min: clamp(min, TEMP_MIN, TEMP_MAX), max: clamp(max, TEMP_MIN, TEMP_MAX) },
    });

  // --- 격식 ---
  const f = values.formality;
  const fNum = typeof f === "number" ? f : null;
  const formalityStatus =
    f === null ? "아직 안 정함" : f === "any" ? "상관없음" : `${f}, ${formalityLabel(f)}`;

  // --- 예산 ---
  const b = values.additionalBudgetKrw;
  const budgetStatus =
    b === null
      ? "아직 안 정함"
      : b === "any"
        ? "상한 없음"
        : b === 0
          ? "0원, 내 옷장 옷만"
          : formatKrw(b);
  // 저장된 값이 0원일 때만 서버에 옷장 상태를 묻는다(입력 중인 값으로는 묻지 않음).
  const savedOwnedOnly = query.data?.additionalBudgetKrw === 0 && b === 0;

  const occ = values.occasions;
  const occStatus =
    occ === null
      ? "아직 안 정함"
      : occ === "any"
        ? "상관없음"
        : (OCCASIONS.find((o) => o.value === occ[0])?.label ?? "");

  return (
    <main className="relative min-h-screen overflow-x-clip bg-background">
      <div className="relative mx-auto w-full max-w-[640px] px-5 pb-36 pt-9 lg:pb-16 lg:pt-14">
        <header>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate("/garment")}
              className="tap-feedback flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              기준 옷으로
            </button>
            <AccountLink />
          </div>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground">
            코디 조건
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            추천에 쓸 조건이에요. 정하지 않은 항목은 조건 없이 추천해요.
          </p>
        </header>

        {draftRestored && (
          <p role="status" className="mt-6 rounded-2xl bg-card p-4 text-sm ring-1 ring-border">
            저장하지 않은 입력을 불러왔어요
          </p>
        )}

        {sessionExpired && (
          <div role="alert" className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-destructive/40">
            <p className="text-sm leading-relaxed text-foreground">
              세션이 만료됐거나 복원하지 못했어요. 입력한 내용은 그대로 남아 있습니다. 기준 옷
              화면에서 새로 시작할 수 있어요.
            </p>
          </div>
        )}

        {query.isPending && authReady && (
          <div className="mt-8 space-y-4" aria-busy="true" aria-label="조건 불러오는 중">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {query.isError && !sessionExpired && (
          <div role="alert" className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-border">
            <p className="text-sm text-foreground">저장된 조건을 불러오지 못했어요.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-10 rounded-full border-input bg-transparent px-4"
              onClick={() => void query.refetch()}
            >
              다시 시도
            </Button>
          </div>
        )}

        {query.data && (
          <div className="mt-8 space-y-4">
            <Section
              id="cond-temp"
              title="기온"
              status={tempStatus}
              error={errors.temperatureC}
              hint={hints.temperatureC}
            >
              {tRange && (
                <p
                  className="text-3xl font-extrabold text-foreground"
                  aria-live="polite"
                  data-testid="cond-temp-value"
                >
                  {tRange.min}°C ~ {tRange.max}°C
                </p>
              )}
              <div className="flex items-center gap-2">
                <StepButton
                  label="최저 기온 낮추기"
                  disabled={locked || !tRange || tRange.min <= TEMP_MIN}
                  onClick={() => tRange && setTemp(tRange.min - 1, tRange.max)}
                />
                <div className="min-w-0 flex-1">
                  <RangeBar
                    min={TEMP_MIN}
                    max={TEMP_MAX}
                    step={1}
                    values={tRange ? [tRange.min, tRange.max] : null}
                    thumbLabels={["최저 기온", "최고 기온"]}
                    valueText={(v) => `${v}도, ${temperatureZone(v)}`}
                    disabled={locked}
                    activateLabel="기온 막대 켜기"
                    onActivate={() => update({ temperatureC: { ...DEFAULT_TEMP } })}
                    onChange={([min, max]) => setTemp(min!, max!)}
                  />
                </div>
                <StepButton
                  plus
                  label="최고 기온 높이기"
                  disabled={locked || !tRange || tRange.max >= TEMP_MAX}
                  onClick={() => tRange && setTemp(tRange.min, tRange.max + 1)}
                />
              </div>
              <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
                <span>추움 ~0</span>
                <span>쌀쌀함 1~10</span>
                <span>선선함 11~19</span>
                <span>따뜻함 20~27</span>
                <span>더움 28~</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  selected={t === "any"}
                  disabled={locked}
                  onClick={() =>
                    update({ temperatureC: t === "any" ? { ...DEFAULT_TEMP } : "any" })
                  }
                >
                  상관없음
                </Chip>
              </div>
            </Section>

            <Section id="cond-occ" title="상황" status={occStatus} error={errors.occasions}>
              <div role="group" aria-label="상황" className="flex flex-wrap gap-2">
                {OCCASIONS.map((o) => {
                  const selected = Array.isArray(occ) && occ[0] === o.value;
                  return (
                    <Chip
                      key={o.value}
                      selected={selected}
                      disabled={locked}
                      onClick={() => update({ occasions: selected ? null : [o.value] })}
                    >
                      {o.label}
                    </Chip>
                  );
                })}
                <Chip
                  selected={occ === "any"}
                  disabled={locked}
                  onClick={() => update({ occasions: occ === "any" ? null : "any" })}
                >
                  상관없음
                </Chip>
              </div>
            </Section>

            <Section
              id="cond-form"
              title="격식"
              status={formalityStatus}
              error={errors.formality}
              hint={hints.formality}
            >
              <div className="flex items-center gap-2">
                <StepButton
                  label="격식 낮추기"
                  disabled={locked || fNum === null || fNum <= 0}
                  onClick={() => fNum !== null && update({ formality: Math.max(0, fNum - 10) })}
                />
                <div className="min-w-0 flex-1">
                  <RangeBar
                    min={0}
                    max={100}
                    step={10}
                    values={fNum === null ? null : [fNum]}
                    thumbLabels={["격식 정도"]}
                    valueText={(v) => `${v}, ${formalityLabel(v)}`}
                    disabled={locked}
                    activateLabel="격식 막대 켜기"
                    onActivate={() => update({ formality: DEFAULT_FORMALITY })}
                    onChange={([v]) => update({ formality: v! })}
                  />
                </div>
                <StepButton
                  plus
                  label="격식 높이기"
                  disabled={locked || fNum === null || fNum >= 100}
                  onClick={() => fNum !== null && update({ formality: Math.min(100, fNum + 10) })}
                />
              </div>
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>편안함</span>
                <span>격식</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  selected={f === "any"}
                  disabled={locked}
                  onClick={() => update({ formality: f === "any" ? DEFAULT_FORMALITY : "any" })}
                >
                  상관없음
                </Chip>
              </div>
            </Section>

            <Section
              id="cond-budget"
              title="추가 구매 예산"
              status={budgetStatus}
              error={errors.additionalBudgetKrw}
            >
              <div role="group" aria-label="추가 구매 예산" className="flex flex-wrap gap-2">
                <Chip
                  selected={!budgetCustom && b === 0}
                  disabled={locked}
                  onClick={() => {
                    setBudgetCustom(false);
                    setBudgetText("");
                    setBudget(b === 0 ? null : 0);
                  }}
                >
                  0원
                </Chip>
                {BUDGET_PRESETS.map((p) => {
                  const selected = !budgetCustom && b === p;
                  return (
                    <Chip
                      key={p}
                      selected={selected}
                      disabled={locked}
                      onClick={() => {
                        setBudgetCustom(false);
                        setBudgetText("");
                        setBudget(selected ? null : p);
                      }}
                    >
                      {p / 10_000}만
                    </Chip>
                  );
                })}
                <Chip
                  selected={budgetCustom}
                  disabled={locked}
                  onClick={() => {
                    if (budgetCustom) {
                      setBudgetCustom(false);
                      setBudgetText("");
                      update({ additionalBudgetKrw: null });
                    } else {
                      setBudgetCustom(true);
                      setBudgetText("");
                      update({ additionalBudgetKrw: null });
                    }
                  }}
                >
                  직접 입력
                </Chip>
                <Chip
                  selected={b === "any"}
                  disabled={locked}
                  onClick={() => {
                    setBudgetCustom(false);
                    setBudgetText("");
                    setBudget(b === "any" ? null : "any");
                  }}
                >
                  상한 없음
                </Chip>
              </div>
              {budgetCustom && (
                <label className="block">
                  <span className="text-sm text-muted-foreground">예산 금액</span>
                  <span className="mt-1.5 flex items-center gap-2 rounded-xl bg-background px-4 ring-1 ring-input focus-within:ring-2 focus-within:ring-ring">
                    <input
                      ref={budgetInput}
                      inputMode="numeric"
                      aria-label="예산 금액"
                      aria-invalid={budgetOutOfRange || undefined}
                      disabled={locked}
                      value={budgetText}
                      placeholder="150,000"
                      onChange={(e) => {
                        const text = formatBudgetInput(e.target.value);
                        const next = parseBudgetInput(text);
                        setBudgetText(text);
                        // 글자마다 알리지 않는다: 0원 알림은 입력란을 벗어날 때.
                        if (next !== 0) zeroAck.current = false;
                        update({ additionalBudgetKrw: next });
                      }}
                      onBlur={() => {
                        if (parseBudgetInput(budgetText) === 0 && !zeroAck.current)
                          setZeroPrompt({ thenSave: false });
                      }}
                      className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none"
                    />
                    <span className="text-sm text-muted-foreground">원</span>
                  </span>
                </label>
              )}
              {b !== null && (
                <ClearButton
                  disabled={locked}
                  onClick={() => {
                    setBudgetCustom(false);
                    setBudgetText("");
                    update({ additionalBudgetKrw: null });
                  }}
                />
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {b === 0
                  ? "추가로 살 옷 없이 내 옷장에 등록한 옷만 써요."
                  : "갖고 있는 기준 옷 가격은 빼고, 더 살 옷의 참고가 합계예요. 실제 판매가·재고와 다를 수 있어요."}
              </p>
              {savedOwnedOnly && !dirty && (
                <OwnedOnlyNotice
                  onRegister={() => navigate("/garment")}
                  onChangeBudget={changeBudget}
                />
              )}
            </Section>

            {saveError && !sessionExpired && saveError.code !== "INVALID_INPUT" && (
              <div role="alert" className="rounded-2xl bg-card p-4 ring-1 ring-destructive/40">
                <p className="text-sm text-foreground">
                  조건을 저장하지 못했어요. 입력한 내용은 그대로 남아 있어요.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 h-10 rounded-full border-input bg-transparent px-4"
                  disabled={!canSave}
                  onClick={handleSave}
                >
                  다시 시도
                </Button>
              </div>
            )}

            <div aria-hidden="true" className="h-24 lg:hidden" />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
              <div className="mb-2 min-h-5 text-center">
                <p role="status" className="text-sm text-primary">
                  {savedNotice ? "저장했어요" : ""}
                </p>
                {!savedNotice && unanswered.length > 0 && unanswered.length < 4 && (
                  <p className="text-xs text-muted-foreground" data-testid="cond-unanswered">
                    정하지 않은 항목({unanswered.join("·")})은 조건 없이 추천해요
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="lg"
                className="tap-feedback h-12 w-full rounded-full text-base font-bold"
                disabled={!canSave}
                onClick={handleSave}
              >
                {mutation.isPending ? "저장 중…" : "조건 저장"}
              </Button>
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={zeroPrompt !== null} onOpenChange={(open) => !open && setZeroPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>추가 구매 예산 0원</AlertDialogTitle>
            <AlertDialogDescription>{OWNED_ONLY_NOTICE}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={changeBudget}>금액 변경</AlertDialogCancel>
            <AlertDialogAction onClick={confirmZero}>계속</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
