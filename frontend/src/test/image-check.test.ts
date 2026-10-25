import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  checkImageFile,
  isAnimatedPng,
  isAnimatedWebP,
  sniffFormat,
} from "@/lib/image-check";

function bytes(...values: number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array(values);
}

function withAscii(prefix: number[], text: string, rest: number[] = []): Uint8Array<ArrayBuffer> {
  const codes = [...text].map((c) => c.charCodeAt(0));
  return new Uint8Array([...prefix, ...codes, ...rest]);
}

describe("sniffFormat", () => {
  it("JPEG 매직 바이트를 인식한다", () => {
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("jpeg");
  });

  it("PNG 매직 바이트를 인식한다", () => {
    expect(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
  });

  it("WebP RIFF 헤더를 인식한다", () => {
    const webp = withAscii([...bytes(0, 0, 0, 0)], "WEBP");
    const riff = withAscii([], "RIFF", [...webp]);
    expect(sniffFormat(riff)).toBe("webp");
  });

  it("HEIC ftyp 브랜드를 인식한다", () => {
    const heic = withAscii([0, 0, 0, 24], "ftyp", [...withAscii([], "heic")]);
    expect(sniffFormat(heic)).toBe("heic");
  });

  it("알 수 없는 형식은 unknown이다", () => {
    expect(sniffFormat(bytes(0x00, 0x01, 0x02, 0x03))).toBe("unknown");
  });
});

describe("애니메이션 판별", () => {
  it("WebP ANIM 청크를 찾는다", () => {
    expect(isAnimatedWebP(withAscii([], "RIFF", [...withAscii([], "ANIM")]))).toBe(true);
    expect(isAnimatedWebP(withAscii([], "RIFF", [...withAscii([], "VP8L")]))).toBe(false);
  });

  it("APNG acTL 청크를 찾는다", () => {
    expect(isAnimatedPng(withAscii([], "acTL"))).toBe(true);
    expect(isAnimatedPng(withAscii([], "IHDR"))).toBe(false);
  });
});

describe("checkImageFile", () => {
  it("10MiB를 넘으면 size 사유로 거부한다", async () => {
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    const result = await checkImageFile(big);
    expect(result).toEqual({ ok: false, reason: "size" });
  });

  it("HEIC 파일은 heic 사유로 거부한다", async () => {
    const header = withAscii([0, 0, 0, 24], "ftyp", [...withAscii([], "heic")]);
    const file = new File([header], "photo.heic", { type: "image/heic" });
    const result = await checkImageFile(file);
    expect(result).toEqual({ ok: false, reason: "heic" });
  });

  it("알 수 없는 형식은 format 사유로 거부한다", async () => {
    const file = new File([bytes(1, 2, 3, 4, 5)], "note.txt", { type: "text/plain" });
    const result = await checkImageFile(file);
    expect(result).toEqual({ ok: false, reason: "format" });
  });
});
