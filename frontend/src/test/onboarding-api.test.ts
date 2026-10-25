import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  deleteGarment,
  ensureSession,
  getGarment,
  putGarment,
  resetSession,
} from "@/lib/onboarding-api";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("onboarding-api", () => {
  it("POST session은 JSON {}와 X-Onboarding-Request 헤더를 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await ensureSession();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/onboarding/session");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-Onboarding-Request")).toBe("1");
    expect(init.body).toBe("{}");
  });

  it("GET garment는 {garment:null}을 null로 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { garment: null })));
    await expect(getGarment()).resolves.toBeNull();
  });

  it("PUT은 FormData에 metadata JSON과 image를 담고 Content-Type을 수동 설정하지 않는다", async () => {
    const garment = {
      id: "g1",
      garmentType: "pants",
      brand: null,
      productName: null,
      purchaseUrl: null,
      imageUrl: "/api/onboarding/session/garment/image",
      width: 900,
      height: 1200,
      createdAt: "2026-10-25T00:00:00Z",
      updatedAt: "2026-10-25T00:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { garment }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "pants.jpg", {
      type: "image/jpeg",
    });
    const result = await putGarment(
      { garmentType: "pants", brand: null, productName: null, purchaseUrl: null },
      file,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/onboarding/session/garment");
    expect(init.method).toBe("PUT");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Onboarding-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBeNull();
    const form = init.body as FormData;
    expect(JSON.parse(form.get("metadata") as string)).toEqual({
      garmentType: "pants",
      brand: null,
      productName: null,
      purchaseUrl: null,
    });
    expect((form.get("image") as File).name).toBe("pants.jpg");
    expect(result.id).toBe("g1");
  });

  it("401은 SESSION_REQUIRED ApiError를 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: "SESSION_REQUIRED", message: "세션 필요" },
          requestId: "r1",
        }),
      ),
    );
    const error = await getGarment().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe("SESSION_REQUIRED");
    expect(error.requestId).toBe("r1");
  });

  it("프록시의 비JSON 413도 PAYLOAD_TOO_LARGE 오류로 처리한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Request Entity Too Large</html>", {
          status: 413,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const error = await getGarment().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(413);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("네트워크 실패는 NETWORK_ERROR로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await getGarment().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("DELETE garment는 204를 성공으로 처리한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteGarment()).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("X-Onboarding-Request")).toBe("1");
  });

  it("resetSession은 DELETE 후 POST 순서로 호출한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await resetSession();
    const methods = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method);
    expect(methods).toEqual(["DELETE", "POST"]);
  });
});
