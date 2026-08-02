"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeExecution,
  reopenExecution,
  generateExecContent,
  submitVideo,
  checkVideo,
} from "@/app/(app)/execute/actions";

export type ExecItem = {
  id: string;
  title: string;
  brandName: string;
  category: string | null;
  status: string;
  agentType: string | null;
  body: string | null;
  execContent: string | null;
  execChannel: string | null;
  execLink: string | null;
  execNote: string | null;
  images: { url: string; label: string }[];
  videoStatus: string | null;
  videoUrl: string | null;
  videoNote: string | null;
};

const CHANNEL_HINT: Record<string, string> = {
  marketer: "SNS·블로그 등에 게시한 뒤 게시물 링크를 남기세요.",
  md: "셀러·바이어에게 발송한 뒤 대상/결과를 남기세요.",
  designer: "문서를 전달·보관한 뒤 파일 링크를 남기세요.",
};

export default function ExecutionCard({ item }: { item: ExecItem }) {
  const [channel, setChannel] = useState(item.execChannel ?? "");
  const [link, setLink] = useState(item.execLink ?? "");
  const [note, setNote] = useState(item.execNote ?? "");
  const [copied, setCopied] = useState<"none" | "draft" | "content">("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const [selImg, setSelImg] = useState(item.images[0]?.url ?? "");
  const [vPrompt, setVPrompt] = useState("");
  const [vError, setVError] = useState<string | null>(null);

  const done = item.status === "완료";
  const hasContent = !!item.execContent;
  const vStatus = item.videoStatus;
  const vBusy = vStatus === "queued" || vStatus === "processing";

  // 생성 중이면 8초마다 상태 확인 후 새로고침.
  useEffect(() => {
    if (!vBusy) return;
    const id = setTimeout(async () => {
      await checkVideo(item.id);
      router.refresh();
    }, 8000);
    return () => clearTimeout(id);
  }, [vBusy, item.id, item.videoStatus, router]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "처리 실패");
      else router.refresh();
    });
  }

  function runVideo(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setVError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setVError(r.error ?? "처리 실패");
      router.refresh();
    });
  }

  async function copy(text: string, which: "draft" | "content") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied("none"), 1500);
    } catch {
      setError("복사 실패 — 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14, opacity: done ? 0.75 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div>
          <span className="badge accent">{item.brandName}</span>{" "}
          <strong>{item.title.replace(/^\[집행\]\s*/, "")}</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {item.category ?? "기타"} · {CHANNEL_HINT[item.agentType ?? ""] ?? "집행 후 결과 링크를 남기세요."}
          </div>
        </div>
        <span className={`badge ${done ? "ok" : item.status === "진행" ? "accent" : ""}`}>{item.status}</span>
      </div>

      {/* 집행 콘텐츠 생성 / 결과 */}
      {!hasContent ? (
        <>
          <div className="divider" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn primary"
              disabled={pending}
              onClick={() => run(() => generateExecContent(item.id))}
            >
              {pending ? "생성 중..." : "집행 콘텐츠 생성"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              승인 원문 + 업로드된 실제 제품컷으로 게시용 문구·해시태그·컷 배치를 만듭니다.
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="divider" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="lbl" style={{ fontSize: 12, color: "var(--ink-2)" }}>집행 콘텐츠 (게시용)</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button className="btn sm" onClick={() => copy(item.execContent ?? "", "content")} disabled={pending}>
                {copied === "content" ? "복사됨 ✓" : "콘텐츠 복사"}
              </button>
              {!done && (
                <button className="btn sm" onClick={() => run(() => generateExecContent(item.id))} disabled={pending}>
                  {pending ? "재생성 중..." : "재생성"}
                </button>
              )}
            </span>
          </div>
          <div className="pre" style={{ maxHeight: done ? 140 : 320, overflow: "auto" }}>{item.execContent}</div>
        </>
      )}

      {/* 실제 제품컷 (붙일 이미지) */}
      {item.images.length > 0 && (
        <>
          <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", margin: "12px 0 6px" }}>
            첨부할 제품컷 ({item.images.length}) — 클릭해 원본 열기·저장
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {item.images.slice(0, 12).map((img, i) => (
              <a
                key={i}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                title={img.label}
                style={{ display: "block", width: 76, height: 76, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line-2)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
          </div>
        </>
      )}

      {/* 제품컷 → 영상 (Seedance) */}
      <div className="divider" />
      <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
        제품컷 → 영상 (Seedance · 10초×3 → 30초)
      </div>
      {!item.videoUrl && item.images.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5 }}>
          팁: 제품컷을 <b>3장 이상</b> 올리면 서로 다른 컷으로 이어붙여 광고처럼 나옵니다. 소스는{" "}
          <b>제품·음식 클로즈업</b>이 좋고, 글자 많은 간판·메뉴판 사진은 흐리게 나올 수 있어요.
        </div>
      )}
      {item.videoUrl && vStatus === "done" ? (
        <div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={item.videoUrl} controls style={{ width: "100%", maxWidth: 360, borderRadius: 10, display: "block" }} />
          {item.videoNote && (
            <div
              style={{
                fontSize: 11.5,
                marginTop: 6,
                color: item.videoNote.startsWith("✓") ? "var(--ok, #16a34a)" : "var(--warn, #b45309)",
              }}
            >
              {item.videoNote}
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <a className="btn sm" href={item.videoUrl} target="_blank" rel="noreferrer">영상 저장</a>
            {!done && item.images.length > 0 && (
              <button
                className="btn sm"
                disabled={pending}
                onClick={() => runVideo(() => submitVideo(item.id, selImg || item.images[0].url, vPrompt, item.images.map((i) => i.url)))}
              >
                다시 생성
              </button>
            )}
          </div>
        </div>
      ) : vBusy ? (
        <div className="flag" style={{ borderLeftColor: "var(--accent)", background: "var(--accent-bg, #eef)" }}>
          {item.videoNote ? item.videoNote : "영상 생성 중입니다…"}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            30초 영상은 10초 클립 3개를 만들어 이어붙여 <b>보통 2~5분</b> 걸립니다. <b>이 화면을 꺼도 서버가 자동으로 완성</b>하니, 나중에 다시 들어와 확인하면 됩니다.
          </div>
          <button className="btn sm" style={{ marginTop: 6 }} disabled={pending} onClick={() => runVideo(() => checkVideo(item.id))}>
            지금 확인
          </button>
        </div>
      ) : item.images.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          영상을 만들려면 먼저 <b>제품컷 라이브러리</b>에 이 브랜드 제품 이미지를 올리세요.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={selImg} onChange={(e) => setSelImg(e.target.value)} style={{ flex: "1 1 160px", maxWidth: 200 }} disabled={pending}>
            {item.images.map((img, i) => (
              <option key={i} value={img.url}>{img.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={vPrompt}
            onChange={(e) => setVPrompt(e.target.value)}
            placeholder="영상 지시(선택): 예) 제품을 천천히 회전하며 클로즈업"
            style={{ flex: "2 1 220px" }}
            disabled={pending}
          />
          <button
            className="btn primary"
            disabled={pending || !selImg}
            onClick={() => runVideo(() => submitVideo(item.id, selImg || item.images[0].url, vPrompt, item.images.map((i) => i.url)))}
          >
            {vStatus === "failed" ? "다시 시도" : "영상 생성"}
          </button>
        </div>
      )}
      {vStatus === "failed" && !vBusy && (
        <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 6 }}>
          {item.videoNote ? item.videoNote : "직전 생성이 실패했습니다."} 다시 시도하세요.
        </div>
      )}
      {vError && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 6 }}>{vError}</div>}

      {/* 승인된 원문 (참고용) */}
      {item.body && (
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>
            승인된 원문 보기
          </summary>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "6px 0" }}>
            <button className="btn sm" onClick={() => copy(item.body ?? "", "draft")} disabled={pending}>
              {copied === "draft" ? "복사됨 ✓" : "원문 복사"}
            </button>
          </div>
          <div className="pre" style={{ maxHeight: 200, overflow: "auto" }}>{item.body}</div>
        </details>
      )}

      <div className="divider" />

      {/* 집행 결과 입력 */}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label className="field" style={{ marginBottom: 0, flex: "1 1 160px" }}>
          <span>집행 채널</span>
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="예: 인스타그램, 스마트스토어"
            disabled={done && !pending}
          />
        </label>
        <label className="field" style={{ marginBottom: 0, flex: "2 1 240px" }}>
          <span>결과 링크</span>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="게시물·발송·문서 URL"
            disabled={done && !pending}
          />
        </label>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        <span>집행 메모</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="집행 대상·시점·특이사항"
          style={{ minHeight: 56 }}
          disabled={done && !pending}
        />
      </label>

      {error && <p style={{ color: "var(--owner)", fontSize: 13, marginTop: 0 }}>{error}</p>}

      <div className="btn-row">
        {!done ? (
          <>
            <button
              className="btn approve"
              disabled={pending}
              onClick={() => run(() => completeExecution(item.id, { channel, link, note }))}
            >
              집행 완료
            </button>
          </>
        ) : (
          <>
            {item.execLink && (
              <a className="btn" href={item.execLink} target="_blank" rel="noreferrer">
                결과 열기
              </a>
            )}
            <button className="btn" disabled={pending} onClick={() => run(() => reopenExecution(item.id))}>
              다시 열기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
