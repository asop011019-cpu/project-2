/**
 * 기준 옷 속성 어휘 (garment-vocab-0.2, GAR-002 확정).
 * 이 목록 밖의 값은 서버에 보내지 않는다. 값은 모두 사용자가 직접 고른 것이며
 * 자동 추정·분석 결과를 표시하지 않는다.
 *
 * 화면 상태는 평탄한 키("color.base")로 다루고, 서버 전송 시 color.* 만
 * 중첩 객체(color: {base, …})로 조립한다. 답하지 않은 축은 보내지 않고,
 * "모름"은 값 unknown으로 저장한다.
 */

import type { GarmentType } from "./onboarding-api";

export const VOCABULARY_VERSION = "garment-vocab-0.2";
export const RAW_TEXT_MAX = 200;

/** 화면에서 다루는 속성 값. 단일 축은 string, 다중 축은 string[]. */
export type AttributeValues = Record<string, string | string[] | null | undefined>;

export interface AxisOption {
  value: string;
  label: string;
}

export interface AxisDef {
  key: string;
  label: string;
  /** 여러 개 선택 가능한 축 */
  multi: boolean;
  options: AxisOption[];
  /** 이 축을 보여 줄 종류 */
  types: readonly GarmentType[];
  /** 추가 표시 조건 (예: 데님 워싱은 소재감이 데님일 때만) */
  visibleWhen?: (values: AttributeValues) => boolean;
  /** 종류별로 먼저 보여 줄 값 제한. 값 자체는 그대로 보낸다. */
  displayValues?: Partial<Record<GarmentType, readonly string[]>>;
}

const ALL_TYPES: readonly GarmentType[] = ["top", "pants", "skirt", "outer"];

const opt = (value: string, label: string): AxisOption => ({ value, label });

