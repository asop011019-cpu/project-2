import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/onboarding-api";
import {
  authMessage,
  getMe,
  getPending,
  getConsentDocuments,
  signup,
  putConsent,
  logout,
  deleteAccount,
  startKakao,
  getRestorePending,
  restoreAccount,
} from "@/lib/auth-api";
import { safeReturnTo } from "@/lib/auth-routing";
import { clearAuthDrafts } from "@/lib/auth-drafts";
import { AuthShell } from "./AuthShell";
import { ConsentFields } from "./ConsentFields";
import { requiredAccepted } from "@/lib/auth-consent";

function move(path: string) {
  window.dispatchEvent(new CustomEvent("auth-navigation", { detail: safeReturnTo(path) }));
}
function useReturnTo() {
  const [target, setTarget] = useState("/");
  useEffect(() => {
    setTarget(safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")));
  }, []);
  return target;
}
function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="auth-error">
      {authMessage(error)}
    </p>
  ) : null;
}

export function LoginPage() {
  const returnTo = useReturnTo();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(new URLSearchParams(window.location.search).get("error"));
  }, []);
  return (
    <AuthShell title="카카오로 시작하기">
      <p className="text-muted-foreground mb-8">로그인하고 내 취향과 옷장을 이어가세요.</p>
      <ErrorNotice error={error} />
      <Button className="kakao-button w-full" onClick={() => startKakao(returnTo)}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.8 6.6l-1.1 4 4.7-2.8 1.6.1c5.5 0 10-3.5 10-7.9S17.5 3 12 3Z"
          />
        </svg>
        카카오로 시작하기
      </Button>
      <Link to="/privacy" className="block mt-8 text-sm text-muted-foreground underline">
        개인정보 처리방침
      </Link>
    </AuthShell>
  );
}

export function SignupPage() {
  const returnTo = useReturnTo();
  const query = useQuery({ queryKey: ["auth", "pending"], queryFn: getPending, retry: false });
  const [values, setValues] = useState<Record<string, boolean>>({});
  const mutation = useMutation({
    mutationFn: signup,
    onSuccess: (data) => move(data.returnTo),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CONSENT_VERSION_MISMATCH") {
        setValues({});
        void query.refetch();
      }
    },
  });
  const documents = query.data?.documents ?? [];
  const error = mutation.error ?? query.error;
  const expired =
    error instanceof ApiError && (error.status === 410 || error.code === "IDENTITY_ALREADY_LINKED");
  return (
    <AuthShell title="가입 동의">
      <ErrorNotice error={error} />
      {query.isPending ? (
        <p role="status">동의 문서를 불러오는 중이에요.</p>
      ) : (
        <ConsentFields
          documents={documents}
          values={values}
          onChange={setValues}
          disabled={mutation.isPending || expired}
        />
      )}
      {expired ? (
        <Button className="mt-8 w-full" onClick={() => startKakao(returnTo)}>
          다시 로그인
        </Button>
      ) : (
        <>
          <Button
            className="mt-8 w-full"
            disabled={
              !requiredAccepted(documents, values) || mutation.isPending || query.isFetching
            }
            onClick={() =>
              mutation.mutate(
                documents.map((d) => ({
                  key: d.key,
                  version: d.version,
                  granted: values[d.key] === true,
                })),
              )
            }
          >
            {mutation.isPending ? "가입 중…" : "동의하고 가입하기"}
          </Button>
          {query.isError && (
            <Button variant="outline" className="mt-3 w-full" onClick={() => void query.refetch()}>
              문서 다시 불러오기
            </Button>
          )}
        </>
      )}
    </AuthShell>
  );
}

