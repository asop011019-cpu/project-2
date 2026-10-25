import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const imageMocks = vi.hoisted(() => ({
  checkImageFile: vi.fn(),
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

vi.mock("@/lib/image-check", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/image-check")>();
  return {
    ...original,
    checkImageFile: imageMocks.checkImageFile,
  };
});

import { GarmentScreen } from "@/components/garment/GarmentScreen";

const RESTORE_QUERY_KEY = ["onboarding", "garment"] as const;

function renderScreen(queryClient = new QueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <GarmentScreen />
      </QueryClientProvider>,
    ),
  };
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
};

function makeImageFile(name = "pants.jpg") {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: "image/jpeg" });
}

async function selectFile(file: File) {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GarmentScreen R1", () => {
  it("저장 성공 후 복원 캐시가 갱신되어 재마운트 시 최신 정보가 보인다", async () => {
    const updated: Garment = {
      ...savedGarment,
      brand: "새 브랜드",
      updatedAt: "2026-10-25T02:00:00Z",
    };
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    apiMocks.putGarment.mockResolvedValue(updated);

    const queryClient = new QueryClient();
    const first = renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByLabelText(/브랜드/)).toHaveValue("브랜드");
    });

    const brandInput = screen.getByLabelText(/브랜드/);
    await userEvent.clear(brandInput);
    await userEvent.type(brandInput, "새 브랜드");
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(RESTORE_QUERY_KEY)).toEqual(updated);
    });

    // 재마운트: 서버가 아직 옛 값을 돌려줘도 캐시의 최신 정보가 복원되어야 한다
    first.unmount();
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByLabelText(/브랜드/)).toHaveValue("새 브랜드");
    });
  });

  it("삭제 성공 후 복원 캐시가 비워져 재마운트 시 빈 상태가 보인다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    apiMocks.deleteGarment.mockResolvedValue(undefined);

    const queryClient = new QueryClient();
    const first = renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 하의 사진")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(RESTORE_QUERY_KEY)).toBeNull();
    });

    // 재마운트: 서버가 아직 옛 값을 돌려줘도 삭제된 상태가 유지되어야 한다
    first.unmount();
    apiMocks.getGarment.mockResolvedValue(savedGarment);
    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사진 선택" })).toBeInTheDocument();
    });
    expect(screen.queryByAltText("등록한 기준 하의 사진")).not.toBeInTheDocument();
  });

  it("저장 실패 후 사진을 제거하면 재시도 버튼이 비활성화되고 PUT을 다시 보내지 않는다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(null);
    imageMocks.checkImageFile.mockResolvedValue({ ok: true });
    apiMocks.putGarment.mockRejectedValue(
      new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }),
    );

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사진 선택" })).toBeInTheDocument();
    });

    await selectFile(makeImageFile());
    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 하의 사진")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "바지" }));

    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    await waitFor(() => {
      expect(screen.getByText(/저장에 실패했어요/)).toBeInTheDocument();
    });
    expect(apiMocks.putGarment).toHaveBeenCalledTimes(1);

    // 로컬 사진 제거 → 저장 조건(사진 없음)이 깨진다
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));

    const retryButton = screen.getByRole("button", { name: "다시 시도" });
    expect(retryButton).toBeDisabled();
    await userEvent.click(retryButton);
    expect(apiMocks.putGarment).toHaveBeenCalledTimes(1);
  });

  it("사진을 읽는 동안에는 저장할 수 없다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(null);
    // 읽기가 끝나지 않는 상태를 만든다
    imageMocks.checkImageFile.mockReturnValue(new Promise(() => {}));

    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "사진 선택" })).toBeInTheDocument();
    });

    await selectFile(makeImageFile());
    await waitFor(() => {
      expect(screen.getByText("사진을 확인하는 중…")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "바지" }));

    const saveButton = screen.getByRole("button", { name: "저장하기" });
    expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    expect(apiMocks.putGarment).not.toHaveBeenCalled();
  });

  it("서버 저장 사진 로드 실패(404)를 표시하고 입력은 보존하며 재시도를 제공한다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);

    renderScreen();

    const img = await screen.findByAltText("등록한 기준 하의 사진");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText(/저장된 사진을 불러오지 못했어요/)).toBeInTheDocument();
    });
    // 입력은 그대로 남아 있다
    expect(screen.getByLabelText(/브랜드/)).toHaveValue("브랜드");
    expect(screen.getByLabelText(/제품명/)).toHaveValue("와이드 슬랙스");
    // 자동 초기화 없음
    expect(apiMocks.resetSession).not.toHaveBeenCalled();

    // 재시도하면 캐시 우회 쿼리를 붙여 다시 요청한다
    await userEvent.click(screen.getByRole("button", { name: "사진 다시 불러오기" }));
    await waitFor(() => {
      expect(screen.getByAltText("등록한 기준 하의 사진")).toHaveAttribute(
        "src",
        "/api/onboarding/session/garment/image?v=2026-10-25T01%3A00%3A00Z&r=1",
      );
    });
  });

  it("사진 404 상태에서도 교체·삭제 버튼에 접근할 수 있다", async () => {
    apiMocks.ensureSession.mockResolvedValue(undefined);
    apiMocks.getGarment.mockResolvedValue(savedGarment);

    renderScreen();

    const img = await screen.findByAltText("등록한 기준 하의 사진");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText(/저장된 사진을 불러오지 못했어요/)).toBeInTheDocument();
    });
    // 재시도와 함께 교체·삭제로 복구할 수 있어야 한다
    expect(screen.getByRole("button", { name: "사진 다시 불러오기" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "교체" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
  });

  it("지연된 복원 GET과 저장이 경합해도 캐시는 저장 성공 값을 유지한다", async () => {
    const updated: Garment = {
      ...savedGarment,
      brand: "새 브랜드",
      updatedAt: "2026-10-25T02:00:00Z",
    };
    apiMocks.ensureSession.mockResolvedValue(undefined);
    // 첫 복원은 옛 값, 이후 재조회는 늦게 도착하는 옛 값을 흉내 낸다
    let resolveLateGet: ((g: Garment) => void) | undefined;
    apiMocks.getGarment.mockResolvedValueOnce(savedGarment).mockImplementationOnce(
      () =>
        new Promise<Garment>((resolve) => {
          resolveLateGet = resolve;
        }),
    );
    apiMocks.putGarment.mockResolvedValue(updated);

    const queryClient = new QueryClient();
    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByLabelText(/브랜드/)).toHaveValue("브랜드");
    });

    // 저장 직전에 느린 재조회를 시작한다
    const refetchPromise = queryClient.refetchQueries({ queryKey: RESTORE_QUERY_KEY });

    const brandInput = screen.getByLabelText(/브랜드/);
    await userEvent.clear(brandInput);
    await userEvent.type(brandInput, "새 브랜드");
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(RESTORE_QUERY_KEY)).toEqual(updated);
    });

    // 늦은 GET이 옛 값으로 도착해도 캐시는 저장 성공 값을 유지해야 한다
    resolveLateGet?.(savedGarment);
    await refetchPromise;
    expect(queryClient.getQueryData(RESTORE_QUERY_KEY)).toEqual(updated);
    expect(screen.getByLabelText(/브랜드/)).toHaveValue("새 브랜드");
  });
});