export const AXES: readonly AxisDef[] = [
  {
    key: "color.base",
    label: "색",
    multi: false,
    types: ALL_TYPES,
    options: [
      opt("black", "검정"),
      opt("white", "흰색"),
      opt("ivory", "아이보리"),
      opt("beige", "베이지"),
      opt("khaki", "카키"),
      opt("olive", "올리브"),
      opt("brown", "브라운"),
      opt("grey", "회색"),
      opt("charcoal", "차콜"),
      opt("navy", "네이비"),
      opt("blue", "파랑"),
      opt("red", "빨강"),
      opt("pink", "분홍"),
      opt("green", "초록"),
      opt("yellow", "노랑"),
      opt("purple", "보라"),
      opt("other", "기타"),
    ],
  },
  {
    key: "color.tone",
    label: "명도",
    multi: false,
    types: ALL_TYPES,
    options: [opt("light", "밝은"), opt("mid", "중간"), opt("dark", "어두운")],
  },
  {
    key: "color.pattern",
    label: "무늬",
    multi: false,
    types: ALL_TYPES,
    options: [
      opt("solid", "무지"),
      opt("stripe", "스트라이프"),
      opt("pinstripe", "핀스트라이프"),
      opt("check", "체크"),
      opt("glen_check", "글렌체크"),
      opt("houndstooth", "하운드투스"),
      opt("herringbone", "헤링본"),
      opt("floral", "꽃무늬"),
      opt("dot", "도트"),
      opt("other", "기타"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "color.denimWash",
    label: "데님 워싱",
    multi: false,
    types: ALL_TYPES,
    visibleWhen: (values) => values["materialLook"] === "denim",
    options: [
      opt("raw_indigo", "생지(인디고)"),
      opt("mid_wash", "중청"),
      opt("light_wash", "연청"),
      opt("black", "흑청"),
      opt("grey", "그레이"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "materialLook",
    label: "소재감",
    multi: false,
    types: ALL_TYPES,
    options: [
      opt("denim", "데님"),
      opt("cotton_twill", "면 능직(치노 원단)"),
      opt("suiting", "수트 원단 느낌"),
      opt("corduroy", "코듀로이(골덴)"),
      opt("knit_jersey", "니트·저지"),
      opt("sweat", "스웨트(맨투맨 원단)"),
      opt("technical", "나일론·기능성"),
      opt("linen_like", "린넨 느낌"),
      opt("leather_like", "가죽 느낌"),
      opt("tweed", "트위드"),
      opt("satin_like", "새틴 느낌"),
      opt("oxford_cotton", "옥스퍼드·면 셔팅"),
      opt("suede_like", "스웨이드 느낌"),
      opt("canvas", "캔버스"),
      opt("fleece", "플리스"),
      opt("padded", "패딩·퀼팅"),
      opt("other", "기타"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "construction",
    label: "구조",
    multi: true,
    types: ["pants"],
    options: [
      opt("tailored_trouser", "트라우저형(슬랙스형)"),
      opt("five_pocket", "5포켓형(청바지형)"),
      opt("chino_style", "치노형"),
      opt("utility_cargo", "카고·유틸리티형"),
      opt("athletic", "트레이닝형"),
      opt("leggings", "레깅스"),
      opt("other", "기타"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "skirtStructure",
    label: "구조",
    multi: true,
    types: ["skirt"],
    options: [
      opt("pleated", "플리츠"),
      opt("wrap", "랩"),
      opt("gathered", "개더·셔링"),
      opt("tiered", "티어드"),
      opt("slit", "슬릿"),
      opt("button_front", "앞 단추"),
      opt("plain", "기본(구조 없음)"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "silhouette",
    label: "실루엣",
    multi: false,
    types: ["pants", "skirt"],
    displayValues: {
      pants: [
        "skinny",
        "slim",
        "tapered",
        "straight",
        "regular",
        "relaxed",
        "wide",
        "barrel",
        "bootcut_flare",
        "unknown",
      ],
      skirt: ["straight", "h_line", "a_line", "flare_skirt", "mermaid", "balloon", "unknown"],
    },
    options: [
      opt("skinny", "스키니"),
      opt("slim", "슬림"),
      opt("tapered", "테이퍼드"),
      opt("straight", "스트레이트(일자)"),
      opt("regular", "레귤러"),
      opt("relaxed", "릴랙스드·루즈"),
      opt("wide", "와이드"),
      opt("barrel", "배럴(커브)"),
      opt("bootcut_flare", "부츠컷·플레어"),
      opt("h_line", "H라인·펜슬"),
      opt("a_line", "A라인"),
      opt("flare_skirt", "플레어"),
      opt("mermaid", "머메이드"),
      opt("balloon", "벌룬"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "length",
    label: "기장",
    multi: false,
    types: ["pants", "skirt"],
    displayValues: {
      pants: ["full", "ankle", "cropped", "shorts_knee", "shorts_short", "unknown"],
      skirt: ["mini", "midi", "long", "unknown"],
    },
    options: [
      opt("full", "긴 기장"),
      opt("ankle", "앵클(9부)"),
      opt("cropped", "크롭(7~8부)"),
      opt("shorts_knee", "무릎 반바지"),
      opt("shorts_short", "짧은 반바지"),
      opt("mini", "미니"),
      opt("midi", "미디"),
      opt("long", "롱·맥시"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "topType",
    label: "종류",
    multi: false,
    types: ["top"],
    options: [
      opt("tshirt", "티셔츠"),
      opt("polo_pique", "피케·카라 티셔츠"),
      opt("knit_polo", "니트 폴로"),
      opt("shirt", "셔츠"),
      opt("blouse", "블라우스"),
      opt("knit_sweater", "니트·스웨터"),
      opt("sweatshirt", "맨투맨·스웨트"),
      opt("hoodie", "후드 티셔츠"),
      opt("knit_vest", "니트 베스트"),
      opt("sleeveless", "민소매"),
      opt("other", "기타"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "outerType",
    label: "종류",
    multi: false,
    types: ["outer"],
    options: [
      opt("blazer", "블레이저·수트 재킷"),
      opt("shirt_jacket", "셔츠 재킷"),
      opt("cardigan", "카디건"),
      opt("trucker", "트러커(데님) 재킷"),
      opt("work_safari", "사파리·헌팅·워크 재킷"),
      opt("blouson_ma1", "블루종·MA-1"),
      opt("coach_nylon", "나일론·코치 재킷"),
      opt("leather_rider", "레더·라이더스 재킷"),
      opt("fleece", "플리스"),
      opt("hood_zip", "후드 집업"),
      opt("vest", "베스트"),
      opt("coat_transitional", "환절기 코트(트렌치 등)"),
      opt("coat_winter", "겨울 코트(싱글·더블)"),
      opt("padding_light", "경량 패딩"),
      opt("padding_heavy", "숏·롱 패딩"),
      opt("other", "기타"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "neckline",
    label: "넥라인",
    multi: false,
    types: ["top", "outer"],
    options: [
      opt("crew", "라운드(크루)"),
      opt("v_neck", "브이넥"),
      opt("turtleneck", "터틀넥·모크넥"),
      opt("collar", "셔츠 칼라"),
      opt("polo_collar", "카라(폴로)"),
      opt("hood", "후드"),
      opt("boat", "보트넥"),
      opt("square", "스퀘어넥"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "sleeve",
    label: "소매",
    multi: false,
    types: ["top", "outer"],
    options: [
      opt("sleeveless", "민소매"),
      opt("short", "반소매"),
      opt("long", "긴소매"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "topFit",
    label: "핏",
    multi: false,
    types: ["top", "outer"],
    options: [
      opt("slim", "슬림"),
      opt("regular", "레귤러"),
      opt("relaxed", "릴랙스드·오버핏"),
      opt("unknown", "모름"),
    ],
  },
  {
    key: "topLength",
    label: "기장",
    multi: false,
    types: ["top", "outer"],
    options: [
      opt("crop", "크롭"),
      opt("regular", "기본"),
      opt("half", "하프"),
      opt("long", "롱"),
      opt("unknown", "모름"),
    ],
  },
];

const AXIS_BY_KEY = new Map(AXES.map((a) => [a.key, a]));

/** 종류에 관계없이 유지되는 공통 축 키. */
const COMMON_KEYS = new Set([
  "color.base",
  "color.tone",
  "color.pattern",
  "color.denimWash",
  "materialLook",
]);

/** 선택한 종류에서 보여 줄 축(공통 + 전용)을 정의 순서대로 돌려준다. */
export function axesForType(type: GarmentType): AxisDef[] {
  return AXES.filter((a) => a.types.includes(type));
}

/** 종류별 표시 값 제한과 표시 조건을 적용한 옵션 목록. */
export function visibleOptions(
  axis: AxisDef,
  type: GarmentType,
  values: AttributeValues,
): AxisOption[] {
  if (axis.visibleWhen && !axis.visibleWhen(values)) return [];
  const allowed = axis.displayValues?.[type];
  if (!allowed) return axis.options;
  const order = new Map(allowed.map((v, i) => [v, i]));
  return axis.options
    .filter((o) => order.has(o.value))
    .sort((a, b) => (order.get(a.value) ?? 0) - (order.get(b.value) ?? 0));
}

/** 서버 values(중첩 color 포함)를 화면용 평탄 키로 펼친다. */
export function flattenValues(serverValues: unknown): AttributeValues {
  const out: AttributeValues = {};
  if (!serverValues || typeof serverValues !== "object") return out;
  for (const [key, value] of Object.entries(serverValues as Record<string, unknown>)) {
    if (key === "color" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [sub, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof subValue === "string") out[`color.${sub}`] = subValue;
      }
    } else if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === "string");
    }
  }
  return out;
}

/** 종류가 바뀔 때 이전 종류 전용 선택을 지우고 공통 축만 남긴다. */
export function pruneForType(values: AttributeValues): AttributeValues {
  const out: AttributeValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (COMMON_KEYS.has(key) && value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

export interface AttributesBody {
  garmentType: GarmentType;
  values: Record<string, unknown>;
  rawText: string | null;
}

/**
 * 화면 상태를 서버에 보낼 body로 조립한다.
 * 답하지 않은 축·빈 배열은 빼고, color.* 만 중첩 객체로 만든다.
 */
export function buildAttributesBody(
  garmentType: GarmentType,
  values: AttributeValues,
  rawText: string,
): AttributesBody {
  const bodyValues: Record<string, unknown> = {};
  const color: Record<string, string> = {};

  for (const axis of axesForType(garmentType)) {
    const value = values[axis.key];
    if (axis.multi) {
      if (Array.isArray(value) && value.length > 0) bodyValues[axis.key] = value;
    } else if (typeof value === "string" && value !== "") {
      if (axis.key.startsWith("color.")) color[axis.key.slice("color.".length)] = value;
      else bodyValues[axis.key] = value;
    }
  }
  if (Object.keys(color).length > 0) bodyValues["color"] = color;

  const trimmed = rawText.trim();
  return { garmentType, values: bodyValues, rawText: trimmed === "" ? null : trimmed };
}

/** 어휘에 없는 키·값이 섞여 있어도 화면 상태는 정의된 축만 다룬다. */
export function isKnownAxisKey(key: string): boolean {
  return AXIS_BY_KEY.has(key);
}
