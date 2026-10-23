import type { CatalogView, SessionView } from "../api/onboarding";

export type View = "category" | "explore" | "review" | "complete";
export interface Route {
  view?: View;
  genre?: string;
  focus?: string;
}
export function readRoute(): Route {
  const query = new URLSearchParams(location.search);
  const view = query.get("view");
  return {
    view: ["category", "explore", "review", "complete"].includes(view ?? "")
      ? (view as View)
      : undefined,
    genre: query.get("genre") ?? undefined,
    focus: query.get("focus") ?? undefined,
  };
}
export function writeRoute(route: Route, replace = false) {
  const query = new URLSearchParams();
  if (route.view) query.set("view", route.view);
  if (route.genre) query.set("genre", route.genre);
  if (route.focus) query.set("focus", route.focus);
  history[replace ? "replaceState" : "pushState"](
    {},
    "",
    `${location.pathname}?${query}`,
  );
}
export function categoryGroups(
  catalog: CatalogView | null,
  session: SessionView | null,
) {
  const groups =
    catalog?.genreGroups
      .filter((group) => group.categoryId === session?.selectedCategoryId)
      .toSorted((a, b) => a.order - b.order) ?? [];
  return session?.photoExploration
    ? session.photoExploration.genres.flatMap((visit) => {
        const group = groups.find((group) => group.id === visit.genreGroupId);
        return group ? [group] : [];
      })
    : groups;
}
export function activeGroupStyles(
  session: SessionView | null,
  genreId?: string,
) {
  // Preserve the frozen session order. Taxonomy labels are never promoted into live content.
  return (
    session?.activeStyleOrder.flatMap((id) => {
      const style = session.styles.find(
        (style) => style.id === id && style.genreGroupId === genreId,
      );
      return style ? [style] : [];
    }) ?? []
  );
}
