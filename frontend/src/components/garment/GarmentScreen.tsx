import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AccountLink } from "@/components/auth/AuthShell";
import { readAuthDraft, writeAuthDraft } from "@/lib/auth-drafts";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  deleteGarment,
  ensureSession,
  garmentImageSrc,
  getGarment,
  putGarment,
  putGarmentAttributes,
  resetSession,
  type Garment,
  type GarmentMetadata,
  type GarmentType,
} from "@/lib/onboarding-api";
import { checkImageFile, photoErrorMessage } from "@/lib/image-check";
import { buildMetadata, normalizeOptional, type FieldErrors } from "@/lib/garment-form";
import {
  buildAttributesBody,
  flattenValues,
  pruneForType,
  type AttributeValues,
  type AttributesBody,
  type AxisDef,
} from "@/lib/garment-attributes";
import { GarmentPhoto } from "./GarmentPhoto";
import { GarmentForm } from "./GarmentForm";
import { GarmentAttributes } from "./GarmentAttributes";
import { GarmentSheet } from "./GarmentSheet";
import { ChevronRight } from "lucide-react";

const RESTORE_QUERY_KEY = ["onboarding", "garment"] as const;

interface ActionError {
  kind: "save" | "delete";
  error: ApiError;
}

function messageForApiError(e: ApiError): string {
  if (e.code === "NETWORK_ERROR") {
    return "서버에 연결할 수 없어요. 네트워크를 확인한 뒤 다시 시도해 주세요.";
  }
  if (e.status === 400 && e.message) return e.message;
  if (e.status === 403) return "요청 출처를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.";
  if (e.status === 413)
    return e.message || "사진 용량이 너무 커요. 10MB 이하 사진만 올릴 수 있어요.";
  if (e.status === 415)
    return e.message || "지원하지 않는 사진 형식이에요. JPEG, PNG, WebP만 올릴 수 있어요.";
  if (e.status >= 500) return "저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
  return e.message || "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}

/** 400 issues의 path를 화면 필드에 배정한다. */
function applyIssues(
  error: ApiError,
  setFieldErrors: (e: FieldErrors) => void,
  setPhotoError: (m: string) => void,
) {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues ?? []) {
    const path = String(issue.path ?? "");
    const message = typeof issue.message === "string" ? issue.message : error.message;
    if (!message) continue;
    if (path.includes("image")) {
      setPhotoError(message);
    } else if (path.includes("brand")) {
      fieldErrors.brand = message;
    } else if (path.includes("productName")) {
      fieldErrors.productName = message;
    } else if (path.includes("purchaseUrl")) {
      fieldErrors.purchaseUrl = message;
    } else if (path.includes("garmentType")) {
      fieldErrors.garmentType = message;
    }
  }
  if (Object.keys(fieldErrors).length > 0) setFieldErrors(fieldErrors);
}

