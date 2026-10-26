import type { AuthConfig } from "../../config.ts";
import { DomainError } from "../onboarding/domain.ts";

/** A login provider the server talks to. Tests inject a fake through buildApp; there is no runtime switch to one. */
export interface OAuthProvider {
  readonly name: "kakao";
  authorizeUrl(state: string): string;
  /** Exchanges the authorization code and returns the provider's stable user number. */
  subjectFor(code: string): Promise<string>;
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
    authorizeUrl(state) {
      const url = new URL("https://kauth.kakao.com/oauth/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", settings.restApiKey);
      url.searchParams.set("redirect_uri", settings.redirectUri);
      url.searchParams.set("state", state);
      return url.toString();
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
