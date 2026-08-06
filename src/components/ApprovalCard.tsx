"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveOutput,
  rejectOutput,
  requestRevision,
  generateApprovalThumb,
  approveMarketer,
} from "@/app/(app)/approvals/actions";
import { toast } from "@/lib/toast";

type Finding = { phrase: string; reason: string; suggestion: string; rule: string };

export type ApprovalItem = {
  id: string;
  title: string | null;
  body: string | null;
  brandName: string;
  brandId?: string | null;
  images?: { url: string; label: string }[];
  model: string | null;
  createdAt: string;
  complianceStatus: "pass" | "fail";
  findings: Finding[];
};

type Aspect = "portrait_16_9" | "square_hd" | "landscape_16_9";
const ASPECTS: { value: Aspect; label: string }[] = [
  { value: "square_hd", label: "정사각 1:1 (피드)" },
  { value: "portrait_16_9", label: "세로 9:16 (릴스·숏츠)" },
  { value: "landscape_16_9", label: "가로 16:9 (유튜브)" },
];

export default function ApprovalCard({
  item,
  canApprove,
  mode = "marketer",
}: {
  item: ApprovalItem;
  canApprove: boolean;
  mode?: "marketer" | "planning";
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const images = item.images ?? [];
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [aspect, setAspect] = useState<Aspect>("square_hd");
  const [concept, setConcept] = useState("");
  const [thumbErr, setThumbErr] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "처리 실패");
        toast(res.error ?? "처리 실패", "err");
      } else {
        if (okMsg) toast(okMsg, "ok");
        router.refresh();
      }
    });
  }

  function genThumb() {
    setThumbErr(null);
    startTransition(async () => {
      const r = await generateApprovalThumb(item.id, aspect, concept.trim() || undefined);
      if (!r.ok || !r.url) {
        setThumbErr(r.error ?? "생성 실패");
        toast(r.error ?? "썸네일 생성 실패", "err");
      } else {
        setThumbs((prev) => [r.url as string, ...prev]);
        toast("썸네일이 생성됐어요", "ok");
      }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <span className="badge accent">{item.brandName}</span> <strong>{item.title}</strong>
        </div>
        {item.complianceStatus === "pass" ? (
          <span className="badge ok">규제 검수 통과</span>
        ) : (
          <span className="badge owner">규제 검수 미통과</span>
        )}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        규칙+AI 검수 · 지적 {item.findings.length}건 · 모델 {item.model ?? "-"}
      </div>

      {item.complianceStatus === "fail" && item.findings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {item.findings.map((f, i) => (
            <div key={i} className="flag">
              <b>[{f.rule}] “{f.phrase}”</b> — {f.reason}
              <div className="fix">대체 제안: {f.suggestion}</div>
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      <div className="pre">{item.body}</div>

      {/* 썸네일 생성 (제품컷 기반) — 여기서 만들고 아래 '완료'를 누르면 바로 결과물로 */}
      {mode === "marketer" && (
      <>
      <div className="divider" />
      <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
        썸네일 생성 (제품컷 {images.length}장 참고 · 기본 피드용)
      </div>

      {thumbs.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {thumbs.map((url, i) => (
            <div key={i} style={{ position: "relative", width: 96 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="썸네일" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
              <button
                type="button"
                onClick={() => setThumbs((p) => p.filter((u) => u !== url))}
                title="삭제"
                style={{ position: "absolute", top: 2, right: 2, padding: "1px 6px", fontSize: 12, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5 }}>
          이 브랜드 제품컷이 없어 썸네일을 만들 수 없습니다. ‘제품 이미지·영상 자료’에 먼저 올리거나, 썸네일 없이 승인하세요.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} disabled={pending} style={{ flex: "1 1 130px", maxWidth: 200 }}>
            {ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="컨셉(선택): 예) 노을빛 감성"
            disabled={pending}
            style={{ flex: "2 1 180px" }}
          />
          <button className="btn" disabled={pending || !canApprove} onClick={genThumb}>
            {pending ? "생성 중…" : "썸네일 생성"}
          </button>
        </div>
      )}
      {thumbErr && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 6 }}>⚠ {thumbErr}</div>}
      </>
      )}

      <div className="divider" />
      <label className="field">
        <span>사유 (반려·수정 요청 시 입력)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="반려 또는 수정 요청 이유를 적습니다. 승인 시에는 비워도 됩니다."
        />
      </label>

      {error && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div className="btn-row" style={{ flexWrap: "wrap" }}>
        {mode === "marketer" ? (
          <>
            <button
              className="btn approve"
              disabled={pending || !canApprove}
              title={canApprove ? "승인하고 썸네일과 함께 바로 콘텐츠 결과물로 보냅니다." : "승인은 대표만 가능합니다."}
              onClick={() => run(() => approveMarketer(item.id, { thumbUrls: thumbs, complete: true, reason }), "승인 완료 · 콘텐츠 결과물로 이동했어요")}
            >
              ✅ 승인하고 결과물로 완료
            </button>
            <button
              className="btn"
              disabled={pending || !canApprove}
              title="승인만 하고 집행은 집행센터에서 (썸네일도 함께 넘어감)"
              onClick={() => run(() => approveMarketer(item.id, { thumbUrls: thumbs, complete: false, reason }), "승인 완료 · 집행센터로 넘어갔어요")}
            >
              승인만 (집행센터로)
            </button>
          </>
        ) : (
          <button
            className="btn approve"
            disabled={pending || !canApprove}
            title={canApprove ? "" : "승인은 대표만 가능합니다."}
            onClick={() => run(() => approveOutput(item.id, reason), "승인 완료 · 집행센터로 넘어갔어요")}
          >
            승인 → 집행센터로
          </button>
        )}
        <button className="btn reject" disabled={pending || !canApprove} onClick={() => run(() => rejectOutput(item.id, reason), "반려 처리했어요")}>
          반려
        </button>
        <button className="btn" disabled={pending} onClick={() => run(() => requestRevision(item.id, reason), "수정 요청을 보냈어요")}>
          수정 요청
        </button>
      </div>
    </div>
  );
}
