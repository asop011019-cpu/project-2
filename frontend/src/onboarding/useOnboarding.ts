import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/onboarding";
import type {
  CatalogView,
  ClothingCategoryId,
  SessionSummary,
  SessionView,
  StyleDetail,
} from "../api/onboarding";
import {
  activeGroupStyles,
  categoryGroups,
  readRoute,
  writeRoute,
} from "./navigation";
import type { Route } from "./navigation";
import { PreferenceQueue } from "./PreferenceQueue";

export function useOnboarding() {
  const [session, setSession] = useState<SessionView | null>(null);
  const sessionRef = useRef<SessionView | null>(null);
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [route, setRoute] = useState(readRoute);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const failedAction = useRef<(() => Promise<void>) | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [details, setDetails] = useState<Record<string, StyleDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [writeVersion, setWriteVersion] = useState(0);
  const commit = useCallback((value: SessionView) => {
    sessionRef.current = value;
    setSession(value);
  }, []);
  const [preferences] = useState(
    () =>
      new PreferenceQueue(api.prefer, commit, () =>
        setWriteVersion((value) => value + 1),
      ),
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const navigate = useCallback((value: Route) => {
    writeRoute(value);
    setRoute(value);
    window.scrollTo({ top: 0, behavior: "instant" });
    document
      .getElementById("main-content")
      ?.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const pop = () => {
      if (preferences.pending || locked.current) {
        writeRoute(routeRef.current, true);
        return;
      }
      setRoute(readRoute());
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [preferences]);
  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (preferences.pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [preferences]);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [state, definitions] = await Promise.all([
        api.initialize(),
        api.catalog(),
      ]);
      commit(state);
      setCatalog(definitions);
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError("불러오지 못했어요. 다시 시도해 주세요."),
      );
    } finally {
      setLoading(false);
    }
  }, [commit]);
  useEffect(() => {
    void initialize();
  }, [initialize]);

  const groups = categoryGroups(catalog, session);
  const savedGroup = session?.photoExploration?.currentGenreGroupId;
  const group =
    groups.find((group) => group.id === route.genre) ??
    groups.find((group) => group.id === savedGroup) ??
    groups[0];
  const view = !session?.selectedCategoryId
    ? "category"
    : !session.photoExploration
      ? "category"
      : route.view === "complete" && session.status !== "completed"
        ? "review"
        : (route.view ??
          (session.status === "completed"
            ? "complete"
            : session.photoExploration.currentGenreGroupId === null
              ? "review"
              : "explore"));
  const groupStyles = activeGroupStyles(session, group?.id);
  const detailKey = groupStyles.map((style) => style.id).join(",");
  const catalogVersion = session?.currentCatalogVersion;

  useEffect(() => {
    if (view !== "explore" || !detailKey) {
      setDetailsLoading(false);
      return;
    }
    let current = true;
    setDetailsLoading(true);
    setDetailErrors({});
    setDetails({});
    const ids = detailKey.split(",");
    void Promise.allSettled(ids.map((id) => api.detail(id))).then((results) => {
      if (!current) return;
      const next: Record<string, StyleDetail> = {},
        errors: Record<string, string> = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") next[result.value.id] = result.value;
        else
          errors[ids[index]] =
            result.reason instanceof Error
              ? result.reason.message
              : "사진을 불러오지 못했어요.";
      });
      setDetails(next);
      setDetailErrors(errors);
      setDetailsLoading(false);
    });
    return () => {
      current = false;
    };
  }, [detailKey, catalogVersion, retry, view]);

  useEffect(() => {
    if ((view !== "review" && view !== "complete") || preferences.pending)
      return;
    let current = true;
    const epoch = preferences.version;
    setSummaryLoading(true);
    setSummary(null);
    void api
      .summary()
      .then((value) => {
        if (current && epoch === preferences.version && !preferences.pending) {
          setSummary(value);
          commit(value.session);
        }
      })
      .catch((error) => {
        if (current) setError(error);
      })
      .finally(() => {
        if (current) setSummaryLoading(false);
      });
    return () => {
      current = false;
    };
  }, [view, session?.updatedAt, retry, commit, preferences, writeVersion]);

  const run = async (action: () => Promise<void>) => {
    if (locked.current || preferences.pending) return;
    locked.current = true;
    failedAction.current = null;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      failedAction.current = action;
      setError(
        error instanceof ApiError
          ? error
          : new ApiError(
              "저장하지 못했어요. 화면을 유지했으니 다시 시도해 주세요.",
            ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const selectCategory = (id: ClothingCategoryId) =>
    run(async () => {
      let value = await api.category(id);
      commit(value);
      if (!value.photoExploration) value = await api.startPhotos();
      commit(value);
      setSummary(null);
      const choices = categoryGroups(catalog, value);
      const saved = value.photoExploration?.currentGenreGroupId;
      navigate({
        view:
          value.status === "completed"
            ? "complete"
            : saved === null
              ? "review"
              : "explore",
        genre: saved ?? choices[0]?.id,
      });
    });
  const goGroup = (id: string, focus?: string) =>
    run(async () => {
      const current = sessionRef.current;
      if (!groups.some((group) => group.id === id)) return;
      if (current?.photoExploration?.currentGenreGroupId !== id)
        commit(await api.genrePosition(id));
      navigate({ view: "explore", genre: id, focus });
    });
  const review = () =>
    run(async () => {
      if (sessionRef.current?.photoExploration?.currentGenreGroupId)
        commit(await api.genrePosition(null));
      navigate({ view: "review" });
    });
  const prefer = (styleId: string, imageId: string, selected: boolean) => {
    if (!locked.current) preferences.set(styleId, imageId, selected);
  };
  const advanceGroup = (status: "viewed" | "skipped") =>
    run(async () => {
      if (!group) return;
      const next =
        groups[groups.findIndex((value) => value.id === group?.id) + 1];
      commit(await api.visitGenre(group.id, status, next?.id ?? null));
      navigate(next ? { view: "explore", genre: next.id } : { view: "review" });
    });
  const finish = () =>
    run(async () => {
      commit(await api.complete());
      navigate({ view: "complete" });
    });
  const refreshCatalog = () =>
    run(async () => {
      const value = await api.refresh();
      commit(value);
      setCatalog(await api.catalog());
      setRetry((value) => value + 1);
    });
  const edit = (styleId?: string) => {
    const id = styleId ?? session?.activeStyleOrder[0];
    const genre =
      session?.styles.find((style) => style.id === id)?.genreGroupId ??
      groups[0]?.id;
    if (genre) return goGroup(genre, id);
    navigate({ view: "explore" });
  };
  const restartExpired = () => {
    // Explicitly choosing a new session discards the expired session's unsaved intents.
    preferences.clear();
    return run(async () => {
      await api.delete();
      const [value, definitions] = await Promise.all([
        api.initialize(),
        api.catalog(),
      ]);
      commit(value);
      setCatalog(definitions);
      navigate({ view: "category" });
    });
  };
  return {
    session,
    catalog,
    route,
    view,
    groups,
    group,
    groupStyles,
    loading,
    busy: busy || preferences.pending,
    heartDisabled: busy,
    savingPhotos: preferences.pending && !preferences.error,
    error:
      preferences.error instanceof ApiError
        ? preferences.error
        : preferences.error
          ? new ApiError(preferences.error.message)
          : error,
    details,
    detailErrors,
    detailsLoading,
    summary,
    summaryLoading,
    initialize,
    navigate,
    selectCategory,
    goGroup,
    prefer,
    isSelected: (imageId: string) =>
      preferences.desired(imageId) ??
      session?.imagePreferences.some(
        (preference) => preference.imageId === imageId && preference.selected,
      ) ??
      false,
    nextGroup: () => advanceGroup("viewed"),
    skipGroup: () => advanceGroup("skipped"),
    review,
    finish,
    edit,
    refreshCatalog,
    restartExpired,
    retry: () => {
      if (preferences.pending) {
        preferences.retry();
        return;
      }
      if (failedAction.current) {
        void run(failedAction.current);
        return;
      }
      setError(null);
      setRetry((value) => value + 1);
    },
    dismissError: preferences.error ? undefined : () => setError(null),
  };
}
export type OnboardingController = ReturnType<typeof useOnboarding>;
