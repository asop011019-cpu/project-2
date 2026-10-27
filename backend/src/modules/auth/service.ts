import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AuthConfig } from "../../config.ts";
import { DomainError } from "../onboarding/domain.ts";
import type { OAuthProvider } from "./kakao.ts";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const authRequired = () =>
  new DomainError(401, "AUTH_REQUIRED", "로그인이 필요해요.");

/** Only same-site relative paths survive; anything else falls back to "/". */
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return "/";
  const base = "http://return-to.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return "/";
  }
  if (url.origin !== base || url.pathname.startsWith("/api/")) return "/";
  return url.pathname + url.search + url.hash;
}

export interface ConsentDocumentView {
  key: string;
  version: number;
  required: boolean;
  title: string;
  body: string;
  effectiveAt: string;
}
export interface ConsentDecision {
  key: string;
  version: number;
  granted: boolean;
}
export interface AuthContext {
  userId: string;
  sessionId: string;
  /** Set when this request rotated the login token; the route must send the new cookie. */
  renewedToken?: string;
  cookieExpiresAt: string;
}
interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  previousTokenHash: string | null;
  previousValidUntil: string | null;
  renewedAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  status: string;
}

export class AuthService {
  private readonly db: DatabaseSync;
  private readonly config: AuthConfig;
  private readonly provider: OAuthProvider | undefined;
  private readonly now: () => Date;
  /** Removes the user's onboarding progress, garment rows and photo files (owned by the onboarding module). */
  private readonly deleteUserData: (userId: string) => void;
  private deletionRun: Promise<void> = Promise.resolve();
  constructor(
    db: DatabaseSync,
    config: AuthConfig,
    provider: OAuthProvider | undefined,
    now: () => Date = () => new Date(),
    deleteUserData: (userId: string) => void = () => {},
  ) {
    this.db = db;
    this.config = config;
    this.provider = provider;
    this.now = now;
    this.deleteUserData = deleteUserData;
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  clock(): Date {
    return this.now();
  }
  private at(offsetSeconds = 0): string {
    return new Date(this.now().getTime() + offsetSeconds * 1000).toISOString();
  }

  currentDocuments(): ConsentDocumentView[] {
    const rows = this.db
      .prepare(
        `SELECT d.key, d.version, d.required, d.title, d.body, d.effective_at AS effectiveAt
         FROM consent_documents d
         WHERE d.effective_at<=? AND d.version=(SELECT max(version) FROM consent_documents x WHERE x.key=d.key AND x.effective_at<=?)
         ORDER BY d.required DESC, d.key`,
      )
      .all(this.at(), this.at()) as unknown as (Omit<
      ConsentDocumentView,
      "required"
    > & { required: number })[];
    return rows.map((row) => ({ ...row, required: row.required === 1 }));
  }
  document(key: string, version: number): ConsentDocumentView {
    const row = this.db
      .prepare(
        "SELECT key, version, required, title, body, effective_at AS effectiveAt FROM consent_documents WHERE key=? AND version=?",
      )
      .get(key, version) as
      | (Omit<ConsentDocumentView, "required"> & { required: number })
      | undefined;
    if (!row)
      throw new DomainError(
        404,
        "CONSENT_DOCUMENT_NOT_FOUND",
        "동의 문서를 찾을 수 없어요.",
      );
    return { ...row, required: row.required === 1 };
  }

  startLogin(
    returnTo: unknown,
    options: { reauth?: boolean } = {},
  ): { location: string; binder: string } {
    if (!this.provider)
      throw new DomainError(
        503,
        "AUTH_PROVIDER_NOT_CONFIGURED",
        "카카오 로그인이 아직 설정되지 않았어요. 서버의 KAKAO_REST_API_KEY 설정이 필요해요.",
      );
    const state = newToken();
    const binder = newToken();
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM oauth_states WHERE expires_at<=?")
        .run(this.at());
      this.db
        .prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?,?)")
        .run(
          sha256(state),
          sha256(binder),
          this.provider!.name,
          safeReturnTo(returnTo),
          this.at(),
          this.at(this.config.handshakeTtlSeconds),
        );
    });
    return {
      location: this.provider.authorizeUrl(state, {
        forceLogin: options.reauth === true,
      }),
      binder,
    };
  }

  /** Consumes the state exactly once; a state is only valid with the browser cookie that started it. */
  consumeState(
    state: unknown,
    binder: string | undefined,
  ): { returnTo: string } | undefined {
    if (typeof state !== "string" || !TOKEN.test(state)) return undefined;
    const row = this.transaction(
      () =>
        this.db
          .prepare(
            "DELETE FROM oauth_states WHERE state_hash=? RETURNING browser_hash AS browserHash, return_to AS returnTo, expires_at AS expiresAt",
          )
          .get(sha256(state)) as
          | { browserHash: string; returnTo: string; expiresAt: string }
          | undefined,
    );
    if (
      !row ||
      !binder ||
      !TOKEN.test(binder) ||
      row.browserHash !== sha256(binder) ||
      row.expiresAt <= this.at()
    )
      return undefined;
    return { returnTo: row.returnTo };
  }

  async completeLogin(
    code: string,
    returnTo: string,
  ): Promise<
    | { kind: "session"; token: string; expiresAt: string; returnTo: string }
    | { kind: "signup"; token: string }
  > {
    const subject = await this.provider!.subjectFor(code);
    return this.transaction(() => {
      const identity = this.db
        .prepare(
          "SELECT u.id AS userId, u.status FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.provider_subject=?",
        )
        .get(this.provider!.name, subject) as
        { userId: string; status: string } | undefined;
      if (identity) {
        if (identity.status !== "active")
          throw new DomainError(
            403,
            "ACCOUNT_UNAVAILABLE",
            "탈퇴 처리 중인 계정이에요.",
          );
        return {
          kind: "session" as const,
          ...this.createSession(identity.userId),
          returnTo,
        };
      }
      this.refuseWhileUnlinking(subject);
      const token = newToken();
      this.db
        .prepare("DELETE FROM pending_signups WHERE expires_at<=?")
        .run(this.at());
      this.db
        .prepare("INSERT INTO pending_signups VALUES(?,?,?,?,?,?)")
        .run(
          sha256(token),
          this.provider!.name,
          subject,
          returnTo,
          this.at(),
          this.at(this.config.handshakeTtlSeconds),
        );
      return { kind: "signup" as const, token };
    });
  }

  private pending(token: string | undefined) {
    const row =
      token && TOKEN.test(token)
        ? (this.db
            .prepare(
              "SELECT provider, provider_subject AS subject, return_to AS returnTo, expires_at AS expiresAt FROM pending_signups WHERE token_hash=?",
            )
            .get(sha256(token)) as
            | {
                provider: "kakao";
                subject: string;
                returnTo: string;
                expiresAt: string;
              }
            | undefined)
        : undefined;
    if (!row || row.expiresAt <= this.at())
      throw new DomainError(
        410,
        "SIGNUP_EXPIRED",
        "가입 시간이 지났어요. 다시 로그인해 주세요.",
      );
    return row;
  }
  pendingSignup(token: string | undefined) {
    const row = this.pending(token);
    return { provider: row.provider, documents: this.currentDocuments() };
  }

  private validateDecisions(
    decisions: readonly ConsentDecision[],
    documents: readonly ConsentDocumentView[],
  ): ConsentDecision[] {
    const byKey = new Map(documents.map((d) => [d.key, d]));
    const seen = new Set<string>();
    for (const decision of decisions) {
      const doc = byKey.get(decision.key);
      if (!doc || seen.has(decision.key))
        throw new DomainError(
          400,
          "INVALID_INPUT",
          "알 수 없거나 중복된 동의 항목이에요.",
        );
      seen.add(decision.key);
      if (decision.version !== doc.version)
        throw new DomainError(
          409,
          "CONSENT_VERSION_MISMATCH",
          "동의 문서가 바뀌었어요. 최신 내용을 다시 확인해 주세요.",
        );
    }
    const missing = documents.filter(
      (d) =>
        d.required &&
        !decisions.some((x) => x.key === d.key && x.granted === true),
    );
    if (missing.length)
      throw new DomainError(
        400,
        "CONSENT_REQUIRED",
        `필수 동의가 필요해요: ${missing.map((d) => d.title).join(", ")}`,
      );
    return documents.map(
      (d) =>
        decisions.find((x) => x.key === d.key) ?? {
          key: d.key,
          version: d.version,
          granted: false,
        },
    );
  }
  private recordConsent(userId: string, decision: ConsentDecision): void {
    const now = this.at();
    this.db
      .prepare(
        "INSERT INTO user_consents VALUES(?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET version=excluded.version, granted=excluded.granted, decided_at=excluded.decided_at",
      )
      .run(
        userId,
        decision.key,
        decision.version,
        decision.granted ? 1 : 0,
        now,
      );
    this.db
      .prepare(
        "INSERT INTO consent_events(user_id,key,version,granted,decided_at) VALUES(?,?,?,?,?)",
      )
      .run(
        userId,
        decision.key,
        decision.version,
        decision.granted ? 1 : 0,
        now,
      );
  }

  signup(
    token: string | undefined,
    decisions: readonly ConsentDecision[],
  ): { userId: string; token: string; expiresAt: string; returnTo: string } {
    return this.transaction(() => {
      const pending = this.pending(token);
      const all = this.validateDecisions(decisions, this.currentDocuments());
      this.db
        .prepare("DELETE FROM pending_signups WHERE token_hash=?")
        .run(sha256(token!));
      const taken = this.db
        .prepare(
          "SELECT 1 FROM user_identities WHERE provider=? AND provider_subject=?",
        )
        .get(pending.provider, pending.subject);
      if (taken)
        throw new DomainError(
          409,
          "IDENTITY_ALREADY_LINKED",
          "이미 가입된 카카오 계정이에요. 다시 로그인해 주세요.",
        );
      this.refuseWhileUnlinking(pending.subject);
      const userId = randomUUID();
      const now = this.at();
      this.db
        .prepare("INSERT INTO users VALUES(?,?,?,NULL)")
        .run(userId, "active", now);
      this.db
        .prepare("INSERT INTO user_identities VALUES(?,?,?,?,NULL,NULL,?)")
        .run(randomUUID(), userId, pending.provider, pending.subject, now);
      for (const decision of all) this.recordConsent(userId, decision);
      return {
        userId,
        ...this.createSession(userId),
        returnTo: pending.returnTo,
      };
    });
  }

  private createSession(userId: string): { token: string; expiresAt: string } {
    const token = newToken();
    const now = this.at();
    const absolute = this.at(this.config.absoluteTtlSeconds);
    const idle = this.at(this.config.idleTtlSeconds);
    const expiresAt = idle < absolute ? idle : absolute;
    this.db
      .prepare(
        "INSERT INTO auth_sessions VALUES(?,?,?,NULL,NULL,?,?,?,?,?,NULL,NULL)",
      )
      .run(
        randomUUID(),
        userId,
        sha256(token),
        now,
        now,
        now,
        expiresAt,
        absolute,
      );
    return { token, expiresAt };
  }

  /**
   * Validates the login cookie. Once per renewAfterSeconds the token rotates; the previous
   * token stays valid for rotationGraceSeconds so parallel requests are not logged out.
   */
  authenticate(
    token: string | undefined,
    options: { allowConsentUpdate?: boolean } = {},
  ): AuthContext {
    if (!token || !TOKEN.test(token)) throw authRequired();
    const hash = sha256(token);
    const context = this.transaction((): AuthContext => {
      const row = this.db
        .prepare(
          `SELECT s.id, s.user_id AS userId, s.token_hash AS tokenHash, s.previous_token_hash AS previousTokenHash,
             s.previous_valid_until AS previousValidUntil, s.renewed_at AS renewedAt, s.idle_expires_at AS idleExpiresAt,
             s.absolute_expires_at AS absoluteExpiresAt, s.revoked_at AS revokedAt, u.status
           FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? OR s.previous_token_hash=?`,
        )
        .get(hash, hash) as SessionRow | undefined;
      const now = this.at();
      if (
        !row ||
        row.revokedAt ||
        row.status !== "active" ||
        row.idleExpiresAt <= now ||
        row.absoluteExpiresAt <= now
      )
        throw authRequired();
      const base = {
        userId: row.userId,
        sessionId: row.id,
        cookieExpiresAt: row.idleExpiresAt,
      };
      if (row.tokenHash !== hash) {
        if (!row.previousValidUntil || row.previousValidUntil <= now)
          throw authRequired();
        return base;
      }
      const due =
        Date.parse(row.renewedAt) + this.config.renewAfterSeconds * 1000 <=
        this.now().getTime();
      if (!due) return base;
      const next = newToken();
      const idle = this.at(this.config.idleTtlSeconds);
      const idleExpiresAt =
        idle < row.absoluteExpiresAt ? idle : row.absoluteExpiresAt;
      this.db
        .prepare(
          "UPDATE auth_sessions SET previous_token_hash=token_hash, previous_valid_until=?, token_hash=?, renewed_at=?, idle_expires_at=? WHERE id=?",
        )
        .run(
          this.at(this.config.rotationGraceSeconds),
          sha256(next),
          now,
          idleExpiresAt,
          row.id,
        );
      return { ...base, renewedToken: next, cookieExpiresAt: idleExpiresAt };
    });
    if (!options.allowConsentUpdate) {
      const updates = this.consentUpdates(context.userId);
      if (updates.length)
        throw new DomainError(
          403,
          "CONSENT_UPDATE_REQUIRED",
          `바뀐 필수 동의를 확인해 주세요: ${updates.map((d) => d.title).join(", ")}`,
        );
    }
    return context;
  }

  private decisionsOf(userId: string) {
    return this.db
      .prepare(
        "SELECT key, version, granted, decided_at AS decidedAt FROM user_consents WHERE user_id=?",
      )
      .all(userId) as unknown as {
      key: string;
      version: number;
      granted: number;
      decidedAt: string;
    }[];
  }
  /** Required documents whose current version the user has not accepted. */
  consentUpdates(userId: string): ConsentDocumentView[] {
    const decisions = this.decisionsOf(userId);
    return this.currentDocuments().filter(
      (doc) =>
        doc.required &&
        !decisions.some(
          (d) =>
            d.key === doc.key && d.version === doc.version && d.granted === 1,
        ),
    );
  }
  hasConsent(userId: string, key: string): boolean {
    const doc = this.currentDocuments().find((d) => d.key === key);
    return this.decisionsOf(userId).some(
      (d) => d.key === key && d.granted === 1 && d.version === doc?.version,
    );
  }

  me(context: AuthContext) {
    const providers = (
      this.db
        .prepare(
          "SELECT provider FROM user_identities WHERE user_id=? ORDER BY created_at",
        )
        .all(context.userId) as unknown as { provider: string }[]
    ).map((row) => row.provider);
    const session = this.db
      .prepare(
        "SELECT idle_expires_at AS idleExpiresAt, absolute_expires_at AS absoluteExpiresAt FROM auth_sessions WHERE id=?",
      )
      .get(context.sessionId) as {
      idleExpiresAt: string;
      absoluteExpiresAt: string;
    };
    const current = this.currentDocuments();
    const decisions = this.decisionsOf(context.userId);
    return {
      user: {
        id: context.userId,
        providers,
        consents: Object.fromEntries(
          current.map((doc) => {
            const d = decisions.find((x) => x.key === doc.key);
            return [
              doc.key,
              {
                required: doc.required,
                currentVersion: doc.version,
                acceptedVersion: d ? d.version : null,
                granted: d
                  ? d.granted === 1 && d.version === doc.version
                  : false,
                decidedAt: d?.decidedAt ?? null,
              },
            ];
          }),
        ),
      },
      consentUpdates: this.consentUpdates(context.userId).map((d) => ({
        key: d.key,
        version: d.version,
      })),
      session,
    };
  }

  decide(userId: string, decision: ConsentDecision): void {
    this.transaction(() => {
      const doc = this.currentDocuments().find((d) => d.key === decision.key);
      if (!doc)
        throw new DomainError(
          400,
          "INVALID_INPUT",
          "알 수 없는 동의 항목이에요.",
        );
      if (decision.version !== doc.version)
        throw new DomainError(
          409,
          "CONSENT_VERSION_MISMATCH",
          "동의 문서가 바뀌었어요. 최신 내용을 다시 확인해 주세요.",
        );
      if (doc.required && !decision.granted)
        throw new DomainError(
          400,
          "REQUIRED_CONSENT_CANNOT_BE_WITHDRAWN",
          "필수 동의는 철회할 수 없어요. 원하지 않으면 탈퇴해 주세요.",
        );
      this.recordConsent(userId, decision);
    });
  }

  logout(token: string | undefined): void {
    if (!token || !TOKEN.test(token)) return;
    const hash = sha256(token);
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE auth_sessions SET revoked_at=?, revoke_reason='logout' WHERE (token_hash=? OR previous_token_hash=?) AND revoked_at IS NULL",
        )
        .run(this.at(), hash, hash);
    });
  }
  logoutAll(userId: string): void {
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE auth_sessions SET revoked_at=?, revoke_reason='logout_all' WHERE user_id=? AND revoked_at IS NULL",
        )
        .run(this.at(), userId);
    });
  }

  /**
   * Account deletion (AUTH-004). Step 1 commits atomically: the account is marked deleting (no new
   * logins), every login session is revoked, and a deletion job records what later steps need.
   * The remaining steps run from that job alone, so they can be retried without a login.
   */
  async requestDeletion(context: AuthContext): Promise<void> {
    this.transaction(() => {
      const session = this.db
        .prepare("SELECT authenticated_at AS at FROM auth_sessions WHERE id=?")
        .get(context.sessionId) as { at: string } | undefined;
      if (
        !session ||
        Date.parse(session.at) + this.config.reauthWindowSeconds * 1000 <
          this.now().getTime()
      )
        throw new DomainError(
          401,
          "REAUTH_REQUIRED",
          "탈퇴하려면 카카오로 다시 로그인해 주세요.",
        );
      const identity = this.db
        .prepare(
          "SELECT provider, provider_subject AS subject FROM user_identities WHERE user_id=? AND provider='kakao'",
        )
        .get(context.userId) as
        { provider: string; subject: string } | undefined;
      const now = this.at();
      this.db
        .prepare(
          "UPDATE users SET status='deleting', deleted_at=? WHERE id=? AND status='active'",
        )
        .run(now, context.userId);
      this.db
        .prepare(
          "INSERT INTO account_deletions(id,user_id,provider,provider_subject,stage,attempts,last_error,created_at,updated_at) VALUES(?,?,?,?,'pending',0,NULL,?,?)",
        )
        .run(
          randomUUID(),
          context.userId,
          identity?.provider ?? null,
          identity?.subject ?? null,
          now,
          now,
        );
      this.db
        .prepare(
          "UPDATE auth_sessions SET revoked_at=?, revoke_reason='account_deleted' WHERE user_id=? AND revoked_at IS NULL",
        )
        .run(now, context.userId);
    });
    await this.processDeletions();
  }

  /** True while a deletion job is unlinking this Kakao member (claim younger than the lease). */
  private unlinkInFlight(subject: string): boolean {
    return !!this.db
      .prepare(
        "SELECT 1 FROM account_deletions WHERE provider_subject=? AND unlink_started_at IS NOT NULL AND unlink_started_at>?",
      )
      .get(subject, this.at(-this.config.unlinkLeaseSeconds));
  }
  private refuseWhileUnlinking(subject: string): void {
    if (this.unlinkInFlight(subject))
      throw new DomainError(
        403,
        "ACCOUNT_UNAVAILABLE",
        "탈퇴 정리가 끝나는 중이에요. 잠시 후 다시 로그인해 주세요.",
      );
  }

  /** Advances unfinished deletion jobs; runs are serialized and safe to repeat. */
  processDeletions(): Promise<void> {
    this.deletionRun = this.deletionRun.then(() => this.runDeletions());
    return this.deletionRun;
  }
  private async runDeletions(): Promise<void> {
    const jobs = this.db
      .prepare(
        "SELECT id, user_id AS userId, provider_subject AS subject, stage FROM account_deletions WHERE stage!='done' ORDER BY created_at",
      )
      .all() as unknown as {
      id: string;
      userId: string;
      subject: string | null;
      stage: "pending" | "data_deleted";
    }[];
    for (const job of jobs) {
      const failed = (code: string) =>
        this.db
          .prepare(
            "UPDATE account_deletions SET attempts=attempts+1, last_error=?, updated_at=? WHERE id=?",
          )
          .run(code, this.at(), job.id);
      try {
        if (job.stage === "pending") {
          // Photo files and onboarding rows first; a file error leaves everything in place for a retry.
          this.deleteUserData(job.userId);
          this.transaction(() => {
            this.db.prepare("DELETE FROM users WHERE id=?").run(job.userId);
            this.db
              .prepare(
                "UPDATE account_deletions SET stage='data_deleted', last_error=NULL, updated_at=? WHERE id=?",
              )
              .run(this.at(), job.id);
          });
          job.stage = "data_deleted";
        }
        if (job.subject) {
          // Claim the unlink atomically. If the member already joined again, unlinking would cut
          // the new account's connection, so skip it. Otherwise new signups for this member are
          // refused while the claim is fresh (see unlinkInFlight), so none can slip in meanwhile.
          const claim = this.transaction(() => {
            const rejoined = this.db
              .prepare(
                "SELECT 1 FROM user_identities WHERE provider='kakao' AND provider_subject=?",
              )
              .get(job.subject);
            if (rejoined) return "rejoined";
            this.db
              .prepare(
                "UPDATE account_deletions SET unlink_started_at=? WHERE id=?",
              )
              .run(this.at(), job.id);
            return "claimed";
          });
          if (claim === "claimed") {
            let result: "unlinked" | "not_configured" | undefined;
            try {
              result = this.provider
                ? await this.provider.unlink(job.subject)
                : "not_configured";
            } finally {
              if (result !== "unlinked")
                this.db
                  .prepare(
                    "UPDATE account_deletions SET unlink_started_at=NULL WHERE id=?",
                  )
                  .run(job.id);
            }
            if (result === "not_configured") {
              failed("KAKAO_UNLINK_NOT_CONFIGURED");
              continue;
            }
          }
        }
        this.db
          .prepare(
            "UPDATE account_deletions SET stage='done', provider=NULL, provider_subject=NULL, unlink_started_at=NULL, last_error=NULL, updated_at=? WHERE id=?",
          )
          .run(this.at(), job.id);
      } catch (error) {
        failed(
          error instanceof DomainError
            ? error.code
            : ((error as NodeJS.ErrnoException).code ?? "ERROR"),
        );
      }
    }
  }
}