export function ConsentUpdatePage() {
  const returnTo = useReturnTo();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: getMe, retry: false });
  const docs = useQuery({
    queryKey: ["auth", "documents"],
    queryFn: getConsentDocuments,
    retry: false,
  });
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, boolean>>({});
  const documents = (docs.data?.documents ?? []).filter(
    (d) => d.required && me.data?.consentUpdates.some((u) => u.key === d.key),
  );
  const mutation = useMutation({
    mutationFn: async () => {
      let latest = me.data;
      for (const d of documents) {
        latest = await putConsent({ key: d.key, version: d.version, granted: true });
        qc.setQueryData(["auth", "me"], latest);
      }
      return latest;
    },
    onSuccess: (data) => {
      qc.setQueryData(["auth", "me"], data);
      if (!data?.consentUpdates.length) move(returnTo);
      else {
        setValues({});
        void docs.refetch();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CONSENT_VERSION_MISMATCH") {
        setValues({});
        void docs.refetch();
        void me.refetch();
      }
    },
  });
  useEffect(() => {
    if (me.data && docs.data && !me.data.consentUpdates.length) move(returnTo);
  }, [me.data, docs.data, returnTo]);
  return (
    <AuthShell title="변경된 필수 동의">
      <ErrorNotice error={mutation.error ?? me.error ?? docs.error} />
      {me.isPending || docs.isPending ? (
        <p role="status">동의 문서를 불러오는 중이에요.</p>
      ) : (
        <ConsentFields
          documents={documents}
          values={values}
          onChange={setValues}
          disabled={mutation.isPending}
        />
      )}
      <Button
        className="mt-8 w-full"
        disabled={
          !requiredAccepted(documents, values) ||
          mutation.isPending ||
          docs.isFetching ||
          me.isFetching
        }
        onClick={() => mutation.mutate()}
      >
        동의하고 계속하기
      </Button>
      {(me.isError || docs.isError) && (
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={() => {
            void me.refetch();
            void docs.refetch();
          }}
        >
          다시 시도
        </Button>
      )}
    </AuthShell>
  );
}

export function AccountPage() {
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: getMe, retry: false });
  const docs = useQuery({
    queryKey: ["auth", "documents"],
    queryFn: getConsentDocuments,
    retry: false,
  });
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [estimatedDeadline, setEstimatedDeadline] = useState<string | null>(null);
  const [reauth, setReauth] = useState(false);
  useEffect(() => {
    setDeleteConfirmed(false);
    setEstimatedDeadline(
      deleteOpen ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    );
  }, [deleteOpen]);
  useEffect(() => {
    setDeleteOpen(new URLSearchParams(window.location.search).get("confirmDelete") === "1");
  }, []);
  useEffect(() => {
    if (me.data?.consentUpdates.length)
      move("/consent-update?returnTo=" + encodeURIComponent("/account" + window.location.search));
  }, [me.data]);
  const finish = (deleted: boolean) => {
    qc.clear();
    clearAuthDrafts();
    window.dispatchEvent(new CustomEvent("auth-finished", { detail: deleted }));
  };
  const out = useMutation({ mutationFn: logout, onSuccess: () => finish(false) });
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => finish(true),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "REAUTH_REQUIRED") {
        setDeleteOpen(false);
        setReauth(true);
      }
    },
  });
  const consent = useMutation({
    mutationFn: putConsent,
    onSuccess: (data) => qc.setQueryData(["auth", "me"], data),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "CONSENT_VERSION_MISMATCH") {
        void docs.refetch();
        void me.refetch();
      }
    },
  });
  const busy = out.isPending || remove.isPending || consent.isPending;
  const ai = docs.data?.documents.find((d) => d.key === "ai_analysis");
  return (
    <AuthShell title="내 계정" backToPrevious>
      <ErrorNotice error={out.error ?? remove.error ?? consent.error ?? me.error ?? docs.error} />
      {me.isPending ? (
        <p role="status">계정을 불러오는 중이에요.</p>
      ) : me.data ? (
        <>
          <section className="auth-section">
            <h2 className="font-bold mb-4">로그인 수단</h2>
            <p>카카오</p>
          </section>
          <section className="auth-section">
            <h2 className="font-bold mb-5">동의 현황</h2>
            {(docs.data?.documents ?? []).map((d) => (
              <div key={d.key} className="mb-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm">
                    {d.title}{" "}
                    <span className="text-muted-foreground">({d.required ? "필수" : "선택"})</span>
                  </span>
                  {d.key === "ai_analysis" ? (
                    <Switch
                      aria-label={d.title}
                      disabled={busy || !ai}
                      checked={me.data.user.consents[d.key]?.granted === true}
                      onCheckedChange={(granted) =>
                        consent.mutate({ key: d.key, version: d.version, granted })
                      }
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {me.data.user.consents[d.key]?.granted ? "동의함" : "미동의"}
                    </span>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">
                    본문 펼쳐 보기
                  </summary>
                  <div className="auth-document-body">{d.body}</div>
                </details>
              </div>
            ))}
          </section>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => out.mutate(false)}
            >
              로그아웃
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => out.mutate(true)}
            >
              모든 기기에서 로그아웃
            </Button>
            <Button
              variant="ghost"
              className="w-full text-destructive"
              disabled={busy}
              onClick={() => {
                setReauth(false);
                setDeleteOpen(true);
              }}
            >
              회원 탈퇴
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" onClick={() => void me.refetch()}>
          다시 시도
        </Button>
      )}
      {reauth && (
        <div className="mt-6">
          <p role="alert" className="mb-3">
            보안을 위해 카카오로 다시 로그인해 주세요.
          </p>
          <Button
            className="kakao-button w-full"
            onClick={() => startKakao("/account?confirmDelete=1", true)}
          >
            카카오로 다시 로그인
          </Button>
        </div>
      )}
      <AlertDialog open={deleteOpen && !!me.data} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain">
          <AlertDialogHeader>
            <AlertDialogTitle>정말 탈퇴하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left">
                <ul className="list-disc space-y-3 pl-5">
                  <li>탈퇴하면 바로 로그아웃되고 계정을 쓸 수 없어요.</li>
                  <li>
                    취향 기록과 내 옷장의 옷 사진·정보는 30일 동안 보관돼요. 그 안에 같은 카카오
                    계정으로 다시 로그인하면 새로 가입하는 것이 아니라 기존 계정을 그대로 복구할 수
                    있어요.
                  </li>
                  <li>
                    30일이 지나면 복구할 수 없어요. 보관한 정보는 순서대로 삭제되고, 삭제가 실패하면
                    자동으로 다시 시도해요.
                  </li>
                  <li>30일이 지난 뒤 다시 가입하면 이전 기록이 없는 새 계정이 만들어져요.</li>
                </ul>
                {estimatedDeadline && (
                  <p className="mt-4">예상 복구 마감: {formatKoreanDateTime(estimatedDeadline)}</p>
                )}
                <p className="mt-1 text-xs">
                  탈퇴를 누른 시각 기준 예상이에요. 확정된 마감은 다시 로그인했을 때 복구 화면에서
                  보여 드려요.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label
            htmlFor="delete-confirmation"
            className="flex items-start gap-3 text-sm cursor-pointer"
          >
            <Checkbox
              id="delete-confirmation"
              className="mt-0.5"
              checked={deleteConfirmed}
              disabled={busy}
              onCheckedChange={(checked) => setDeleteConfirmed(checked === true)}
            />
            <span>위 내용을 확인했고 탈퇴합니다</span>
          </label>
          <ErrorNotice error={remove.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || !deleteConfirmed}
              onClick={() => {
                if (deleteConfirmed && !busy) remove.mutate();
              }}
            >
              {remove.isPending ? "탈퇴 중…" : "탈퇴하기"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AuthShell>
  );
}

function formatKoreanDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function RestorePage() {
  const pending = useQuery({
    queryKey: ["auth", "restore"],
    queryFn: getRestorePending,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: restoreAccount,
    onSuccess: (data) => {
      toast.success("계정을 복구했어요");
      move(data.returnTo);
    },
  });
  const error = mutation.error ?? pending.error;
  const expired =
    error instanceof ApiError && (error.status === 410 || error.code === "RESTORE_EXPIRED");
  return (
    <AuthShell title="계정 복구">
      {expired ? (
        <>
          <p role="alert" className="auth-error">
            복구 확인 시간이 지났어요. 복구 화면은 로그인 후 10분 동안만 열려 있어요. 복구
            기간(30일) 안이라면 다시 로그인해서 복구할 수 있고, 기간이 지났다면 복구할 수 없어요.
          </p>
          <Button className="mt-8 w-full" onClick={() => move("/")}>
            처음으로
          </Button>
        </>
      ) : (
        <>
          <ErrorNotice error={error} />
          {pending.isPending ? (
            <p role="status">복구 정보를 불러오는 중이에요.</p>
          ) : pending.data ? (
            <p className="mb-8">
              탈퇴한 계정이에요. {formatKoreanDateTime(pending.data.deletionScheduledAt)}(한국
              시간)까지 기존 계정을 복구할 수 있어요. 이 시각이 지나면 복구할 수 없어요.
            </p>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => void pending.refetch()}>
              다시 시도
            </Button>
          )}
          {pending.data && (
            <div className="space-y-3">
              <Button
                className="w-full"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "복구 중…" : "탈퇴 취소하고 복구하기"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={mutation.isPending}
                onClick={() => move("/")}
              >
                복구하지 않기
              </Button>
            </div>
          )}
        </>
      )}
    </AuthShell>
  );
}
