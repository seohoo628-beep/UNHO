"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeExecution,
  reopenExecution,
  generateExecContent,
  checkVideo,
  generateThumbnail,
  deleteThumbnail,
} from "@/app/(app)/execute/actions";
import { toast } from "@/lib/toast";

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
  thumbUrls: string[];
};

const THUMB_ASPECTS: { value: "portrait_16_9" | "square_hd" | "landscape_16_9"; label: string }[] = [
  { value: "portrait_16_9", label: "세로 9:16 (릴스·숏츠)" },
  { value: "square_hd", label: "정사각 1:1 (피드)" },
  { value: "landscape_16_9", label: "가로 16:9 (유튜브)" },
];

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

  const [thumbAspect, setThumbAspect] = useState<"portrait_16_9" | "square_hd" | "landscape_16_9">("square_hd");
  const [thumbConcept, setThumbConcept] = useState("");
  const [thumbErr, setThumbErr] = useState<string | null>(null);
  const [thumbWarn, setThumbWarn] = useState<string | null>(null);

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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "처리 실패");
        toast(r.error ?? "처리 실패", "err");
      } else {
        if (okMsg) toast(okMsg, "ok");
        router.refresh();
      }
    });
  }

  function genThumb() {
    setThumbErr(null);
    setThumbWarn(null);
    start(async () => {
      const r = await generateThumbnail(item.id, item.images.map((im) => im.url), thumbAspect, thumbConcept.trim() || undefined);
      if (!r.ok) {
        setThumbErr(r.error ?? "생성 실패");
        toast(r.error ?? "썸네일 생성 실패", "err");
      } else {
        if (r.needsMigration) setThumbWarn("이미지는 만들었지만 저장 컬럼이 없어 목록에 남지 않습니다. 상단 안내의 SQL을 실행하세요.");
        else toast("썸네일이 생성됐어요", "ok");
      }
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

      {/* 제품 → 썸네일 이미지 (fal 이미지 · 저렴·고퀄) */}
      <div className="divider" />
      <div className="lbl" style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
        썸네일 이미지 생성 (실제 제품컷 기반 · Nano Banana)
      </div>

      {/* 생성된 썸네일 갤러리 */}
      {item.thumbUrls.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {item.thumbUrls.map((url, i) => (
            <div key={i} style={{ position: "relative", width: 104 }}>
              <a href={url} target="_blank" rel="noreferrer" title="원본 열기">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="썸네일" style={{ width: 104, height: 104, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)", display: "block" }} />
              </a>
              <a
                className="btn sm"
                href={`${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(`${item.brandName || "content"}-${i + 1}.jpg`)}`}
                style={{ width: "100%", justifyContent: "center", marginTop: 3 }}
              >
                ⬇ 저장
              </a>
              {!done && (
                <button
                  className="btn"
                  onClick={() => run(() => deleteThumbnail(item.id, url))}
                  disabled={pending}
                  title="삭제"
                  style={{ position: "absolute", top: 2, right: 2, padding: "1px 6px", fontSize: 12, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none" }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!done && item.images.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          썸네일을 만들려면 먼저 <b>제품컷 라이브러리</b>에 이 브랜드 제품 이미지를 올리세요.
        </div>
      ) : !done ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={thumbAspect}
            onChange={(e) => setThumbAspect(e.target.value as typeof thumbAspect)}
            style={{ flex: "1 1 130px", maxWidth: 200 }}
            disabled={pending}
          >
            {THUMB_ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={thumbConcept}
            onChange={(e) => setThumbConcept(e.target.value)}
            placeholder="컨셉(선택): 예) 노을빛 감성, 클로즈업"
            style={{ flex: "2 1 200px" }}
            disabled={pending}
          />
          <button className="btn primary" disabled={pending || item.images.length === 0} onClick={genThumb}>
            {pending ? "생성 중…" : "썸네일 생성"}
          </button>
        </div>
      ) : null}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
        첨부된 <b>제품컷 {item.images.length}장 전부</b>를 참고해 고급 광고 이미지로 만듭니다(제품은 그대로, 글자 없음). 기본은 <b>피드용(정사각)</b>이며 여러 번 눌러 마음에 드는 컷을 고르세요.
      </div>
      {thumbErr && <div style={{ color: "var(--owner)", fontSize: 12, marginTop: 6 }}>⚠ {thumbErr}</div>}
      {thumbWarn && <div style={{ color: "var(--warn, #b45309)", fontSize: 12, marginTop: 6 }}>⚠ {thumbWarn}</div>}

      {/* 이전에 만든 영상이 있으면 접어서 보관 */}
      {item.videoUrl && vStatus === "done" && (
        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>이전에 생성한 영상 보기</summary>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={item.videoUrl} controls style={{ width: "100%", maxWidth: 320, borderRadius: 10, display: "block", marginTop: 8 }} />
          <a className="btn sm" href={item.videoUrl} target="_blank" rel="noreferrer" style={{ marginTop: 6, display: "inline-block" }}>영상 저장</a>
        </details>
      )}

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
              onClick={() => run(() => completeExecution(item.id, { channel, link, note }), "집행 완료 · 콘텐츠 결과물로 이동했어요")}
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
