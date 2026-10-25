/**
 * 사진 파일 클라이언트 검사 (보조 검사 — 서버가 최종 판정).
 *
 * 규칙: JPEG/PNG/WebP만 허용, 최대 10MiB, 최대 40M pixels,
 * HEIC와 애니메이션(WebP ANIM, APNG acTL) 미지원.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

export type SniffedFormat = "jpeg" | "png" | "webp" | "heic" | "unknown";

export type ImageCheckFailure = "heic" | "format" | "size" | "decode" | "pixels" | "animated";

export type ImageCheckResult =
  { ok: true; width: number; height: number } | { ok: false; reason: ImageCheckFailure };

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === undefined) break;
    out += String.fromCharCode(byte);
  }
  return out;
}

/** 매직 바이트로 실제 형식을 판별한다 (MIME 문자열은 신뢰하지 않음). */
export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }
  return "unknown";
}

function containsFourCC(bytes: Uint8Array, code: string): boolean {
  const target = [code.charCodeAt(0), code.charCodeAt(1), code.charCodeAt(2), code.charCodeAt(3)];
  outer: for (let i = 0; i + 4 <= bytes.length; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** WebP ANIM 청크 존재 여부 (애니메이션 WebP). */
export function isAnimatedWebP(bytes: Uint8Array): boolean {
  return containsFourCC(bytes, "ANIM");
}

/** APNG acTL 청크 존재 여부 (애니메이션 PNG). */
export function isAnimatedPng(bytes: Uint8Array): boolean {
  return containsFourCC(bytes, "acTL");
}

async function decodeDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      return null;
    }
  }
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const SNIFF_SLICE_BYTES = 256 * 1024;

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  // 구형 환경 폴백
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 파일을 검사한다. 형식/용량/HEIC/애니메이션/디코드/픽셀 수 순서로 확인하고
 * 첫 실패 사유를 돌려준다.
 */
export async function checkImageFile(file: File): Promise<ImageCheckResult> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "size" };
  }
  const head = await blobToBytes(file.slice(0, SNIFF_SLICE_BYTES));
  const format = sniffFormat(head);
  if (format === "heic") {
    return { ok: false, reason: "heic" };
  }
  if (format === "unknown") {
    return { ok: false, reason: "format" };
  }
  if (format === "webp" && isAnimatedWebP(head)) {
    return { ok: false, reason: "animated" };
  }
  if (format === "png" && isAnimatedPng(head)) {
    return { ok: false, reason: "animated" };
  }
  const dims = await decodeDimensions(file);
  if (!dims) {
    return { ok: false, reason: "decode" };
  }
  if (dims.width * dims.height > MAX_IMAGE_PIXELS) {
    return { ok: false, reason: "pixels" };
  }
  return { ok: true, ...dims };
}

export function photoErrorMessage(reason: ImageCheckFailure): string {
  switch (reason) {
    case "heic":
      return "아이폰 HEIC 사진은 아직 지원하지 않아요. 설정 > 카메라 > 포맷 > '높은 호환성'으로 찍거나 JPG로 저장해 주세요.";
    case "size":
      return "10MB 이하 사진만 올릴 수 있어요.";
    case "decode":
      return "사진을 열 수 없어요. 다른 사진을 골라 주세요.";
    case "format":
      return "JPEG, PNG, WebP 사진만 올릴 수 있어요.";
    case "pixels":
      return "사진이 너무 커요. 4천만 화소 이하 사진만 올릴 수 있어요.";
    case "animated":
      return "움직이는 이미지는 지원하지 않아요. 일반 사진을 골라 주세요.";
  }
}
