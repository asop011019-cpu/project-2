import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, type Garment } from "@/lib/onboarding-api";

const apiMocks = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  getGarment: vi.fn(),
  putGarment: vi.fn(),
  deleteGarment: vi.fn(),
  resetSession: vi.fn(),
}));

// WARD-001: these screens are tested without a wardrobe server; the list starts empty.
vi.mock("@/lib/wardrobe-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wardrobe-api")>()),
  getWardrobe: vi.fn().mockResolvedValue({ items: [], referenceItemId: null }),
  selectReference: vi.fn(),
  deleteWardrobeItem: vi.fn(),
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

const savedGarment: Garment = {
  id: "g1",
  garmentType: "pants",
  brand: "브랜드",
  productName: "와이드 슬랙스",
  purchaseUrl: "https://example.com/item/1",
  imageUrl: "/api/onboarding/session/garment/image",
  width: 900,
  height: 1200,
  createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-25T01:00:00Z",
  attributes: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("GarmentScreen", () => {
  it("저장된 하의를 복원해 폼에 채운다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);

    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "추가 정보 입력 (선택)" }));
    await waitFor(() => {
      expect(screen.getByLabelText(/브랜드/)).toHaveValue("브랜드");
    });
    expect(screen.getByLabelText(/제품명/)).toHaveValue("와이드 슬랙스");
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(screen.getByRole("button", { name: "바지" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByAltText("등록한 기준 옷 사진")).toHaveAttribute(
      "src",
      "/api/onboarding/session/garment/image?v=2026-10-25T01%3A00%3A00Z",
    );
  });

  it("빈 상태에서는 사진·종류가 없어 저장 버튼이 비활성화된다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(null);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사진 선택" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "저장하기" })).toBeDisabled();
  });

  it("401이어도 세션을 자동으로 초기화하지 않고 명시적 '새로 시작'을 요구한다", async () => {
    apiMocks.ensureSession.mockRejectedValue(
      new ApiError({ status: 401, code: "SESSION_REQUIRED", message: "" }),
    );
    apiMocks.getGarment.mockResolvedValue(null);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText(/세션이 만료됐거나 복원하지 못했어요/)).toBeInTheDocument();
    });
    // 자동 초기화 없음: resetSession이 호출되지 않아야 한다
    expect(apiMocks.resetSession).not.toHaveBeenCalled();

    // 명시적 선택 → 확인 다이얼로그 → 그때만 DELETE+POST
    apiMocks.resetSession.mockResolvedValue(undefined);
    apiMocks.ensureSession.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole("button", { name: "새로 시작" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("처음부터 다시 시작할까요?");
    expect(apiMocks.resetSession).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "새로 시작" }));
    await waitFor(() => {
      expect(apiMocks.resetSession).toHaveBeenCalledTimes(1);
    });
  });

  it("삭제는 확인 다이얼로그를 거쳐 DELETE를 호출한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    apiMocks.deleteGarment.mockResolvedValue(undefined);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 옷 사진")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("등록한 옷을 삭제할까요?");
    expect(apiMocks.deleteGarment).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => {
      expect(apiMocks.deleteGarment).toHaveBeenCalledTimes(1);
    });
  });

  it("저장 실패 시 입력을 유지하고 다시 시도를 제공한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    apiMocks.putGarment.mockRejectedValue(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "", requestId: "req-9" }),
    );

    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "추가 정보 입력 (선택)" }));
    await waitFor(() => {
      expect(screen.getByLabelText(/브랜드/)).toHaveValue("브랜드");
    });

    // 정보를 수정해 dirty 상태로 만든다
    const brandInput = screen.getByLabelText(/브랜드/);
    await userEvent.clear(brandInput);
    await userEvent.type(brandInput, "새 브랜드");

    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    const saveButton = screen.getByRole("button", { name: "저장하기" });
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/저장에 실패했어요/)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "추가 정보 입력 (선택)" }));
    // 입력이 보존되고 재시도 버튼이 보인다
    expect(screen.getByLabelText(/브랜드/)).toHaveValue("새 브랜드");
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    // 일반 재시도에서 세션 삭제는 호출되지 않는다
    expect(apiMocks.resetSession).not.toHaveBeenCalled();
  });
});