export function GarmentScreen({
  authReady = true,
  preserveDraft = false,
}: {
  authReady?: boolean;
  preserveDraft?: boolean;
}) {
  const draft = useRef(
    preserveDraft
      ? readAuthDraft<{
          localFile: File | null;
          garmentType: GarmentType | null;
          brand: string;
          productName: string;
          purchaseUrl: string;
          attrValues: AttributeValues;
          rawText: string;
        }>("garment")
      : undefined,
  ).current;
  const queryClient = useQueryClient();

  const [saved, setSaved] = useState<Garment | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [garmentType, setGarmentType] = useState<GarmentType | null>(null);
  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [actionError, setActionError] = useState<ActionError | null>(null);
  /** 옷 정보 확인 영역의 선택값·직접 적기 (실패해도 지우지 않는다) */
  const [attrValues, setAttrValues] = useState<AttributeValues>({});
  const [rawText, setRawText] = useState("");
  const [attrError, setAttrError] = useState<string | null>(null);
  const [attrNotice, setAttrNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  /** 서버 저장 사진 로드 실패(404·연결 실패) 여부 */
  const [imageFailed, setImageFailed] = useState(false);
  /** 사진 재시도 시 캐시를 우회하기 위한 시퀀스 */
  const [imageRetrySeq, setImageRetrySeq] = useState(0);

  /** 사용자가 화면을 건드렸는지. 늦게 도착한 복원 응답이 입력을 덮지 못하게 한다. */
  const touchedRef = useRef(false);
  /** 사진 읽기 경쟁 방지용 시퀀스 */
  const readSeqRef = useRef(0);
  const previewRef = useRef<string | null>(null);

  const touch = () => {
    touchedRef.current = true;
  };

  const setPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  };

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);
  useEffect(() => {
    if (!draft) return;
    touchedRef.current = true;
    setLocalFile(draft.localFile);
    if (draft.localFile) setPreview(URL.createObjectURL(draft.localFile));
    setGarmentType(draft.garmentType);
    setBrand(draft.brand);
    setProductName(draft.productName);
    setPurchaseUrl(draft.purchaseUrl);
    setAttrValues(draft.attrValues ?? {});
    setRawText(draft.rawText ?? "");
  }, [draft]);
  useEffect(() => {
    if (preserveDraft && touchedRef.current)
      writeAuthDraft("garment", {
        localFile,
        garmentType,
        brand,
        productName,
        purchaseUrl,
        attrValues,
        rawText,
      });
  }, [localFile, garmentType, brand, productName, purchaseUrl, attrValues, rawText, preserveDraft]);

  const restoreQuery = useQuery({
    queryKey: RESTORE_QUERY_KEY,
    retry: false,
    staleTime: Infinity,
    enabled: authReady,
    queryFn: async () => {
      await ensureSession();
      return getGarment();
    },
  });

  // 복원 응답 적용 — 사용자가 이미 수정을 시작했으면 덮어쓰지 않는다
  useEffect(() => {
    if (restoreQuery.data === undefined) return;
    if (touchedRef.current) return;
    const g = restoreQuery.data;
    setSaved(g);
    setImageFailed(false);
    if (g) {
      setGarmentType(g.garmentType);
      setBrand(g.brand ?? "");
      setProductName(g.productName ?? "");
      setPurchaseUrl(g.purchaseUrl ?? "");
      setAttrValues(g.attributes ? flattenValues(g.attributes.values) : {});
      setRawText(g.attributes?.rawText ?? "");
    }
  }, [restoreQuery.data]);

  // 복원 단계의 401도 자동 초기화하지 않고 명시적 선택을 받는다
  useEffect(() => {
    if (
      restoreQuery.error instanceof ApiError &&
      restoreQuery.error.status === 401 &&
      restoreQuery.error.code === "SESSION_REQUIRED"
    ) {
      setSessionExpired(true);
    }
  }, [restoreQuery.error]);

  useEffect(() => {
    if (fieldErrors.brand || fieldErrors.productName || fieldErrors.purchaseUrl) {
      setAdditionalOpen(true);
    }
  }, [fieldErrors]);

  const clearAll = () => {
    setAdditionalOpen(false);
    setAttributesOpen(false);
    setSaved(null);
    setLocalFile(null);
    setPreview(null);
    setGarmentType(null);
    setBrand("");
    setProductName("");
    setPurchaseUrl("");
    setPhotoError(null);
    setFieldErrors({});
    setActionError(null);
    setAttrValues({});
    setRawText("");
    setAttrError(null);
    setAttrNotice(null);
    setImageFailed(false);
    setImageRetrySeq(0);
  };

  const handleFile = async (file: File) => {
    touch();
    const seq = ++readSeqRef.current;
    setReading(true);
    setPhotoError(null);
    try {
      const result = await checkImageFile(file);
      if (seq !== readSeqRef.current) return; // 더 새로운 선택이 있으면 무시
      if (!result.ok) {
        setPhotoError(photoErrorMessage(result.reason));
        return;
      }
      setLocalFile(file);
      setPreview(URL.createObjectURL(file));
      setActionError(null);
      setImageFailed(false);
    } finally {
      if (seq === readSeqRef.current) setReading(false);
    }
  };

  const handleApiFailure = (kind: ActionError["kind"], e: unknown) => {
    if (
      e instanceof ApiError &&
      (e.code === "AUTH_REQUIRED" || e.code === "CONSENT_UPDATE_REQUIRED")
    )
      return;
    if (e instanceof ApiError && e.status === 401) {
      // 입력·선택 파일은 그대로 두고, 자동 재생성 없이 명시적 선택을 받는다
      setSessionExpired(true);
      return;
    }
    if (e instanceof ApiError && e.status === 400) {
      applyIssues(e, setFieldErrors, setPhotoError);
    }
    setActionError({
      kind,
      error: e instanceof ApiError ? e : new ApiError({ status: 0, code: "UNKNOWN", message: "" }),
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (input: { metadata: GarmentMetadata; image: File | null }) => {
      // 진행 중인 복원 재조회를 취소해 늦은 GET이 성공 결과를 이전 값으로 덮지 않게 한다
      await queryClient.cancelQueries({ queryKey: RESTORE_QUERY_KEY });
      return putGarment(input.metadata, input.image ?? undefined);
    },
    onSuccess: (g) => {
      // 로컬 상태와 복원 캐시를 함께 갱신해 재마운트 시 최신 정보가 복원되게 한다
      queryClient.setQueryData(RESTORE_QUERY_KEY, g);
      setSaved(g);
      setLocalFile(null);
      setPreview(null);
      setGarmentType(g.garmentType);
      setBrand(g.brand ?? "");
      setProductName(g.productName ?? "");
      setPurchaseUrl(g.purchaseUrl ?? "");
      // 종류·사진 변경으로 서버가 남긴 속성(공통 축만)과 확인 필요 표시를 그대로 반영한다
      setAttrValues(g.attributes ? flattenValues(g.attributes.values) : {});
      setRawText(g.attributes?.rawText ?? "");
      setAttrError(null);
      setAttrNotice(null);
      setPhotoError(null);
      setFieldErrors({});
      setActionError(null);
      setImageFailed(false);
      toast.success("사진과 정보가 저장되었어요");
    },
    onError: (e) => handleApiFailure("save", e),
  });

  const attributesMutation = useMutation({
    mutationFn: async (body: AttributesBody) => {
      await queryClient.cancelQueries({ queryKey: RESTORE_QUERY_KEY });
      return putGarmentAttributes(body);
    },
    onSuccess: (g) => {
      queryClient.setQueryData(RESTORE_QUERY_KEY, g);
      setSaved(g);
      setAttrValues(g.attributes ? flattenValues(g.attributes.values) : {});
      setRawText(g.attributes?.rawText ?? "");
      setAttrError(null);
      setAttrNotice(null);
      toast.success("저장했어요");
      setAttributesOpen(false);
    },
    onError: async (e) => {
      // 입력한 선택값과 글은 어떤 실패에도 지우지 않는다
      if (
        e instanceof ApiError &&
        (e.code === "AUTH_REQUIRED" || e.code === "CONSENT_UPDATE_REQUIRED")
      ) {
        setAttrError("로그인 또는 동의 확인이 필요해요. 입력한 내용은 그대로 남아 있어요.");
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        setAttrError("세션이 만료됐거나 복원하지 못했어요. 입력한 내용은 그대로 남아 있습니다.");
        setSessionExpired(true);
        return;
      }
      if (e instanceof ApiError && e.status === 409 && e.code === "GARMENT_TYPE_CHANGED") {
        // 종류가 바뀐 상태라 저장된 정보를 다시 불러오고 안내만 한다 (입력은 유지)
        const fresh = await restoreQuery.refetch();
        if (fresh.data !== undefined) setSaved(fresh.data);
        setAttrNotice(
          "옷 종류가 바뀌었어요. 저장된 정보를 다시 불러왔으니 확인 후 다시 저장해 주세요.",
        );
        return;
      }
      if (e instanceof ApiError && e.status === 400) {
        const issue = e.issues?.find((i) => typeof i.message === "string" && i.message);
        setAttrError(issue?.message ?? e.message ?? "입력한 정보를 확인해 주세요.");
        return;
      }
      setAttrError(
        messageForApiError(
          e instanceof ApiError ? e : new ApiError({ status: 0, code: "UNKNOWN", message: "" }),
        ),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await queryClient.cancelQueries({ queryKey: RESTORE_QUERY_KEY });
      return deleteGarment();
    },
    onSuccess: () => {
      // 복원 캐시도 비워 재마운트 시 삭제된 하의가 다시 나타나지 않게 한다
      queryClient.setQueryData(RESTORE_QUERY_KEY, null);
      setDeleteOpen(false);
      clearAll();
      toast.success("등록한 옷을 삭제했어요");
    },
    onError: (e) => {
      setDeleteOpen(false);
      handleApiFailure("delete", e);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetSession,
    onSuccess: () => {
      setSessionExpired(false);
      setResetOpen(false);
      clearAll();
      touchedRef.current = false;
      void queryClient.resetQueries({ queryKey: RESTORE_QUERY_KEY });
    },
    onError: () => {
      setResetOpen(false);
      toast.error("세션을 다시 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    },
  });

  const restoring = authReady && restoreQuery.isPending && !touchedRef.current;
  const restoreFailed =
    restoreQuery.isError &&
    !sessionExpired &&
    !(restoreQuery.error instanceof ApiError && restoreQuery.error.status === 401);

  const dirty =
    localFile !== null ||
    garmentType !== (saved?.garmentType ?? null) ||
    normalizeOptional(brand) !== (saved?.brand ?? null) ||
    normalizeOptional(productName) !== (saved?.productName ?? null) ||
    normalizeOptional(purchaseUrl) !== (saved?.purchaseUrl ?? null);

  /** 진행 중인 변경 요청이 있으면 입력·저장·삭제·세션초기화를 모두 잠근다 */
  const actionPending =
    saveMutation.isPending || deleteMutation.isPending || resetMutation.isPending;
  const formDisabled = actionPending || sessionExpired || restoring;
  const canSave =
    !formDisabled &&
    !reading &&
    (localFile !== null || saved !== null) &&
    garmentType !== null &&
    dirty;

  const handleSave = () => {
    // 재시도 버튼 등 어떤 경로로 들어와도 동일한 조건을 적용한다
    if (!canSave) return;
    const built = buildMetadata({ garmentType, brand, productName, purchaseUrl });
    if ("fieldErrors" in built) {
      setFieldErrors(built.fieldErrors);
      return;
    }
    setFieldErrors({});
    setActionError(null);
    saveMutation.mutate({ metadata: built.metadata, image: localFile });
  };

  const handleAttrToggle = (axis: AxisDef, value: string) => {
    touch();
    setAttrError(null);
    setAttrNotice(null);
    setAttrValues((prev) => {
      const next = { ...prev };
      if (axis.multi) {
        const current = Array.isArray(prev[axis.key]) ? (prev[axis.key] as string[]) : [];
        const toggled = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        if (toggled.length === 0) delete next[axis.key];
        else next[axis.key] = toggled;
      } else {
        // 한 개 축은 다시 누르면 선택 해제
        if (prev[axis.key] === value) delete next[axis.key];
        else next[axis.key] = value;
      }
      return next;
    });
  };

  const savedAttrBody = saved
    ? JSON.stringify(
        buildAttributesBody(
          saved.garmentType,
          saved.attributes ? flattenValues(saved.attributes.values) : {},
          saved.attributes?.rawText ?? "",
        ),
      )
    : null;
  const currentAttrBody = garmentType
    ? JSON.stringify(buildAttributesBody(garmentType, attrValues, rawText))
    : null;
  const attrDirty = savedAttrBody !== currentAttrBody;
  const confirmPending =
    saved?.attributes?.needsConfirmation === true && garmentType === saved.garmentType;
  const canSaveAttributes =
    saved !== null &&
    garmentType !== null &&
    (attrDirty || confirmPending) &&
    !formDisabled &&
    !reading;

  const additionalHasError = Boolean(
    fieldErrors.brand || fieldErrors.productName || fieldErrors.purchaseUrl,
  );
  const additionalSummary = [
    [brand, "브랜드"],
    [productName, "제품명"],
    [purchaseUrl, "구매처 링크"],
  ]
    .filter(([value]) => value?.trim())
    .map(([, label]) => label)
    .join("·");
  const additionalDirty =
    normalizeOptional(brand) !== (saved?.brand ?? null) ||
    normalizeOptional(productName) !== (saved?.productName ?? null) ||
    normalizeOptional(purchaseUrl) !== (saved?.purchaseUrl ?? null);
  const selectedCount = Object.values(attrValues).filter((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  ).length;

  const handleAttributesSave = () => {
    if (!canSaveAttributes || garmentType === null) return;
    setAttrError(null);
    setAttrNotice(null);
    attributesMutation.mutate(buildAttributesBody(garmentType, attrValues, rawText));
  };

  const handleDelete = () => {
    if (actionPending || sessionExpired || restoring) return;
    deleteMutation.mutate();
  };

  const handleReset = () => {
    if (actionPending) return;
    resetMutation.mutate();
  };

  const savedImageUrl = saved ? garmentImageSrc(saved) : null;
  const imageUrl =
    previewUrl ??
    (savedImageUrl && imageRetrySeq > 0 ? `${savedImageUrl}&r=${imageRetrySeq}` : savedImageUrl);

  const handleImageError = () => {
    // 로컬 미리보기는 브라우저가 방금 만든 objectURL이라 실패 처리 대상이 아니다
    if (previewUrl === null && savedImageUrl !== null) setImageFailed(true);
  };

  const handleImageRetry = () => {
    setImageFailed(false);
    setImageRetrySeq((n) => n + 1);
  };

  return (
    <main className="relative min-h-screen overflow-x-clip bg-background">
      {/* 정적인 상단 글로우 — 지속 애니메이션 없이 깊이만 준다 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-[1200px] px-5 pb-36 pt-9 lg:px-10 lg:pb-16 lg:pt-14">
        <header className="animate-rise">
          <div className="flex justify-end">
            <AccountLink />
          </div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            NEXT · 기준 옷
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-foreground lg:text-6xl">
            코디의 기준이 될
            <br />옷 한 벌
          </h1>
          <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-muted-foreground lg:text-base">
            이 옷을 기준으로 어울리는 코디를 준비해 드릴게요. 사진 한 장과 종류만 있으면 됩니다.
          </p>
        </header>

        {restoreFailed && (
          <div
            role="alert"
            className="animate-rise mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border"
          >
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
              서버에 연결할 수 없어 저장된 내용을 불러오지 못했어요. 사진 선택과 정보 입력은 할 수
              있고, 입력한 내용은 유지됩니다.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="tap-feedback h-10 rounded-full border-input bg-transparent px-4"
              onClick={() => void restoreQuery.refetch()}
            >
              다시 시도
            </Button>
          </div>
        )}

        {sessionExpired && (
          <div
            role="alert"
            className="animate-rise mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-destructive/40"
          >
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive"
                aria-hidden="true"
              />
              세션이 만료됐거나 복원하지 못했어요. 입력한 내용은 그대로 남아 있습니다.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="tap-feedback h-10 rounded-full border-input bg-transparent px-4"
              onClick={() => setResetOpen(true)}
            >
              새로 시작
            </Button>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-8 lg:mt-12 lg:grid lg:grid-cols-12 lg:gap-12">
          <section className="animate-rise lg:order-2 lg:col-span-7" aria-label="기준 옷 사진">
            <div className="lg:sticky lg:top-10">
              <GarmentPhoto
                restoring={restoring}
                reading={reading}
                imageUrl={imageUrl}
                isLocalPreview={previewUrl !== null}
                imageFailed={imageFailed}
                error={photoError}
                disabled={formDisabled}
                onFile={handleFile}
                onImageError={handleImageError}
                onImageRetry={handleImageRetry}
                onClearLocal={() => {
                  setLocalFile(null);
                  setPreview(null);
                  setPhotoError(null);
                }}
                onDeleteSaved={() => setDeleteOpen(true)}
              />
            </div>
          </section>

          <section className="animate-rise-late lg:order-1 lg:col-span-5" aria-label="옷 정보">
            <GarmentForm
              section="type"
              garmentType={garmentType}
              brand={brand}
              productName={productName}
              purchaseUrl={purchaseUrl}
              fieldErrors={fieldErrors}
              disabled={formDisabled}
              onGarmentType={(v) => {
                touch();
                setGarmentType(v);
                // 이전 종류 전용 선택은 지우고 공통(색·소재감)만 남긴다
                setAttrValues((prev) => pruneForType(prev));
              }}
              onBrand={(v) => {
                touch();
                setBrand(v);
              }}
              onProductName={(v) => {
                touch();
                setProductName(v);
              }}
              onPurchaseUrl={(v) => {
                touch();
                setPurchaseUrl(v);
              }}
            />
            <div className="mt-6 flex flex-col border-t border-border">
              <Button
                variant="ghost"
                aria-label="추가 정보 입력 (선택)"
                className="h-auto justify-between whitespace-normal rounded-none border-b border-border px-0 py-4 text-left"
                onClick={() => setAdditionalOpen(true)}
              >
                <span className="min-w-0">
                  <span className="block font-bold">추가 정보 입력 (선택)</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {additionalSummary ? `${additionalSummary} 입력됨` : "아직 입력하지 않음"}
                  </span>
                  {additionalDirty && (
                    <span className="mt-1 block text-xs text-primary">저장 안 된 변경 있음</span>
                  )}
                  {additionalHasError && (
                    <span className="mt-1 block text-xs text-destructive">
                      입력한 정보를 확인해 주세요
                    </span>
                  )}
                </span>
                <ChevronRight className="shrink-0" />
              </Button>
              {saved !== null && garmentType !== null && (
                <Button
                  variant="ghost"
                  aria-label="옷 정보 확인 (선택)"
                  className="h-auto justify-between whitespace-normal rounded-none border-b border-border px-0 py-4 text-left"
                  onClick={() => setAttributesOpen(true)}
                >
                  <span className="min-w-0">
                    <span className="block font-bold">옷 정보 확인 (선택)</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {selectedCount ? `${selectedCount}개 항목 선택` : "아직 고르지 않음"}
                      {rawText.trim() ? " · 직접 적기 입력됨" : ""}
                    </span>
                    {saved.attributes?.needsConfirmation && (
                      <span className="mt-1 block text-xs text-primary">다시 확인 필요</span>
                    )}
                    {attrDirty && (
                      <span className="mt-1 block text-xs text-primary">저장 안 된 변경 있음</span>
                    )}
                  </span>
                  <ChevronRight className="shrink-0" />
                </Button>
              )}
            </div>
            <GarmentSheet
              open={additionalOpen}
              onOpenChange={setAdditionalOpen}
              title="추가 정보 입력 (선택)"
              footer={
                <Button
                  className="h-11 w-full rounded-full"
                  onClick={() => setAdditionalOpen(false)}
                >
                  적용
                </Button>
              }
            >
              <GarmentForm
                section="additional"
                garmentType={garmentType}
                brand={brand}
                productName={productName}
                purchaseUrl={purchaseUrl}
                fieldErrors={fieldErrors}
                disabled={formDisabled}
                onGarmentType={(v) => {
                  touch();
                  setGarmentType(v);
                  // 이전 종류 전용 선택은 지우고 공통(색·소재감)만 남긴다
                  setAttrValues((prev) => pruneForType(prev));
                }}
                onBrand={(v) => {
                  touch();
                  setBrand(v);
                }}
                onProductName={(v) => {
                  touch();
                  setProductName(v);
                }}
                onPurchaseUrl={(v) => {
                  touch();
                  setPurchaseUrl(v);
                }}
              />
            </GarmentSheet>
            {saved !== null && garmentType !== null && (
              <GarmentSheet
                open={attributesOpen}
                onOpenChange={setAttributesOpen}
                title="옷 정보 확인 (선택)"
                footer={
                  <Button
                    className="h-11 w-full rounded-full"
                    disabled={!canSaveAttributes || attributesMutation.isPending}
                    onClick={handleAttributesSave}
                  >
                    {attributesMutation.isPending ? "저장 중…" : "옷 정보 저장"}
                  </Button>
                }
              >
                <GarmentAttributes
                  hideSave
                  garmentType={garmentType}
                  values={attrValues}
                  rawText={rawText}
                  needsConfirmation={saved.attributes?.needsConfirmation === true}
                  notice={attrNotice}
                  error={attrError}
                  disabled={formDisabled || attributesMutation.isPending}
                  saving={attributesMutation.isPending}
                  canSave={canSaveAttributes && !attributesMutation.isPending}
                  onToggle={handleAttrToggle}
                  onRawText={(v) => {
                    touch();
                    setAttrError(null);
                    setRawText(v);
                  }}
                  onSave={handleAttributesSave}
                />
              </GarmentSheet>
            )}

            {actionError && (
              <div role="alert" className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-destructive/40">
                <p className="flex items-start gap-2.5 text-sm leading-relaxed text-foreground">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive"
                    aria-hidden="true"
                  />
                  {messageForApiError(actionError.error)}
                </p>
                {(actionError.error.code || actionError.error.requestId) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      오류 상세
                    </summary>
                    <p className="mt-1 text-xs text-muted-foreground">
                      코드 {actionError.error.code}
                      {actionError.error.requestId && ` · 요청 ID ${actionError.error.requestId}`}
                    </p>
                  </details>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="tap-feedback mt-3 h-10 rounded-full border-input bg-transparent px-4"
                  disabled={
                    actionError.kind === "save"
                      ? !canSave
                      : actionPending || sessionExpired || restoring
                  }
                  onClick={actionError.kind === "save" ? handleSave : handleDelete}
                >
                  다시 시도
                </Button>
              </div>
            )}

            {saved !== null && (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("auth-navigation", { detail: "/conditions" }),
                  )
                }
                className="tap-feedback mt-6 flex min-h-12 items-center justify-between rounded-2xl bg-card px-4 text-sm font-bold text-foreground ring-1 ring-border hover:bg-accent"
              >
                코디 조건 정하기
                <span aria-hidden="true">→</span>
              </button>
            )}

            {/* The section's entrance animation keeps a transform, which pins this "fixed" bar to the section's bottom on mobile; leave room so it never covers the last controls. */}
            <div aria-hidden="true" className="h-24 lg:hidden" />
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mt-9 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
              <Button
                type="button"
                size="lg"
                className="tap-feedback h-12 w-full rounded-full text-base font-bold shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]"
                disabled={!canSave}
                onClick={handleSave}
              >
                {saveMutation.isPending ? "저장 중…" : "저장하기"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>등록한 옷을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              저장된 사진과 정보가 삭제됩니다. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleteMutation.isPending ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>처음부터 다시 시작할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              지금까지 입력한 내용과 저장된 옷이 모두 지워지고 새 세션으로 시작해요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              onClick={(e) => {
                e.preventDefault();
                handleReset();
              }}
            >
              {resetMutation.isPending ? "시작하는 중…" : "새로 시작"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
