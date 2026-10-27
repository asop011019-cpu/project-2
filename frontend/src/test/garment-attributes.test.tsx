import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAttributesBody,
  flattenValues,
  pruneForType,
  visibleOptions,
  AXES,
} from "@/lib/garment-attributes";
import { ApiError, type Garment, type GarmentType } from "@/lib/onboarding-api";

const apiMocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  getGarment: vi.fn(),
  putGarment: vi.fn(),
  deleteGarment: vi.fn(),
  resetSession: vi.fn(),
  putGarmentAttributes: vi.fn(),
}));

vi.mock("@/lib/onboarding-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/onboarding-api")>();
  return {
    ...original,
    ensureSession: apiMocks.ensureSession,
    getGarment: apiMocks.getGarment,
    putGarment: apiMocks.putGarment,
    deleteGarment: apiMocks.deleteGarment,
    resetSession: apiMocks.resetSession,
    putGarmentAttributes: apiMocks.putGarmentAttributes,
  };
});

import { GarmentScreen } from "@/components/garment/GarmentScreen";

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GarmentScreen />
    </QueryClientProvider>,
  );
}

function makeGarment(garmentType: GarmentType, attributes: Garment["attributes"] = null): Garment {
  return {
    id: "g1",
    garmentType,
    brand: null,
    productName: null,
    purchaseUrl: null,
    imageUrl: "/api/onboarding/session/garment/image",
    width: 900,
    height: 1200,
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T01:00:00Z",
    attributes,
  };
}

function makeAttributes(
  garmentType: GarmentType,
  values: Record<string, unknown>,
  overrides: Partial<NonNullable<Garment["attributes"]>> = {},
): NonNullable<Garment["attributes"]> {
  return {
    garmentType,
    vocabularyVersion: "garment-vocab-0.2",
    values,
    rawText: null,
    needsConfirmation: false,
    updatedAt: "2026-10-25T01:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("garment-attributes 유닛", () => {
  it("color.* 축은 중첩 객체로, 답하지 않은 축은 빼고 조립한다", () => {
    const body = buildAttributesBody(
      "pants",
      {
        "color.base": "navy",
        "color.tone": "dark",
        materialLook: "denim",
        construction: ["five_pocket"],
        silhouette: "wide",
      },
      "  면 100%  ",
    );
    expect(body).toEqual({
      garmentType: "pants",
      values: {
        color: { base: "navy", tone: "dark" },
        materialLook: "denim",
        construction: ["five_pocket"],
        silhouette: "wide",
      },
      rawText: "면 100%",
    });
  });

  it("다른 종류의 축 키가 남아 있어도 선택한 종류의 축만 보낸다", () => {
    const body = buildAttributesBody(
      "top",
      { construction: ["five_pocket"], topType: "tshirt" },
      "",
    );
    expect(body.values).toEqual({ topType: "tshirt" });
    expect(body.rawText).toBeNull();
  });

  it("빈 배열·빈 문자열은 보내지 않는다", () => {
    const body = buildAttributesBody("skirt", { skirtStructure: [], "color.base": "" }, "   ");
    expect(body.values).toEqual({});
    expect(body.rawText).toBeNull();
  });

  it("pruneForType은 공통 축(색·소재감)만 남긴다", () => {
    const pruned = pruneForType({
      "color.base": "black",
      materialLook: "denim",
      construction: ["five_pocket"],
      silhouette: "wide",
      rawText: "남으면 안 됨",
    });
    expect(pruned).toEqual({ "color.base": "black", materialLook: "denim" });
  });

  it("flattenValues는 중첩 color를 평탄 키로 펼친다", () => {
    expect(
      flattenValues({ color: { base: "navy", pattern: "check" }, construction: ["chino_style"] }),
    ).toEqual({ "color.base": "navy", "color.pattern": "check", construction: ["chino_style"] });
  });

  it("데님 워싱은 소재감이 데님일 때만 보인다", () => {
    const wash = AXES.find((a) => a.key === "color.denimWash");
    if (!wash) throw new Error("wash axis missing");
    expect(visibleOptions(wash, "pants", { materialLook: "denim" }).length).toBeGreaterThan(0);
    expect(visibleOptions(wash, "pants", { materialLook: "suiting" })).toEqual([]);
    expect(visibleOptions(wash, "pants", {})).toEqual([]);
  });

  it("실루엣·기장은 종류별 표시 값만 보여 주되 값은 그대로다", () => {
    const silhouette = AXES.find((a) => a.key === "silhouette");
    if (!silhouette) throw new Error("silhouette axis missing");
    const pantsValues = visibleOptions(silhouette, "pants", {}).map((o) => o.value);
    const skirtValues = visibleOptions(silhouette, "skirt", {}).map((o) => o.value);
    expect(pantsValues).toContain("wide");
    expect(pantsValues).not.toContain("mermaid");
    expect(skirtValues).toContain("mermaid");
    expect(skirtValues).not.toContain("skinny");
    expect(skirtValues[0]).toBe("straight");

    const length = AXES.find((a) => a.key === "length");
    if (!length) throw new Error("length axis missing");
    const pantsLength = visibleOptions(length, "pants", {}).map((o) => o.value);
    const skirtLength = visibleOptions(length, "skirt", {}).map((o) => o.value);
    expect(pantsLength).toEqual([
      "full",
      "ankle",
      "cropped",
      "shorts_knee",
      "shorts_short",
      "unknown",
    ]);
    expect(skirtLength).toEqual(["mini", "midi", "long", "unknown"]);
  });
});

