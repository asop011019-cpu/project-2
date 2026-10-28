import { useEffect, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Maximize2, ArrowLeft } from "lucide-react";

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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/onboarding-api";
import { AccountLink } from "@/components/auth/AuthShell";
import { readAuthDraft, writeAuthDraft } from "@/lib/auth-drafts";
import { CLOTHING_CATEGORIES, styleCountFor, type CategoryId } from "@/lib/onboarding-catalog";
import {
  completeSession,
  createSession,
  getCatalog,
  getSession,
  getStyle,
  getSummary,
  putCategory,
  putImagePreference,
  putPosition,
  putStyleResponse,
  resetOnboardingSession,
  type SessionView,
  type StyleImage,
  type StyleResponse,
} from "@/lib/onboarding-session-api";
import {
  currentStyleOf,
  describeOnboardingError,
  genreSectionsFrom,
  incompleteReason,
} from "@/lib/onboarding-view";
import { cn } from "@/lib/utils";
import { INTRO_IMAGES } from "@/lib/site";
import { track } from "@/lib/track";
import { IntroScreen } from "./IntroScreen";
import { PreferenceRail } from "./PreferenceRail";
import { StylePager, type PagerGenre } from "./StylePager";
import { EditorialFrame } from "./EditorialFrame";

export const SESSION_KEY = ["onboarding", "session"] as const;
type Step = "category" | "explore" | "summary";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function OnboardingScreen({
  onComplete,
  showIntro = false,
  onBeforeStart,
}: {
  onComplete: () => void;
  showIntro?: boolean;
  onBeforeStart?: () => Promise<boolean>;
}) {
  const draft = useRef(
    onBeforeStart
      ? readAuthDraft<{
          step: Step;
          previewCategory: CategoryId | null;
          openGenre: string | null;
          viewStyleId: string | null;
          intro: boolean;
        }>("onboarding")
      : undefined,
  ).current;
  const [intro, setIntro] = useState(showIntro);
  const [notice, setNotice] = useState<string | null>(null);
  const qc = useQueryClient();
  const [step, setActualStep] = useState<Step>(draft?.step ?? "category");
  // Steps change at once; the wipe between them was removed (user, 2026-10-28).
  const setStep = (next: Step) => setActualStep(next);
  const [previewCategory, setPreviewCategory] = useState<CategoryId | null>(
    draft?.previewCategory ?? null,
  );
  const [openGenre, setOpenGenre] = useState<string | null>(draft?.openGenre ?? null);
  const [viewStyleId, setViewStyleId] = useState<string | null>(draft?.viewStyleId ?? null);
  const [zoom, setZoom] = useState<StyleImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const restoredRef = useRef(false);

  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: createSession,
    retry: false,
    staleTime: Infinity,
    enabled: !intro,
  });
  const session = sessionQuery.data ?? null;
  const sessionError = sessionQuery.error;
  const is401 =
    expired ||
    (sessionError instanceof ApiError &&
      sessionError.status === 401 &&
      sessionError.code === "SESSION_REQUIRED");
  const online = session !== null && !is401;
  const offline = !online && !sessionQuery.isPending;

  // 저장된 범주가 있으면 그 범주로 이어서 시작
  useEffect(() => {
    if (!session || restoredRef.current) return;
    restoredRef.current = true;
    if (session.selectedCategoryId) setActualStep("explore");
  }, [session]);

  const categoryId: CategoryId | null = online
    ? (session?.selectedCategoryId ?? null)
    : previewCategory;

  const catalogQuery = useQuery({
    queryKey: ["onboarding", "catalog", categoryId],
    queryFn: () => getCatalog(categoryId ?? undefined),
    enabled: online && categoryId !== null,
    retry: false,
  });

  const setSession = (s: SessionView) => qc.setQueryData(SESSION_KEY, s);

  const handleError = (e: unknown) => {
    if (
      e instanceof ApiError &&
      (e.code === "AUTH_REQUIRED" || e.code === "CONSENT_UPDATE_REQUIRED")
    )
      return;
    const d = describeOnboardingError(e);
    if (d.action === "expired") {
      setExpired(true);
      return;
    }
    if (d.action === "refetch") void sessionQuery.refetch();
    if (d.action === "toCategory") setStep("category");
    setError(d.message);
  };

  const categoryMutation = useMutation({
    mutationFn: putCategory,
    onSuccess: (s) => {
      track({ type: "category", categoryId: s.selectedCategoryId ?? "" });
      setSession(s);
      setError(null);
      setOpenGenre(null);
      setViewStyleId(null);
      setStep("explore");
    },
    onError: handleError,
  });

  const responseMutation = useMutation({
    mutationFn: (v: {
      styleId: string;
      response: StyleResponse;
      next: string | null | undefined;
    }) => putStyleResponse(v.styleId, v.response, v.next),
    onSuccess: (s, v) => {
      setSession(s);
      setError(null);
      setViewStyleId(v.next ?? v.styleId);
      track({ type: "response", response: v.response, styleId: v.styleId });
      setNotice("취향을 저장했어요");
    },
    onError: handleError,
  });

  const photoSaveLock = useRef(false);
  const heartMutation = useMutation({
    mutationFn: async (v: { styleId: string; imageId: string; selected: boolean }) => {
      let confirmed: SessionView | null = null;
      try {
        confirmed = await putImagePreference(v.styleId, v.imageId, v.selected);
        if (
          v.selected &&
          !confirmed.responses.some((r) => r.styleId === v.styleId && r.response === "liked")
        ) {
          confirmed = await putStyleResponse(v.styleId, "liked");
        }
        return confirmed;
      } catch (e) {
        // These endpoints are not atomic: retain successful server writes, never fake rollback.
        if (confirmed) setSession(confirmed);
        if (!(e instanceof ApiError && e.status === 401)) {
          try {
            setSession(await getSession());
          } catch (restoreError) {
            if (restoreError instanceof ApiError && restoreError.status === 401) {
              setExpired(true);
            }
          }
        }
        throw e;
      }
    },
    onSuccess: (s) => {
      setSession(s);
      setError(null);
      setNotice("취향을 저장했어요");
    },
    onError: handleError,
    onSettled: () => {
      photoSaveLock.current = false;
    },
  });

  // 명시적 이동(이전/다음/카드 선택): 서버 응답 SessionView로만 위치 확정 (낙관적 이동 금지).
  // 위치 쓰기는 한 번에 하나만 실행하고, 진행 중 추가 선택은 최신 의도 하나만 보관해
  // 성공 후 순차 처리한다 → 서버 최종 위치와 화면이 항상 같다. 실패/401이면 대기열을 버린다.
  const queuedPosition = useRef<string | null>(null);
  const [queuedView, setQueuedView] = useState<string | null>(null);
  const [failedPosition, setFailedPosition] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const positionMutation = useMutation({
    mutationFn: (styleId: string) => putPosition(styleId),
    onMutate: () => {
      setFailedPosition(null);
    },
    onSuccess: (s) => {
      setSession(s);
      setError(null);
      const next = queuedPosition.current;
      queuedPosition.current = null;
      setQueuedView(null);
      if (next && next !== s.currentStyleId) {
        positionMutation.mutate(next);
        return;
      }
      setViewStyleId(s.currentStyleId);
      const deck = deckRef.current;
      if (deck && typeof deck.getBoundingClientRect === "function") {
        const r = deck.getBoundingClientRect();
        if (r.top > window.innerHeight * 0.6 || r.bottom < 0) {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          deck.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
        }
      }
    },
    onError: (e, styleId) => {
      queuedPosition.current = null;
      setQueuedView(null);
      if (
        e instanceof ApiError &&
        (e.code === "AUTH_REQUIRED" || e.code === "CONSENT_UPDATE_REQUIRED")
      )
        return;
      const d = describeOnboardingError(e);
      if (d.action === "expired") {
        setExpired(true);
        return;
      }
      setFailedPosition(styleId);
      setError(
        d.action === "refetch" ? d.message : "위치를 저장하지 못했어요. 다시 시도해 주세요.",
      );
      if (d.action === "refetch") void sessionQuery.refetch();
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["onboarding", "summary"],
    queryFn: getSummary,
    enabled: online && step === "summary",
    retry: false,
  });

  const completeMutation = useMutation({
    mutationFn: completeSession,
    onSuccess: (s) => {
      setSession(s);
      track({ type: "complete" });
      onComplete();
    },
    onError: handleError,
  });

  const resetMutation = useMutation({
    mutationFn: resetOnboardingSession,
    onSuccess: (s) => {
      setSession(s);
      setExpired(false);
      setResetOpen(false);
      setStep("category");
      setPreviewCategory(null);
      setError(null);
    },
    onError: () => {
      setResetOpen(false);
      setError("새로 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    },
  });

  const busy =
    categoryMutation.isPending ||
    responseMutation.isPending ||
    heartMutation.isPending ||
    positionMutation.isPending ||
    completeMutation.isPending ||
    resetMutation.isPending;

  const chooseCategory = (id: CategoryId) => {
    setError(null);
    if (online) {
      if (!busy) categoryMutation.mutate(id);
    } else {
      track({ type: "category", categoryId: id });
      setPreviewCategory(id);
      setOpenGenre(null);
      setStep("explore");
    }
  };

  const { sections, source } = categoryId
    ? genreSectionsFrom(online ? catalogQuery.data : null, categoryId)
    : { sections: [], source: "preview" as const };
  const isPreview = !online || source === "preview";

  const order = session?.activeStyleOrder ?? [];
  const activeId =
    online && session
      ? viewStyleId && order.includes(viewStyleId)
        ? viewStyleId
        : currentStyleOf(session)
      : null;

  const styleQuery = useQuery({
    queryKey: ["onboarding", "style", activeId],
    queryFn: () => getStyle(activeId ?? ""),
    enabled: activeId !== null,
    retry: false,
  });

  // 저장 대상이 아닌 스타일(콘텐츠 미준비/서버 미연결)은 카탈로그 기반 읽기 전용 상세로만 연다.
  // 서버 저장 위치·응답·선호는 건드리지 않는다.
  const [browseStyleId, setBrowseStyleId] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const browse = browseStyleId
    ? (() => {
        for (const g of sections) {
          const st = g.styles.find((x) => x.id === browseStyleId);
          if (st) return { style: st, genre: g };
        }
        return null;
      })()
    : null;
  const pendingPosition = positionMutation.isPending
    ? (queuedView ?? positionMutation.variables ?? null)
    : null;
  const shownId = browse ? browse.style.id : activeId;
  const shownGenreId = browse
    ? browse.genre.id
    : (session?.styles.find((s) => s.id === activeId)?.genreGroupId ?? null);
  // 실제 표시 상세가 바뀌면 소속 장르를 펼쳐 목록·상세 선택을 맞춘다 (이후 접기는 사용자 자유).
  useEffect(() => {
    if (shownGenreId) setOpenGenre(shownGenreId);
  }, [shownId, shownGenreId]);

  const selectBusy =
    categoryMutation.isPending ||
    responseMutation.isPending ||
    heartMutation.isPending ||
    completeMutation.isPending ||
    resetMutation.isPending;
  // ONB-3D-001: genres as vertical pages, their styles as cards. Answerable styles come from the
  // session's fixed order; the others stay "사진 준비 중" and only open the read-only detail.
  const pagerGenres: PagerGenre[] = (() => {
    const genres: PagerGenre[] = sections.map((g) => ({
      id: g.id,
      name: g.name,
      styles: g.styles.map((st) => ({
        id: st.id,
        name: st.name,
        ready: online && order.includes(st.id),
      })),
    }));
    // Every answerable style gets a card even if the catalogue view lacks it.
    if (online && session)
      for (const id of order) {
        if (genres.some((g) => g.styles.some((st) => st.id === id))) continue;
        const meta = session.styles.find((st) => st.id === id);
        const genreId = meta?.genreGroupId ?? "other";
        let genre = genres.find((g) => g.id === genreId);
        if (!genre) {
          genre = { id: genreId, name: "스타일", styles: [] };
          genres.push(genre);
        }
        genre.styles.push({ id, name: meta?.name ?? id, ready: true });
      }
    return genres.filter((g) => g.styles.length > 0);
  })();
  // Load photos for the cards in view first: the neighbours of the current card, and the first
  // card of the genres just above and below.
  const previewIds = (() => {
    const gi = pagerGenres.findIndex((g) => g.styles.some((st) => st.id === shownId));
    if (gi < 0) return [];
    const ids: string[] = [];
    const row = pagerGenres[gi]!.styles;
    const si = row.findIndex((st) => st.id === shownId);
    for (const st of row.slice(Math.max(0, si - 1), si + 2)) if (st.ready) ids.push(st.id);
    for (const g of [pagerGenres[gi - 1], pagerGenres[gi + 1]]) {
      const first = g?.styles.find((st) => st.ready);
      if (first) ids.push(first.id);
    }
    return ids.filter((id) => id !== activeId);
  })();
  const previewQueries = useQueries({
    queries: previewIds.map((id) => ({
      queryKey: ["onboarding", "style", id],
      queryFn: () => getStyle(id),
      retry: false,
      staleTime: 60_000,
    })),
  });
  const previewImage = (id: string) => {
    if (id === activeId) return styleQuery.data?.images[0];
    const index = previewIds.indexOf(id);
    return (index >= 0 ? previewQueries[index]?.data : undefined)?.images[0];
  };
  const heartActive = (img: StyleImage, selected: boolean) => {
    if (!activeId || busy || photoSaveLock.current) return;
    photoSaveLock.current = true;
    setError(null);
    heartMutation.mutate({ styleId: activeId, imageId: img.id, selected });
  };

  const selectStyle = (id: string) => {
    if (selectBusy || photoSaveLock.current) return;
    if (!online || !order.includes(id)) {
      // 읽기 전용 탐색: 진행 중 위치 쓰기의 대기 의도만 취소하고 요청은 보내지 않는다.
      queuedPosition.current = null;
      setQueuedView(null);
      setBrowseStyleId(id);
      return;
    }
    setBrowseStyleId(null);
    setError(null);
    if (positionMutation.isPending) {
      queuedPosition.current = id;
      setQueuedView(id);
      return;
    }
    if (id === activeId) return;
    positionMutation.mutate(id);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 1700);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (onBeforeStart)
      writeAuthDraft("onboarding", { step, previewCategory, openGenre, viewStyleId, intro });
  }, [step, previewCategory, openGenre, viewStyleId, intro, onBeforeStart]);
  useEffect(() => {
    if (showIntro && new URLSearchParams(window.location.search).get("explore") === "1") {
      if (onBeforeStart)
        void onBeforeStart().then((ok) => {
          if (ok) setIntro(false);
        });
    }
  }, [showIntro, onBeforeStart]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {intro ? (
        <IntroScreen
          onStart={() => {
            if (onBeforeStart)
              void onBeforeStart().then((ok) => {
                if (ok) setIntro(false);
              });
            else setIntro(false);
          }}
        />
      ) : (
        <div className="onboarding-shell">
          <header className="onboarding-header items-center">
            <span className="onboarding-header-start">
              {/* The category step comes straight after the intro, so it has no back button (user, 2026-10-28). */}
              {step !== "category" && !sessionQuery.isPending && (
                <button
                  type="button"
                  className="back-button"
                  aria-label="뒤로 가기"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    if (step === "summary") setStep("explore");
                    else setStep("category");
                  }}
                >
                  <ArrowLeft size={22} aria-hidden="true" />
                </button>
              )}
            </span>
            {/* Account sits top right on every screen; the step count and the app name next to the
                back button are gone (user, 2026-10-28). */}
            <AccountLink />
          </header>

          {is401 && (
            <div
              role="alert"
              className="connection-notice flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm">
                이전 기록을 불러오지 못했어요. 새로 시작하면 지금까지의 기록은 지워져요.
              </p>
              <Button
                variant="outline"
                className="rounded-none border-foreground"
                onClick={() => setResetOpen(true)}
              >
                새로 시작
              </Button>
            </div>
          )}

          {offline && !is401 && (
            <div role="status" className="connection-notice">
              <p className="label-caps text-highlight">분류 미리보기 · 저장 연결 준비 중</p>
              <p className="mt-1 text-sm text-muted-foreground">
                서버에 연결할 수 없어요. 분류는 둘러볼 수 있지만 어떤 선택도 저장되지 않아요.
              </p>
              <Button
                variant="link"
                className="mt-1 h-auto p-0 text-foreground"
                onClick={() => void sessionQuery.refetch()}
              >
                다시 연결
              </Button>
            </div>
          )}

          {sessionQuery.isPending ? (
            <div role="status" aria-label="기록을 불러오는 중" className="category-grid">
              <div className="category-skeleton" />
              <div className="category-skeleton" />
            </div>
          ) : step === "category" ? (
            <section key="category" className="category-section">
              <h1 className="category-title">
                어떤 옷을
                <br />
                추천받을까요?
              </h1>
              <p className="mt-4 text-sm text-muted-foreground">추천받을 옷의 범주</p>
              <div className="category-grid">
                {CLOTHING_CATEGORIES.map((c, i) => {
                  const count = styleCountFor(c.id);
                  const photo = INTRO_IMAGES[i];
                  return (
                    <Button
                      variant="ghost"
                      key={c.id}
                      aria-pressed={categoryId === c.id}
                      aria-label={`${c.name} 선택, ${count}개 스타일`}
                      disabled={busy}
                      onClick={() => chooseCategory(c.id)}
                      className="category-card"
                    >
                      {photo && <img src={photo.src} alt={photo.alt} />}
                      <span aria-hidden="true" className="category-caption">
                        <span className="category-name">{c.name}</span>
                        <span className="category-count">
                          {categoryMutation.isPending && categoryMutation.variables === c.id
                            ? "저장 중…"
                            : `${count}개 스타일`}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </section>
          ) : step === "explore" && categoryId ? (
            <section key="explore" className="explore-section animate-page mt-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="label-caps text-muted-foreground">02 — 장르 · 스타일</p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs text-foreground"
                  onClick={() => setStep("category")}
                >
                  범주 바꾸기
                </Button>
              </div>
              <h1 className="explore-heading mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
                {CLOTHING_CATEGORIES.find((c) => c.id === categoryId)?.name}의 장르
              </h1>
              {isPreview && online && (
                <p role="status" className="mt-3 label-caps text-highlight">
                  분류 미리보기 · 저장 연결 준비 중
                </p>
              )}
              <p className="browse-note mt-3 text-sm text-muted-foreground">
                장르를 열어 보는 것은 저장되지 않아요. 취향은 아래 스타일 응답으로만 기록돼요.
              </p>

              <PreferenceRail
                session={session}
                message={error ?? notice}
                failed={!!error}
                currentStyleId={activeId}
              />
              <div className="explore-layout">
                <ol className="genre-list" aria-label="상위 장르">
                  {sections.map((g, gi) => {
                    const open = openGenre === g.id;
                    return (
                      <li key={g.id} className="border-t border-border">
                        <Button
                          variant="ghost"
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenGenre(open ? null : g.id)}
                          className={cn(
                            "h-auto w-full justify-start whitespace-normal rounded-none px-0 items-baseline gap-4 py-4 text-left hover:bg-secondary",
                            FOCUS,
                          )}
                        >
                          <span className="label-caps w-6 text-muted-foreground">
                            {String(gi + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 text-left font-display text-2xl font-black">
                            {g.name}
                          </span>
                          <span className="text-xs text-muted-foreground">{g.styles.length}</span>
                        </Button>
                        {open && (
                          <div className="animate-page pb-6 pl-10">
                            {g.image && (
                              <figure data-testid="genre-representative" className="mb-4">
                                <img
                                  src={g.image.thumbnailUrl}
                                  alt={g.image.alt}
                                  width={g.image.width}
                                  height={g.image.height}
                                  className="aspect-[4/3] w-full object-cover"
                                />
                                <figcaption className="label-caps mt-2 text-muted-foreground">
                                  장르 대표 이미지 · {g.name}
                                </figcaption>
                              </figure>
                            )}
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {g.description}
                            </p>
                            <ul className="mt-4 grid grid-cols-2 gap-3">
                              {g.styles.map((s, si) => {
                                const isCurrent = s.id === shownId && !pendingPosition;
                                const isPending = s.id === pendingPosition;
                                return (
                                  <li key={s.id} className={si % 3 === 0 ? "col-span-2" : ""}>
                                    <button
                                      type="button"
                                      className={cn(
                                        "style-pick block w-full min-h-11 text-left",
                                        isCurrent && "style-pick-current",
                                        FOCUS,
                                      )}
                                      aria-label={`${s.name} 스타일 보기`}
                                      aria-current={isCurrent ? "true" : undefined}
                                      aria-busy={isPending || undefined}
                                      onClick={() => selectStyle(s.id)}
                                    >
                                      <EditorialFrame
                                        title={s.name}
                                        ratio={si % 3 === 0 ? "wide" : "tall"}
                                      />
                                      {(isCurrent || isPending) && (
                                        <span className="style-pick-badge label-caps">
                                          {isPending ? "이동 중" : "보는 중"}
                                        </span>
                                      )}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <div className="explore-deck" ref={deckRef}>
                  <p className="response-label label-caps text-muted-foreground">스타일 응답</p>
                  {failedPosition && !expired && (
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={() => selectStyle(failedPosition)}
                    >
                      다시 시도
                    </Button>
                  )}
                  {online && session && order.length > 0 && pagerGenres.length > 0 && (
                    <StylePager
                      genres={pagerGenres}
                      currentId={shownId}
                      busy={busy}
                      onSelect={(id) => {
                        if (!busy) selectStyle(id);
                      }}
                      preview={previewImage}
                      renderCover={(id) => (
                        <StyleCover
                          session={session}
                          styleId={id}
                          images={styleQuery.data?.images ?? []}
                          busy={busy}
                          onDoubleLike={() => {
                            setError(null);
                            responseMutation.mutate({
                              styleId: id,
                              response: "liked",
                              next: undefined,
                            });
                          }}
                          onHeart={heartActive}
                          onZoom={setZoom}
                        />
                      )}
                    />
                  )}
                  {browse ? (
                    <article
                      className="mt-4 bg-secondary p-6"
                      aria-label={`${browse.style.name} 읽기 전용 상세`}
                      data-testid="browse-detail"
                    >
                      <p className="label-caps text-muted-foreground">{browse.genre.name}</p>
                      <h2 className="mt-2 font-display text-3xl font-black">{browse.style.name}</h2>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {browse.genre.description}
                      </p>
                      <p role="status" className="label-caps mt-4 text-highlight">
                        사진 준비 중
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {online
                          ? "이 스타일은 아직 응답할 수 없어요. 준비되면 여기서 바로 고를 수 있어요."
                          : "저장 연결이 준비되면 스타일마다 좋아요(두 번 탭)나 건너뛰기로 응답할 수 있어요."}
                      </p>
                    </article>
                  ) : !online ? (
                    <p className="mt-4 border border-dashed border-input p-5 text-sm text-muted-foreground">
                      저장 연결이 준비되면 스타일마다 좋아요(두 번 탭)나 건너뛰기로 응답할 수
                      있어요.
                    </p>
                  ) : order.length === 0 ? (
                    <div role="status" className="mt-4 bg-secondary p-6">
                      <p className="font-serif-kr text-2xl font-bold">콘텐츠 준비 중</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        응답할 수 있는 스타일 사진을 준비하고 있어요. 준비되면 여기서 바로 이어갈 수
                        있어요.
                      </p>
                    </div>
                  ) : activeId ? (
                    <StyleCard
                      session={session as SessionView}
                      styleId={activeId}
                      description={styleQuery.data?.description ?? null}
                      failed={!!error}
                    />
                  ) : null}

                  <Button
                    className="summary-action mt-8 w-full text-base"
                    disabled={!online || busy}
                    onClick={() => {
                      setError(null);
                      setStep("summary");
                    }}
                  >
                    취향 확인하기
                  </Button>
                  {/* Skips choosing tastes altogether (user, 2026-10-28): nothing is saved as an
                      answer; the dialog says recommendations will be made without them. */}
                  <Button
                    variant="outline"
                    className="skip-response mt-3 w-full"
                    disabled={busy}
                    onClick={() => setSkipOpen(true)}
                  >
                    건너뛰기
                  </Button>
                  <AlertDialog open={skipOpen} onOpenChange={setSkipOpen}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>취향 고르기를 건너뛸까요?</AlertDialogTitle>
                        <AlertDialogDescription>
                          취향을 고르지 않아도 괜찮아요. 등록한 옷과 조건에 맞춰 자동으로 추천해
                          드릴게요. 지금까지 좋아요한 스타일이 있으면 함께 반영하고, 취향은 나중에
                          언제든 다시 고를 수 있어요.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>계속 고르기</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            track({ type: "skip_tastes" });
                            onComplete();
                          }}
                        >
                          건너뛰고 사진 등록으로
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </section>
          ) : step === "summary" ? (
            <SummaryStep
              loading={summaryQuery.isPending}
              failed={summaryQuery.isError}
              summary={summaryQuery.data ?? null}
              busy={busy}
              error={error}
              onRetry={() => void summaryQuery.refetch()}
              onBack={() => setStep("explore")}
              onComplete={() => {
                setError(null);
                completeMutation.mutate();
              }}
            />
          ) : null}
        </div>
      )}

      <Dialog open={zoom !== null} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl rounded-none bg-background p-3">
          <DialogTitle className="sr-only">사진 크게 보기</DialogTitle>
          {zoom && (
            <img
              src={zoom.originalUrl}
              alt={zoom.alt}
              className="max-h-[80vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>처음부터 다시 시작할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이전 온보딩 기록이 지워지고 새 세션으로 시작해요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                resetMutation.mutate();
              }}
            >
              {resetMutation.isPending ? "시작하는 중…" : "새로 시작하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** The photo of the current style in the pager: double tap likes it, heart and zoom are separate. */
function StyleCover({
  session,
  styleId,
  images,
  busy,
  onDoubleLike,
  onHeart,
  onZoom,
}: {
  session: SessionView;
  styleId: string;
  images: StyleImage[];
  busy: boolean;
  onDoubleLike: () => void;
  onHeart: (img: StyleImage, selected: boolean) => void;
  onZoom: (img: StyleImage) => void;
}) {
  const order = session.activeStyleOrder;
  const name = session.styles.find((s) => s.id === styleId)?.name ?? "";
  const current = session.responses.find((r) => r.styleId === styleId)?.response ?? null;
  const primary = images[0];
  const tap = useDoubleTap(busy || !order.includes(styleId), (img) => {
    if (img) {
      if (!isSelected(session, styleId, img)) onHeart(img, true);
    } else if (current !== "liked") onDoubleLike();
  });
  return (
    <div
      className="swipe-cover"
      aria-describedby="double-tap-hint"
      data-testid="style-card-photo"
      {...tap(primary)}
    >
      <span id="double-tap-hint" className="sr-only">
        두 번 탭하면 좋아요
      </span>
      {primary ? (
        <div
          className="swipe-photo"
          data-testid="style-card-frame"
          style={{
            aspectRatio:
              primary.width > 0 && primary.height > 0
                ? `${primary.width} / ${primary.height}`
                : "3 / 4",
          }}
        >
          <img src={primary.thumbnailUrl} alt={primary.alt} />
          <Button
            variant="secondary"
            size="icon"
            aria-label={`${primary.alt || name} 크게 보기`}
            onClick={() => onZoom(primary)}
            className="absolute right-3 top-16 rounded-full"
          >
            <Maximize2 />
          </Button>
          <PhotoHeart
            image={primary}
            selected={isSelected(session, styleId, primary)}
            busy={busy}
            onHeart={onHeart}
          />
          {primary.isGenerated && <span className="photo-pending">AI 생성 예시</span>}
        </div>
      ) : (
        <span className="photo-pending">사진 준비 중</span>
      )}
    </div>
  );
}

const isSelected = (session: SessionView, styleId: string, img: StyleImage) =>
  session.imagePreferences.some((p) => p.styleId === styleId && p.imageId === img.id && p.selected);

/**
 * Two quick taps on the same photo (or the cover) within 350ms. A press that moved (a scroll or a
 * slide between cards) is not a tap, so sliding never hearts a photo by accident.
 */
function useDoubleTap(disabled: boolean, onDouble: (img?: StyleImage) => void) {
  const last = useRef<{ imageId: string | null; time: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  return (img?: StyleImage) => ({
    onPointerDown: (e: React.PointerEvent) => {
      down.current = (e.target as HTMLElement).closest("button")
        ? null
        : { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = down.current;
      down.current = null;
      if (!start || Math.abs(e.clientX - start.x) >= 10 || Math.abs(e.clientY - start.y) >= 10)
        return;
      const now = Date.now();
      const previous = last.current;
      const imageId = img?.id ?? null;
      last.current = { imageId, time: now };
      if (!previous || previous.imageId !== imageId || now - previous.time > 350) return;
      last.current = null;
      if (!disabled) onDouble(img);
    },
    onPointerCancel: () => {
      down.current = null;
    },
  });
}

// Moving between styles is done on the pager above; counters and prev/next are gone (user, 2026-10-28).
function StyleCard({
  session,
  styleId,
  description,
  failed,
}: {
  session: SessionView;
  styleId: string;
  description: string | null;
  failed: boolean;
}) {
  const name = session.styles.find((s) => s.id === styleId)?.name ?? "";
  return (
    <article className={cn("mt-4", failed && "shake")}>
      <div className="swipe-footer">
        <h2>{name}</h2>
      </div>
      {description && (
        <p className="px-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
    </article>
  );
}

function PhotoHeart({
  image,
  selected,
  busy,
  onHeart,
}: {
  image: StyleImage;
  selected: boolean;
  busy: boolean;
  onHeart: (image: StyleImage, selected: boolean) => void;
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label="이 사진 좋아요"
      aria-pressed={selected}
      disabled={busy}
      onClick={() => onHeart(image, !selected)}
      className="photo-heart absolute right-3 top-3 rounded-full"
    >
      <Heart aria-hidden="true" />
    </Button>
  );
}

function SummaryStep({
  loading,
  failed,
  summary,
  busy,
  error,
  onRetry,
  onBack,
  onComplete,
}: {
  loading: boolean;
  failed: boolean;
  summary: import("@/lib/onboarding-session-api").SessionSummary | null;
  busy: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  const reason = summary ? incompleteReason(summary) : null;
  const canComplete = summary?.session.progress.canComplete === true;
  return (
    <section key="summary" className="animate-page mt-6">
      <p className="label-caps text-muted-foreground">03 — 취향 확인</p>
      <h1 className="summary-title mt-4">지금까지 고른 취향</h1>
      {loading ? (
        <p role="status" className="mt-8 text-muted-foreground">
          요약을 불러오는 중…
        </p>
      ) : failed || !summary ? (
        <div role="alert" className="mt-8 border-l-2 border-destructive pl-3 text-sm">
          요약을 불러오지 못했어요.
          <Button variant="link" className="ml-2 h-auto p-0" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      ) : (
        <>
          <PreferenceRail session={summary.session} message={null} failed={false} />
          <ul className="liked-chips" aria-label="좋아요한 스타일">
            {summary.likedStyles.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
          <dl className="summary-counts">
            {[
              { label: "별로", count: summary.dislikedStyles.length },
              { label: "건너뜀", count: summary.skippedStyles.length },
              { label: "남음", count: summary.unansweredStyleIds.length },
            ].map((g) => (
              <div key={g.label}>
                <dt>{g.label}</dt>
                <dd>{g.count}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {reason && (
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          {reason}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 border-l-2 border-destructive pl-3 text-sm">
          {error}
        </p>
      )}
      {/* A plain button instead of the swipe-to-turn page (user, 2026-10-28). */}
      <div className="mt-6 flex flex-col gap-3 md:flex-row">
        <Button className="summary-action" disabled={!canComplete || busy} onClick={onComplete}>
          {busy ? "저장하는 중…" : "취향 저장하고 사진 등록으로"}
        </Button>
        <Button variant="outline" className="summary-action" onClick={onBack}>
          스타일 더 보기
        </Button>
      </div>
    </section>
  );
}
