import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const wardrobeMocks = vi.hoisted(() => ({
  getWardrobe: vi.fn(),
  selectReference: vi.fn(),
  deleteWardrobeItem: vi.fn(),
}));

vi.mock("@/lib/onboarding-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/onboarding-api")>()),
  ...apiMocks,
}));
vi.mock("@/lib/wardrobe-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wardrobe-api")>()),
  ...wardrobeMocks,
}));
vi.mock("@/lib/image-check", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-check")>()),
  checkImageFile: vi.fn().mockResolvedValue({ ok: true }),
}));

import { GarmentScreen } from "@/components/garment/GarmentScreen";

const item = (id: string, garmentType: Garment["garmentType"]): Garment => ({
  id,
  garmentType,
  brand: null,
  productName: null,
  purchaseUrl: null,
  imageUrl: `/api/wardrobe/items/${id}/image`,
  width: 900,
  height: 1200,
  createdAt: "2026-10-28T00:00:00Z",
  updatedAt: "2026-10-28T00:00:00Z",
  attributes: null,
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GarmentScreen />
    </QueryClientProvider>,
  );
}
async function choosePhoto() {
  const input = document.querySelector('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array([0xff, 0xd8])], "x.jpg", { type: "image/jpeg" })] },
  });
  await screen.findByAltText("등록한 기준 옷 사진");
}
const shelf = () => screen.getByRole("region", { name: /내 옷장/ });

afterEach(() => vi.clearAllMocks());

describe("WARD-001 내 옷장", { timeout: 15_000 }, () => {
  it("고르기만 한 사진은 옷장에 없고, 실패 후 재시도는 같은 항목 ID로 보낸다", async () => {
    apiMocks.getGarment.mockResolvedValue(null);
    wardrobeMocks.getWardrobe.mockResolvedValue({ items: [], referenceItemId: null });
    apiMocks.putGarment
      .mockRejectedValueOnce(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "" }))
      .mockResolvedValueOnce(item("new", "top"));
    renderScreen();
    expect(await within(shelf()).findByText(/아직 저장한 옷이 없어요/)).toBeInTheDocument();
    await choosePhoto();
    await userEvent.click(screen.getByRole("button", { name: "상의" }));
    expect(within(shelf()).getByText(/아직 저장한 옷이 없어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    await screen.findByText(/저장에 실패했어요/);
    wardrobeMocks.getWardrobe.mockResolvedValue({
      items: [item("new", "top")],
      referenceItemId: "new",
    });
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(apiMocks.putGarment).toHaveBeenCalledTimes(2));
    const [first, second] = apiMocks.putGarment.mock.calls.map((c) => c[0].itemId);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
    // Only the server's list (after a 200) shows the garment as registered.
    expect(
      await within(shelf()).findByRole("listitem", { name: "상의, 지금 기준 옷" }),
    ).toBeInTheDocument();
  });

  it("새 옷 등록은 입력을 비우고 다른 항목 ID로 저장한다", async () => {
    apiMocks.getGarment.mockResolvedValue(item("g1", "pants"));
    wardrobeMocks.getWardrobe.mockResolvedValue({
      items: [item("g1", "pants")],
      referenceItemId: "g1",
    });
    apiMocks.putGarment.mockResolvedValue(item("g2", "skirt"));
    renderScreen();
    await userEvent.click(await within(shelf()).findByRole("button", { name: /새 옷 등록/ }));
    expect(screen.getByRole("button", { name: "사진 선택" })).toBeInTheDocument();
    await choosePhoto();
    await userEvent.click(screen.getByRole("button", { name: "치마" }));
    await userEvent.click(screen.getByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(apiMocks.putGarment).toHaveBeenCalledTimes(1));
    const sent = apiMocks.putGarment.mock.calls[0]![0].itemId;
    expect(sent).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent).not.toBe("g1");
  });

  it("옷장 옷을 기준으로 고르고, 확인 후 한 벌만 삭제한다", async () => {
    apiMocks.getGarment.mockResolvedValue(item("g1", "pants"));
    wardrobeMocks.getWardrobe.mockResolvedValue({
      items: [item("g2", "top"), item("g1", "pants")],
      referenceItemId: "g1",
    });
    wardrobeMocks.selectReference.mockResolvedValue(item("g2", "top"));
    wardrobeMocks.deleteWardrobeItem.mockResolvedValue(undefined);
    renderScreen();
    const top = await within(shelf()).findByRole("listitem", { name: "상의" });
    expect(within(shelf()).getByRole("listitem", { name: "바지, 지금 기준 옷" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await userEvent.click(within(top).getByRole("button", { name: "기준으로" }));
    await waitFor(() => expect(wardrobeMocks.selectReference).toHaveBeenCalledWith("g2"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "상의" })).toHaveAttribute("aria-pressed", "true"),
    );

    await userEvent.click(within(top).getByRole("button", { name: "상의 삭제" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("이 옷의 사진과 정보만 삭제돼요");
    expect(wardrobeMocks.deleteWardrobeItem).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(wardrobeMocks.deleteWardrobeItem).toHaveBeenCalledWith("g2"));
    expect(wardrobeMocks.deleteWardrobeItem).toHaveBeenCalledTimes(1);
  });
});