// These tests type and click through sheets; under a full parallel run they exceed the 5s default.
describe("GarmentScreen 옷 정보 확인", { timeout: 15_000 }, () => {
  it("needsConfirmation이면 값 변경 없이도 옷 정보 저장이 가능하다", async () => {
    const saved = makeGarment(
      "pants",
      makeAttributes("pants", { color: { base: "black" } }, { needsConfirmation: true }),
    );
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(saved);
    apiMocks.putGarmentAttributes.mockResolvedValue({
      ...saved,
      attributes: makeAttributes("pants", { color: { base: "black" } }),
    });
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: "옷 정보 확인 (선택)" }));
    const save = screen.getByRole("button", { name: "옷 정보 저장" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(apiMocks.putGarmentAttributes).toHaveBeenCalledTimes(1));
    expect(apiMocks.putGarmentAttributes.mock.calls[0]?.[0]).toMatchObject({
      garmentType: "pants",
    });
  });

  it("두 입력창은 닫혀 시작하며 닫아도 선택값·글과 요약이 유지된다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(makeGarment("pants"));
    renderScreen();
    await screen.findByRole("button", { name: "옷 정보 확인 (선택)" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/브랜드/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "검정" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    await userEvent.click(screen.getByRole("button", { name: "검정" }));
    await userEvent.type(screen.getByLabelText(/직접 적기/), "면 라벨");
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByRole("button", { name: "옷 정보 확인 (선택)" })).toHaveTextContent(
      "1개 항목 선택",
    );
    expect(screen.getByRole("button", { name: "옷 정보 확인 (선택)" })).toHaveTextContent(
      "저장 안 된 변경 있음",
    );
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    expect(screen.getByRole("button", { name: "검정" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/직접 적기/)).toHaveValue("면 라벨");
  });

  it("추가 정보 적용은 요청하지 않고 본문 저장 때 값을 보내며 검증 실패 시 자동으로 열린다", async () => {
    const saved = makeGarment("pants");
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(saved);
    apiMocks.putGarment.mockResolvedValue({ ...saved, brand: "새 브랜드" });
    renderScreen();
    await screen.findByRole("button", { name: "옷 정보 확인 (선택)" });
    await userEvent.click(screen.getByRole("button", { name: "추가 정보 입력 (선택)" }));
    await userEvent.type(screen.getByLabelText(/브랜드/), "새 브랜드");
    await userEvent.type(screen.getByLabelText(/구매처 링크/), "invalid");
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(apiMocks.putGarment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "추가 정보 입력 (선택)" })).toHaveTextContent(
      "브랜드·구매처 링크 입력됨",
    );
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("링크 형식을 확인해 주세요.");
    expect(screen.getByLabelText(/브랜드/)).toHaveValue("새 브랜드");
    await userEvent.clear(screen.getByLabelText(/구매처 링크/));
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    await waitFor(() =>
      expect(apiMocks.putGarment).toHaveBeenCalledWith(
        { garmentType: "pants", brand: "새 브랜드", productName: null, purchaseUrl: null },
        undefined,
      ),
    );
  });

  it("서버 추가 정보 오류는 입력창을 자동으로 열고 입력을 보존한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(makeGarment("pants"));
    apiMocks.putGarment.mockRejectedValue(
      new ApiError({
        status: 400,
        code: "INVALID_INPUT",
        message: "확인 필요",
        issues: [{ path: "brand", message: "브랜드 확인 필요" }],
      }),
    );
    renderScreen();
    await screen.findByRole("button", { name: "옷 정보 확인 (선택)" });
    await userEvent.click(screen.getByRole("button", { name: "추가 정보 입력 (선택)" }));
    await userEvent.type(screen.getByLabelText(/브랜드/), "입력 브랜드");
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("브랜드 확인 필요");
    expect(screen.getByLabelText(/브랜드/)).toHaveValue("입력 브랜드");
  });
  const cases: {
    type: GarmentType;
    typeLabel: string;
    chipLabel: string;
    expectedValues: Record<string, unknown>;
  }[] = [
    {
      type: "top",
      typeLabel: "상의",
      chipLabel: "티셔츠",
      expectedValues: { color: { base: "black" }, topType: "tshirt" },
    },
    {
      type: "pants",
      typeLabel: "바지",
      chipLabel: "5포켓형(청바지형)",
      expectedValues: { color: { base: "black" }, construction: ["five_pocket"] },
    },
    {
      type: "skirt",
      typeLabel: "치마",
      chipLabel: "플리츠",
      expectedValues: { color: { base: "black" }, skirtStructure: ["pleated"] },
    },
    {
      type: "outer",
      typeLabel: "아우터",
      chipLabel: "블레이저·수트 재킷",
      expectedValues: { color: { base: "black" }, outerType: "blazer" },
    },
  ];

  it.each(cases)(
    "$typeLabel: 선택→옷 정보 저장 요청 body가 해당 종류의 축만 포함한다",
    async ({ type, chipLabel, expectedValues }) => {
      const saved = makeGarment(type);
      apiMocks.ensureSession.mockResolvedValue(undefined);
      apiMocks.getGarment.mockResolvedValue(saved);
      apiMocks.putGarmentAttributes.mockImplementation(async (body: unknown) => ({
        ...saved,
        attributes: makeAttributes(type, (body as { values: Record<string, unknown> }).values),
      }));

      renderScreen();

      await waitFor(() => {
        expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
      await userEvent.click(screen.getByRole("button", { name: "검정" }));
      await userEvent.click(screen.getByRole("button", { name: chipLabel }));
      await userEvent.click(screen.getByRole("button", { name: "옷 정보 저장" }));

      await waitFor(() => {
        expect(apiMocks.putGarmentAttributes).toHaveBeenCalledTimes(1);
      });
      expect(apiMocks.putGarmentAttributes.mock.calls[0]?.[0]).toEqual({
        garmentType: type,
        values: expectedValues,
        rawText: null,
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    },
  );

  it("재방문 시 저장된 values·rawText를 그대로 복원한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(
      makeGarment(
        "pants",
        makeAttributes(
          "pants",
          { color: { base: "navy" }, construction: ["five_pocket"], silhouette: "wide" },
          { rawText: "면 100%" },
        ),
      ),
    );

    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "옷 정보 확인 (선택)" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "네이비" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(screen.getByRole("button", { name: "5포켓형(청바지형)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "와이드" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/직접 적기/)).toHaveValue("면 100%");
    // 저장된 값과 같으므로 저장 버튼은 비활성
    expect(screen.getByRole("button", { name: "옷 정보 저장" })).toBeDisabled();
  });

  it("종류를 바꾸면 이전 종류 전용 선택을 지우고 공통만 남긴다", async () => {
    const saved = makeGarment(
      "pants",
      makeAttributes("pants", { color: { base: "navy" }, construction: ["five_pocket"] }),
    );
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(saved);
    apiMocks.putGarmentAttributes.mockImplementation(async (body: unknown) => ({
      ...saved,
      garmentType: "skirt" as const,
      attributes: makeAttributes("skirt", (body as { values: Record<string, unknown> }).values),
    }));

    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "옷 정보 확인 (선택)" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "5포켓형(청바지형)" })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    await userEvent.click(screen.getByRole("button", { name: "치마" }));
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));

    // 바지 전용 축은 사라지고 치마 축이 보인다
    expect(screen.queryByRole("button", { name: "5포켓형(청바지형)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "플리츠" })).toBeInTheDocument();
    // 공통 축(색)은 유지된다
    expect(screen.getByRole("button", { name: "네이비" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "옷 정보 저장" }));
    await waitFor(() => {
      expect(apiMocks.putGarmentAttributes).toHaveBeenCalledTimes(1);
    });
    expect(apiMocks.putGarmentAttributes.mock.calls[0]?.[0]).toEqual({
      garmentType: "skirt",
      values: { color: { base: "navy" } },
      rawText: null,
    });
  });

  it("needsConfirmation이면 다시 확인 안내를 표시한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(
      makeGarment("pants", makeAttributes("pants", {}, { needsConfirmation: true })),
    );

    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "옷 정보 확인 (선택)" }));
    await waitFor(() => {
      expect(
        screen.getByText("사진이나 옷 종류가 바뀌었어요. 정보를 확인하고 다시 저장해 주세요."),
      ).toBeInTheDocument();
    });
  });

  it("저장 실패(네트워크)에도 선택값과 글을 지우지 않는다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(makeGarment("pants"));
    apiMocks.putGarmentAttributes.mockRejectedValue(
      new ApiError({ status: 0, code: "NETWORK_ERROR", message: "" }),
    );

    renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    await userEvent.click(screen.getByRole("button", { name: "검정" }));
    await userEvent.type(screen.getByLabelText(/직접 적기/), "라벨 정보");
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 저장" }));

    await waitFor(() => {
      expect(screen.getByText(/서버에 연결할 수 없어요/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "검정" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/직접 적기/)).toHaveValue("라벨 정보");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("401이어도 세션을 자동으로 초기화하지 않고 입력을 유지한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(makeGarment("pants"));
    apiMocks.putGarmentAttributes.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );

    renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    await userEvent.click(screen.getByRole("button", { name: "검정" }));
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 저장" }));

    await waitFor(() => {
      expect(screen.getAllByText(/세션이 만료됐거나 복원하지 못했어요/)[0]).toBeInTheDocument();
    });
    expect(apiMocks.resetSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "검정" })).toHaveAttribute("aria-pressed", "true");
  });

  it("409 GARMENT_TYPE_CHANGED면 garment를 다시 불러오고 안내하며 입력은 유지한다", async () => {
    const saved = makeGarment("pants");
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(saved);
    apiMocks.putGarmentAttributes.mockRejectedValue(
      new ApiError({ status: 409, code: "GARMENT_TYPE_CHANGED", message: "" }),
    );

    renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });
    expect(apiMocks.getGarment).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    await userEvent.click(screen.getByRole("button", { name: "검정" }));
    await userEvent.click(screen.getByRole("button", { name: "옷 정보 저장" }));

    await waitFor(() => {
      expect(screen.getByText(/옷 종류가 바뀌었어요/)).toBeInTheDocument();
    });
    // garment를 다시 불러왔다
    expect(apiMocks.getGarment).toHaveBeenCalledTimes(2);
    // 입력은 유지된다
    expect(screen.getByRole("button", { name: "검정" })).toHaveAttribute("aria-pressed", "true");
  });

  it("한 개 축은 다시 누르면 선택 해제된다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(makeGarment("pants"));

    renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "옷 정보 확인 (선택)" }));
    const chip = screen.getByRole("button", { name: "검정" });
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    // 선택이 모두 해제되어 저장할 변경이 없다
    expect(screen.getByRole("button", { name: "옷 정보 저장" })).toBeDisabled();
  });

  it("화면 어디에도 AI·분석 완료 문구가 없다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(
      makeGarment("pants", makeAttributes("pants", { color: { base: "navy" } })),
    );

    const { container } = renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });
    expect(container.textContent).not.toMatch(/AI|분석 완료|분석 중|자동 추정/);
  });
});
