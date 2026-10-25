import { cn } from "@/lib/utils";

interface EditorialFrameProps {
  title: string;
  index?: string;
  ratio?: "tall" | "square" | "wide";
  image?: { src: string; alt: string } | null;
  className?: string;
}

const RATIO = {
  tall: "aspect-[3/4]",
  square: "aspect-square",
  wide: "aspect-[4/3]",
} as const;

/**
 * 승인된 스타일 사진이 없을 때 쓰는 지면 프레임. 임의 이미지를 채우지 않고
 * 스타일명 타이포그래피와 "스타일 사진 준비 중" 표기로 의도된 지면처럼 보이게 한다.
 * 실제 이미지가 API로 주어질 때만 이미지를 표시한다.
 */
export function EditorialFrame({
  title,
  index,
  ratio = "tall",
  image,
  className,
}: EditorialFrameProps) {
  return (
    <figure className={cn("relative overflow-hidden bg-secondary", RATIO[ratio], className)}>
      {image ? (
        <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-4 ring-1 ring-inset ring-border">
          <div className="flex items-start justify-between">
            {index && <span className="label-caps text-muted-foreground">{index}</span>}
            <span className="label-caps ml-auto text-muted-foreground">스타일 사진 준비 중</span>
          </div>
          <figcaption className="font-display text-3xl font-bold leading-[1.05] tracking-tight text-foreground/85 sm:text-4xl">
            {title}
          </figcaption>
        </div>
      )}
    </figure>
  );
}
