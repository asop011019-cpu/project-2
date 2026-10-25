import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { siteHead } from "@/lib/site";
export const Route = createFileRoute("/privacy")({
  head: () =>
    siteHead(
      "개인정보 처리방침 · 초안",
      "익명 세션과 취향 응답, 업로드 사진에 관한 개인정보 처리방침 초안입니다.",
      "/privacy",
    ),
  component: Privacy,
});
function Privacy() {
  const router = useRouter();
  return (
    <main className="privacy-page">
      <button
        type="button"
        className="back-button"
        aria-label="뒤로 가기"
        onClick={() => {
          if (router.history.canGoBack()) router.history.back();
          else void router.navigate({ to: "/" });
        }}
      >
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <Link to="/">← 처음 화면으로</Link>
      <p className="draft-label">초안 · 확정 전</p>
      <h1>개인정보 처리방침</h1>
      <p>
        아래 내용은 검토용 초안입니다. 운영 조건과 법적 근거를 확인하고 빈칸을 확정하기 전에는
        운영용 방침으로 사용하지 않습니다.
      </p>
      <p>
        운영자: <strong>[운영자명]</strong> · 시행일: <strong>[시행일]</strong>
      </p>
      <section>
        <h2>1. 수집 항목 및 수집 방법</h2>
        <p>
          익명 세션 쿠키, 스타일 응답(좋아요·별로·건너뛰기), 사진 선호 선택, 사용자가 업로드한 기준
          하의 사진을 서비스 이용 과정에서 처리합니다. 필수·선택 구분 및 수집의 법적 근거:{" "}
          <strong>[확인 필요]</strong>
        </p>
      </section>
      <section>
        <h2>2. 이용 목적</h2>
        <p>
          익명 이용 기록 복원, 스타일 취향 기록, 기준 하의 등록 및 코디 제공을 위해 사용합니다. 각
          목적과 실제 처리 범위는 운영 전 확정합니다.
        </p>
      </section>
      <section>
        <h2>3. 보유 및 이용 기간</h2>
        <p>
          세션 쿠키: <strong>[보관 기간]</strong> · 응답: <strong>[보관 기간]</strong> · 하의 사진:{" "}
          <strong>[보관 기간]</strong>. 법령상 보존 의무가 있는 경우 해당 근거와 기간:{" "}
          <strong>[확인 필요]</strong>.
        </p>
      </section>
      <section>
        <h2>4. 파기 절차 및 방법</h2>
        <p>
          목적 달성 또는 보관 기간 종료 후 파기합니다. 실제 전자파일 삭제 절차, 백업 및 로그 처리
          방법: <strong>[파기 절차·방법]</strong>.
        </p>
      </section>
      <section>
        <h2>5. 제3자 제공 및 처리 위탁</h2>
        <p>
          제3자 제공 없음(운영 전 사실 확인 필요). 저장·호스팅 등 처리 위탁 여부, 수탁자, 위탁 업무
          및 국외 이전 여부: <strong>[확인 필요]</strong>.
        </p>
      </section>
      <section>
        <h2>6. 이용자 권리 및 쿠키</h2>
        <p>
          열람·정정·삭제·처리정지 요청 절차: <strong>[요청 방법]</strong>. 쿠키 설정을 제한할 수
          있으나 익명 기록 복원이 제한될 수 있습니다. 실제 쿠키 이름과 만료 기간:{" "}
          <strong>[확인 필요]</strong>.
        </p>
      </section>
      <section>
        <h2>7. 안전성 확보 조치</h2>
        <p>
          접근 제한, 전송·저장 보호 및 내부 관리 조치: <strong>[실제 적용 조치 확인]</strong>.
        </p>
      </section>
      <section>
        <h2>8. 문의처</h2>
        <p>
          개인정보 담당: <strong>[운영자명 / 담당자]</strong> · 연락처: <strong>[연락처]</strong> ·
          이메일: <strong>[이메일]</strong>.
        </p>
      </section>
    </main>
  );
}
