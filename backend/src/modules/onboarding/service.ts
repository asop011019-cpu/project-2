import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  DomainError,
  answeredCount,
  assertCompletable,
  explorableStyles,
} from "./domain.ts";
import type { OnboardingRepository } from "./ports.ts";
import type {
  CategorySession,
  ClothingCategoryId,
  ResponseValue,
  SessionRecord,
  SessionView,
  SessionSummary,
  StyleDetail,
  CatalogView,
} from "./types.ts";

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const summaryOf = ({ images: _images, ...style }: StyleDetail) => style;

export class OnboardingService {
  readonly repository: OnboardingRepository;
  readonly now: () => Date;
  readonly ttlSeconds: number;
  constructor(
    repository: OnboardingRepository,
    ttlSeconds: number,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.ttlSeconds = ttlSeconds;
    this.now = now;
  }
  catalog(categoryId?: ClothingCategoryId): CatalogView {
    return this.repository.transaction(() => {
      const catalog = this.repository.catalog();
      const available = explorableStyles(catalog).filter(
        (style) => !categoryId || style.categoryId === categoryId,
      );
      const styles = available.map(summaryOf);
      return {
        version: catalog.version,
        contentStatus: styles.length
          ? ("ready" as const)
          : ("not_ready" as const),
        categories: catalog.categories.filter(
          (category) => !categoryId || category.id === categoryId,
        ),
        genreGroups: catalog.genreGroups
          .filter((group) => !categoryId || group.categoryId === categoryId)
          .map((group) => {
            const published = available.filter(
              (style) => style.genreGroupId === group.id,
            );
            return {
              ...group,
              styleDefinitions: catalog.styles
                .filter((style) => style.genreGroupId === group.id)
                .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
                .map((style) => ({
                  id: style.id,
                  name: style.name,
                  order: style.order,
                  contentStatus: published.some((item) => item.id === style.id)
                    ? ("ready" as const)
                    : ("not_ready" as const),
                })),
              availableStyleCount: published.length,
              contentStatus: published.length
                ? ("ready" as const)
                : ("not_ready" as const),
              representativeImage: published[0]?.images[0] ?? null,
            };
          }),
        styles,
      };
    });
  }
  style(id: string): StyleDetail {
    return this.repository.transaction(() => {
      const style = explorableStyles(this.repository.catalog()).find(
        (style) => style.id === id,
      );
      if (!style)
        throw new DomainError(
          404,
          "STYLE_UNAVAILABLE",
          "현재 공개된 스타일을 찾을 수 없어요.",
        );
      return style;
    });
  }
  isPublicAsset(reference: string): boolean {
    return this.repository.transaction(() =>
      explorableStyles(this.repository.catalog()).some((style) =>
        style.images.some(
          (image) =>
            image.originalUrl === reference || image.thumbnailUrl === reference,
        ),
      ),
    );
  }
  private newSession(): { token: string; record: SessionRecord } {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    return {
      token,
      record: {
        id: randomUUID(),
        tokenHash: hashToken(token),
        selectedCategoryId: null,
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + this.ttlSeconds * 1000,
        ).toISOString(),
      },
    };
  }
  private authenticated(token: string | undefined): SessionRecord {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new DomainError(
        401,
        "SESSION_REQUIRED",
        "유효한 익명 세션 쿠키가 필요해요.",
      );
    const session = this.repository.findSession(hashToken(token));
    if (!session || Date.parse(session.expiresAt) <= this.now().getTime())
      throw new DomainError(
        401,
        "SESSION_REQUIRED",
        "세션을 복원할 수 없어요. 세션을 새로 시작해 주세요.",
      );
    return session;
  }
  private withSession<T>(
    token: string | undefined,
    action: (session: SessionRecord) => T,
  ): T {
    return this.repository.transaction(() => action(this.authenticated(token)));
  }
  create(token?: string): {
    created: boolean;
    token?: string;
    session: SessionView;
  } {
    if (token) return { created: false, session: this.restore(token) };
    return this.repository.transaction(() => {
      const next = this.newSession();
      this.repository.insertSession(next.record);
      return {
        created: true,
        token: next.token,
        session: this.view(next.record),
      };
    });
  }
  restore(token: string | undefined): SessionView {
    return this.withSession(token, (session) => this.view(session));
  }
  delete(token: string | undefined): void {
    this.repository.transaction(() => {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
      const session = this.repository.findSession(hashToken(token));
      if (session) this.repository.deleteSession(session.id);
    });
  }
  reset(token: string | undefined): { token: string; session: SessionView } {
    return this.withSession(token, (previous) => {
      this.repository.deleteSession(previous.id);
      const next = this.newSession();
      this.repository.insertSession(next.record);
      return { token: next.token, session: this.view(next.record) };
    });
  }
  private touch(session: SessionRecord, now: string): void {
    this.repository.touchSession(session.id, now);
    session.updatedAt = now;
  }
  private saveCategory(
    session: SessionRecord,
    category: CategorySession,
    now: string,
  ): void {
    category.updatedAt = now;
    this.repository.updateCategory(category);
    this.touch(session, now);
  }
  selectCategory(
    token: string | undefined,
    categoryId: ClothingCategoryId,
  ): SessionView {
    return this.withSession(token, (session) => {
      const catalog = this.repository.catalog();
      if (!catalog.categories.some((category) => category.id === categoryId))
        throw new DomainError(
          422,
          "CATEGORY_UNAVAILABLE",
          "지원하지 않는 의류 범주예요.",
        );
      const now = this.now().toISOString();
      if (!this.repository.categorySession(session.id, categoryId)) {
        const styles = explorableStyles(catalog).filter(
          (style) => style.categoryId === categoryId,
        );
        this.repository.insertCategory({
          sessionId: session.id,
          categoryId,
          catalogVersion: catalog.version,
          currentStyleId: styles[0]?.id ?? null,
          status: "in_progress",
          startedAt: now,
          updatedAt: now,
          completedAt: null,
        });
        this.repository.replaceSnapshot(
          session.id,
          categoryId,
          styles.map((style) => style.id),
        );
      }
      if (session.selectedCategoryId !== categoryId) {
        this.repository.selectCategory(session.id, categoryId, now);
        session.selectedCategoryId = categoryId;
        session.updatedAt = now;
      }
      return this.view(session);
    });
  }
  private context(session: SessionRecord) {
    if (!session.selectedCategoryId)
      throw new DomainError(
        409,
        "CATEGORY_REQUIRED",
        "먼저 의류 범주를 선택해 주세요.",
      );
    const categoryId = session.selectedCategoryId;
    const category = this.repository.categorySession(session.id, categoryId);
    if (!category) throw new Error("Missing category snapshot.");
    const catalog = this.repository.catalog();
    const eligible = new Map(
      explorableStyles(catalog)
        .filter((style) => style.categoryId === categoryId)
        .map((style) => [style.id, style]),
    );
    const snapshot = this.repository.snapshot(session.id, categoryId);
    const withdrawn = snapshot.filter(
      (row) => row.withdrawnAt === null && !eligible.has(row.styleId),
    );
    const now = this.now().toISOString();
    if (withdrawn.length) {
      this.repository.withdraw(
        session.id,
        categoryId,
        withdrawn.map((row) => row.styleId),
        now,
      );
      for (const row of withdrawn) row.withdrawnAt = now;
    }
    const styles = snapshot
      .filter((row) => row.withdrawnAt === null && eligible.has(row.styleId))
      .map((row) => eligible.get(row.styleId)!);
    const ids = styles.map((style) => style.id);
    const responses = this.repository.responses(session.id, categoryId);
    let changed = withdrawn.length > 0;
    if (
      category.currentStyleId !== null &&
      !ids.includes(category.currentStyleId)
    ) {
      category.currentStyleId =
        ids.find(
          (id) => !responses.some((response) => response.styleId === id),
        ) ??
        ids[0] ??
        null;
      changed = true;
    }
    if (
      category.status === "completed" &&
      (!ids.length || answeredCount(ids, responses) !== ids.length)
    ) {
      category.status = "in_progress";
      category.completedAt = null;
      changed = true;
    }
    if (changed) this.saveCategory(session, category, now);
    return { categoryId, category, catalog, snapshot, styles, ids, responses };
  }
  private view(session: SessionRecord): SessionView {
    if (!session.selectedCategoryId)
      return {
        id: session.id,
        selectedCategoryId: null,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        status: "in_progress",
        completedAt: null,
        contentStatus: "category_required",
        catalogVersion: null,
        currentCatalogVersion: this.repository.catalog().version,
        catalogChanged: false,
        activeStyleOrder: [],
        styles: [],
        currentStyleId: null,
        progress: {
          currentIndex: null,
          answeredCount: 0,
          totalCount: 0,
          originalTotalCount: 0,
          withdrawnCount: 0,
          allAnswered: false,
          canComplete: false,
        },
        navigation: { previousStyleId: null, nextStyleId: null },
        responses: [],
        imagePreferences: [],
      };
    const context = this.context(session);
    const { category, categoryId, catalog, snapshot, styles, ids, responses } =
      context;
    const index = category.currentStyleId
      ? ids.indexOf(category.currentStyleId)
      : -1;
    const answered = answeredCount(ids, responses);
    const visibleImageIds = new Set(
      styles.flatMap((style) => style.images.map((image) => image.id)),
    );
    return {
      id: session.id,
      selectedCategoryId: categoryId,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      status: category.status,
      completedAt: category.completedAt,
      contentStatus: ids.length ? "ready" : "not_ready",
      catalogVersion: category.catalogVersion,
      currentCatalogVersion: catalog.version,
      catalogChanged: category.catalogVersion !== catalog.version,
      activeStyleOrder: ids,
      styles: styles.map(summaryOf),
      currentStyleId: category.currentStyleId,
      progress: {
        currentIndex: index < 0 ? null : index,
        answeredCount: answered,
        totalCount: ids.length,
        originalTotalCount: snapshot.length,
        withdrawnCount: snapshot.length - ids.length,
        allAnswered: ids.length > 0 && answered === ids.length,
        canComplete: ids.length > 0 && answered === ids.length,
      },
      navigation: {
        previousStyleId: index > 0 ? ids[index - 1]! : null,
        nextStyleId: index >= 0 ? (ids[index + 1] ?? null) : null,
      },
      responses: ids.map((styleId) => {
        const response = responses.find((row) => row.styleId === styleId);
        return {
          styleId,
          response: response?.response ?? null,
          updatedAt: response?.updatedAt ?? null,
        };
      }),
      imagePreferences: this.repository
        .preferences(session.id, categoryId)
        .filter((preference) => visibleImageIds.has(preference.imageId))
        .map(({ styleId, imageId, selected, updatedAt }) => ({
          styleId,
          imageId,
          selected,
          updatedAt,
        })),
    };
  }
  private assertActive(ids: readonly string[], styleId: string): void {
    if (!ids.includes(styleId))
      throw new DomainError(
        422,
        "STYLE_NOT_IN_SESSION",
        "현재 범주의 탐색 목록에 없는 스타일이에요.",
      );
  }
  respond(
    token: string | undefined,
    styleId: string,
    response: ResponseValue,
    nextStyleId?: string | null,
  ): SessionView {
    return this.withSession(token, (session) => {
      const { category, categoryId, ids, responses } = this.context(session);
      this.assertActive(ids, styleId);
      if (nextStyleId !== undefined && nextStyleId !== null)
        this.assertActive(ids, nextStyleId);
      const changedResponse =
        responses.find((row) => row.styleId === styleId)?.response !== response;
      const changedPosition =
        nextStyleId !== undefined && nextStyleId !== category.currentStyleId;
      if (changedResponse || changedPosition) {
        const now = this.now().toISOString();
        if (changedResponse) {
          this.repository.saveResponse({
            sessionId: session.id,
            categoryId,
            styleId,
            response,
            updatedAt: now,
          });
          category.status = "in_progress";
          category.completedAt = null;
        }
        if (nextStyleId !== undefined) category.currentStyleId = nextStyleId;
        this.saveCategory(session, category, now);
      }
      return this.view(session);
    });
  }
  preferImage(
    token: string | undefined,
    styleId: string,
    imageId: string,
    selected: boolean,
  ): SessionView {
    return this.withSession(token, (session) => {
      const { category, categoryId, ids, styles } = this.context(session);
      this.assertActive(ids, styleId);
      if (
        !styles
          .find((style) => style.id === styleId)!
          .images.some((image) => image.id === imageId)
      )
        throw new DomainError(
          422,
          "IMAGE_NOT_IN_STYLE",
          "이 스타일에서 선택할 수 없는 이미지예요.",
        );
      const previous = this.repository
        .preferences(session.id, categoryId)
        .find((row) => row.imageId === imageId);
      if (previous?.selected === selected || (!previous && !selected))
        return this.view(session);
      const now = this.now().toISOString();
      this.repository.savePreference({
        sessionId: session.id,
        categoryId,
        styleId,
        imageId,
        selected,
        updatedAt: now,
      });
      category.status = "in_progress";
      category.completedAt = null;
      this.saveCategory(session, category, now);
      return this.view(session);
    });
  }
  position(token: string | undefined, styleId: string | null): SessionView {
    return this.withSession(token, (session) => {
      const { category, ids } = this.context(session);
      if (styleId !== null) this.assertActive(ids, styleId);
      if (category.currentStyleId !== styleId) {
        category.currentStyleId = styleId;
        this.saveCategory(session, category, this.now().toISOString());
      }
      return this.view(session);
    });
  }
  summary(token: string | undefined): SessionSummary {
    return this.withSession(token, (session) => {
      const view = this.view(session);
      const selected = (response: ResponseValue) =>
        new Set(
          view.responses
            .filter((row) => row.response === response)
            .map((row) => row.styleId),
        );
      const liked = selected("liked"),
        disliked = selected("disliked"),
        skipped = selected("skipped");
      const imageIds = new Set(
        view.imagePreferences
          .filter((row) => row.selected)
          .map((row) => row.imageId),
      );
      const styles = explorableStyles(this.repository.catalog()).filter(
        (style) => view.activeStyleOrder.includes(style.id),
      );
      return {
        session: view,
        likedStyles: view.styles.filter((style) => liked.has(style.id)),
        dislikedStyles: view.styles.filter((style) => disliked.has(style.id)),
        skippedStyles: view.styles.filter((style) => skipped.has(style.id)),
        unansweredStyleIds: view.responses
          .filter((row) => row.response === null)
          .map((row) => row.styleId),
        likedImages: styles
          .flatMap((style) => style.images)
          .filter((image) => imageIds.has(image.id)),
        isExploringOnly: liked.size === 0,
      };
    });
  }
  complete(token: string | undefined): SessionView {
    return this.withSession(token, (session) => {
      const { category, ids, responses } = this.context(session);
      assertCompletable(ids.length, answeredCount(ids, responses));
      if (category.status !== "completed") {
        const now = this.now().toISOString();
        category.status = "completed";
        category.completedAt = now;
        category.currentStyleId = null;
        this.saveCategory(session, category, now);
      }
      return this.view(session);
    });
  }
  refreshCatalog(token: string | undefined): SessionView {
    return this.withSession(token, (session) => {
      const {
        category,
        categoryId,
        catalog,
        ids: oldIds,
        responses,
      } = this.context(session);
      const ids = explorableStyles(catalog)
        .filter((style) => style.categoryId === categoryId)
        .map((style) => style.id);
      if (
        category.catalogVersion === catalog.version &&
        JSON.stringify(oldIds) === JSON.stringify(ids)
      )
        return this.view(session);
      this.repository.replaceSnapshot(session.id, categoryId, ids);
      category.catalogVersion = catalog.version;
      if (
        category.currentStyleId !== null &&
        !ids.includes(category.currentStyleId)
      )
        category.currentStyleId = null;
      if (!ids.length || answeredCount(ids, responses) !== ids.length) {
        category.status = "in_progress";
        category.completedAt = null;
        category.currentStyleId =
          ids.find((id) => !responses.some((row) => row.styleId === id)) ??
          ids[0] ??
          null;
      }
      this.saveCategory(session, category, this.now().toISOString());
      return this.view(session);
    });
  }
}
