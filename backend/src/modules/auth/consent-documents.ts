import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface ConsentDocument {
  key: string;
  version: number;
  required: boolean;
  title: string;
  body: string;
  effectiveAt: string;
}

// Development drafts only: not legally reviewed, operator details and the AI provider are blank.
// A published (key, version) body must never change; publish a new version instead.
// Titles carry no required/optional marker: the UI shows that from `required`.
const DRAFT =
  "[개발용 초안 · 법률 검토 전 · 운영 사용 금지]\n운영자: [미정] / 개인정보 보호책임자: [미정] / 연락처: [미정]\n\n";
export const CONSENT_DOCUMENTS: readonly ConsentDocument[] = [
  {
    key: "terms",
    version: 1,
    required: true,
    title: "서비스 이용약관",
    body: `${DRAFT}이 서비스는 취향을 기록하고 등록한 하의를 기준으로 코디를 준비하는 서비스입니다. 이용 조건, 계정 관리, 서비스 변경·중단, 책임 범위에 관한 조항은 법률 검토 후 확정됩니다.`,
    effectiveAt: "2026-10-01T00:00:00.000Z",
  },
  {
    key: "privacy_required",
    version: 1,
    required: true,
    title: "개인정보 수집·이용 동의",
    body: `${DRAFT}수집 항목: 로그인 수단의 회원 식별자(카카오 회원번호), 스타일 취향 응답, 등록한 하의 사진과 종류·브랜드·제품명·구매 링크.\n이용 목적: 회원 식별, 취향 기록과 복원, 하의 기준 코디 제공.\n보관 기간: 회원 탈퇴 시까지. 탈퇴하면 지체 없이 삭제합니다(법령상 보관 의무가 있는 정보는 예외).\n동의를 거부할 수 있으나, 거부하면 서비스를 이용할 수 없습니다.`,
    effectiveAt: "2026-10-01T00:00:00.000Z",
  },
  {
    // v2 (2026-10-27 user decision): 30-day restorable grace after withdrawal.
    key: "privacy_required",
    version: 2,
    required: true,
    title: "개인정보 수집·이용 동의",
    body: `${DRAFT}수집 항목: 로그인 수단의 회원 식별자(카카오 회원번호), 스타일 취향 응답, 등록한 하의 사진과 종류·브랜드·제품명·구매 링크.\n이용 목적: 회원 식별, 취향 기록과 복원, 하의 기준 코디 제공.\n보관 기간: 회원 탈퇴 시까지. 탈퇴하면 계정은 바로 이용할 수 없고, 정보는 30일 동안 보관하며 그 안에 다시 로그인하면 계정을 복구할 수 있습니다. 30일이 지나면 지체 없이 삭제합니다(법령상 보관 의무가 있는 정보는 예외).\n동의를 거부할 수 있으나, 거부하면 서비스를 이용할 수 없습니다.`,
    effectiveAt: "2026-10-27T00:00:00.000Z",
  },
  {
    key: "ai_analysis",
    version: 1,
    required: false,
    title: "AI 사진 분석을 위한 사진 전송 동의",
    body: `${DRAFT}등록한 하의 사진을 AI 분석 공급자 [미정]에 보내 종류·색상·실루엣·소재감을 추정합니다. 국외 이전 여부·국가·업체: [미정]. 보관 기간: [미정].\n공급자가 정해지기 전에는 사진을 외부로 보내지 않습니다. 동의하지 않아도 사진과 정보를 직접 입력해 서비스를 이용할 수 있습니다.`,
    effectiveAt: "2026-10-01T00:00:00.000Z",
  },
];

export const bodyHash = (body: string) =>
  createHash("sha256").update(body).digest("hex");

/** Inserts missing documents and refuses to start if a published version was edited. */
export function syncConsentDocuments(
  db: DatabaseSync,
  documents: readonly ConsentDocument[] = CONSENT_DOCUMENTS,
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const d of documents) {
      const hash = bodyHash(d.body);
      const existing = db
        .prepare(
          "SELECT body_sha256 AS hash, title FROM consent_documents WHERE key=? AND version=?",
        )
        .get(d.key, d.version) as { hash: string; title: string } | undefined;
      if (existing && existing.hash !== hash)
        throw new Error(
          `Consent document ${d.key} v${d.version} changed after publication; add a new version instead.`,
        );
      // A title is display text only, so a corrected title may update the same version.
      if (existing && existing.title !== d.title)
        db.prepare(
          "UPDATE consent_documents SET title=? WHERE key=? AND version=?",
        ).run(d.title, d.key, d.version);
      if (!existing)
        db.prepare("INSERT INTO consent_documents VALUES(?,?,?,?,?,?,?)").run(
          d.key,
          d.version,
          d.required ? 1 : 0,
          d.title,
          d.body,
          hash,
          d.effectiveAt,
        );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
