import { Checkbox } from "@/components/ui/checkbox";
import type { ConsentDocument } from "@/lib/auth-api";
import { requiredAccepted } from "@/lib/auth-consent";
export function ConsentFields({
  documents,
  values,
  onChange,
  disabled = false,
}: {
  documents: ConsentDocument[];
  values: Record<string, boolean>;
  onChange: (values: Record<string, boolean>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <label className="auth-check border-b border-border pb-5">
        <Checkbox
          checked={requiredAccepted(documents, values)}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({
              ...values,
              ...Object.fromEntries(
                documents.filter((d) => d.required).map((d) => [d.key, checked === true]),
              ),
            })
          }
        />
        필수 항목 모두 동의
      </label>
      {documents.map((d) => (
        <section key={`${d.key}:${d.version}`} className="auth-document">
          <label className="auth-check">
            <Checkbox
              checked={values[d.key] === true}
              disabled={disabled}
              onCheckedChange={(checked) => onChange({ ...values, [d.key]: checked === true })}
            />
            <span>
              <span className="text-muted-foreground text-xs">{d.required ? "필수" : "선택"}</span>{" "}
              {d.title}
            </span>
          </label>
          <details className="mt-3">
            <summary className="text-sm text-muted-foreground cursor-pointer">
              본문 펼쳐 보기
            </summary>
            <div className="auth-document-body">{d.body}</div>
            <p className="text-xs text-muted-foreground mt-3">
              시행일 {d.effectiveAt} · 버전 {d.version}
            </p>
          </details>
        </section>
      ))}
    </div>
  );
}
