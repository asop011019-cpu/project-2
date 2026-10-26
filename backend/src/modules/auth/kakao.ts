import type { AuthConfig } from "../../config.ts";
import { DomainError } from "../onboarding/domain.ts";

/** A login provider the server talks to. Tests inject a fake through buildApp; there is no runtime switch to one. */
export interface OAuthProvider {
  readonly name: "kakao";
  /** forceLogin asks Kakao to re-enter credentials (used before account deletion). */
  authorizeUrl(state: string, options?: { forceLogin?: boolean }): string;
  /** Exchanges the authorization code and returns the provider's stable user number. */
  subjectFor(code: string): Promise<string>;
  /** Disconnects the member from this app; "not_configured" when no admin key is set. */
  unlink(subject: string): Promise<"unlinked" | "not_configured">;
}

const failure = () =>
  new DomainError(
    502,
    "OAUTH_PROVIDER_ERROR",
    "카카오 로그인 서버와 통신하지 못했어요. 잠시 후 다시 시도해 주세요.",
  );

export function kakaoProvider(
  settings: NonNullable<AuthConfig["kakao"]>,
  fetchImpl: typeof fetch = fetch,
): OAuthProvider {
  return {
    name: "kakao",
    authorizeUrl(state, options = {}) {
      const url = new URL("https://kauth.kakao.com/oauth/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", settings.restApiKey);
      url.searchParams.set("redirect_uri", settings.redirectUri);
      url.searchParams.set("state", state);
      if (options.forceLogin) url.searchParams.set("prompt", "login");
      return url.toString();
    },
    async unlink(subject) {
      if (!settings.adminKey) return "not_configured";
      const response = await fetchImpl(
        "https://kapi.kakao.com/v1/user/unlink",
        {
          method: "POST",
          headers: {
            authorization: `KakaoAK ${settings.adminKey}`,
            "content-type": "application/x-www-form-urlencoded;charset=utf-8",
          },
          body: new URLSearchParams({
            target_id_type: "user_id",
            target_id: subject,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      ).catch(() => undefined);
      // An already-disconnected member is a success for deletion purposes.
      if (response && (response.ok || response.status === 400)) {
        if (response.ok) return "unlinked";
        const body = (await response.json().catch(() => ({}))) as {
          code?: number;
        };
        if (body.code === -101) return "unlinked";
      }
      throw failure();
    },
    async subjectFor(code) {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: settings.restApiKey,
        redirect_uri: settings.redirectUri,
        code,
      });
      if (settings.clientSecret)
        form.set("client_secret", settings.clientSecret);
      let accessToken: unknown;
      try {
        const token = await fetchImpl("https://kauth.kakao.com/oauth/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=utf-8",
          },
          body: form,
          signal: AbortSignal.timeout(10_000),
        });
        if (!token.ok) throw failure();
        accessToken = ((await token.json()) as { access_token?: unknown })
          .access_token;
        if (typeof accessToken !== "string" || !accessToken) throw failure();
        const me = await fetchImpl("https://kapi.kakao.com/v2/user/me", {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!me.ok) throw failure();
        const id = ((await me.json()) as { id?: unknown }).id;
        if (
          !(typeof id === "number" && Number.isSafeInteger(id) && id > 0) &&
          !(typeof id === "string" && /^[0-9]{1,20}$/.test(id))
        )
          throw failure();
        return String(id);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw failure();
      }
    },
  };
}
