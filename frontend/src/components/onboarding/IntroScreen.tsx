import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { INTRO_IMAGES } from "@/lib/site";
export function IntroScreen({ onStart }: { onStart: () => void }) {
  const [photo, setPhoto] = useState<(typeof INTRO_IMAGES)[number] | null>(null);
  useEffect(() => {
    setPhoto(INTRO_IMAGES[Math.random() < 0.5 ? 0 : 1]);
  }, []);
  return (
    <section className="intro-screen">
      {photo && <img className="intro-photo" src={photo.src} alt={photo.alt} />}
      <div className="intro-shade" aria-hidden="true" />
      <div className="intro-shade-top" aria-hidden="true" />
      <div className="intro-shade-bottom" aria-hidden="true" />
      <span className="intro-ai">AI 생성 이미지</span>
      <div className="intro-composition">
        <h1 aria-label="입고 싶은 가능성" className="intro-title">
          <span aria-hidden="true">입고 싶은</span>
          <span aria-hidden="true">가능성</span>
        </h1>
        <p className="intro-subtitle">
          좋아하는 스타일에서
          <br />
          나다운 코디까지
        </p>
        <div className="intro-actions">
          <p>
            좋아하는 스타일을 발견하고,
            <br />
            마음에 든 옷 한 벌을 나다운 코디로.
          </p>
          <Button onClick={onStart} className="intro-start">
            내 취향 찾기
          </Button>
        </div>
        <Link className="intro-privacy" to="/privacy">
          개인정보 처리방침
        </Link>
      </div>
    </section>
  );
}
