"use client";

import { useState, useTransition } from "react";
import { saveVideoConfig } from "@/app/(app)/settings/ai-actions";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--line-2)",
  borderRadius: "var(--radius)",
  background: "var(--surface)",
  color: "var(--ink)",
};

// 참고용 프리셋 (fal.ai 모델 ID). 길이 지원은 모델마다 다르므로 발급 계정에서 확인.
const PRESETS: { label: string; model: string; note: string }[] = [
  { label: "Kling 2.1 Master (기본·고퀄, ~10초)", model: "fal-ai/kling-video/v2.1/master/image-to-video", note: "고퀄, 최대 10초" },
  { label: "Seedance Pro (~10초)", model: "fal-ai/bytedance/seedance/v1/pro/image-to-video", note: "안정적, 최대 10초" },
];

const MERGE_RES: { value: string; label: string }[] = [
  { value: "portrait_16_9", label: "세로 9:16 (릴스·숏츠)" },
  { value: "square", label: "정사각 1:1" },
  { value: "landscape_16_9", label: "가로 16:9" },
];

export default function VideoConfigSettings({
  model,
  duration,
  resolution,
  mergeResolution,
  cheapMode,
}: {
  model: string;
  duration: string;
  resolution: string;
  mergeResolution: string;
  cheapMode: boolean;
}) {
  const [m, setM] = useState(model);
  const [d, setD] = useState(duration);
  const [r, setR] = useState(resolution);
  const [mr, setMr] = useState(mergeResolution);
  const [cheap, setCheap] = useState(cheapMode);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      const res = await saveVideoConfig(m, d, r, mr, cheap);
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "저장됨" : "오류") });
    });

  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 10, lineHeight: 1.6 }}>
        릴스·숏츠 영상은 <b>10초 클립 3개를 자동으로 이어붙여 30초</b>로 만듭니다. 아래에서 쓰는{" "}
        <b>fal.ai 모델</b>·클립 길이·해상도를 재배포 없이 바꿀 수 있습니다. 길이는 클립 1개 길이이며(기본 10초),
        3개가 이어붙어 최종 영상이 됩니다.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>fal 모델 ID</span>
          <input style={inputStyle} value={m} onChange={(e) => setM(e.target.value)} placeholder="fal-ai/kling-video/v2.1/master/image-to-video" />
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p.model} className="btn" style={{ padding: "3px 9px", fontSize: 11.5 }} onClick={() => setM(p.model)} title={p.note}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>길이(초)</span>
            <input type="number" style={inputStyle} value={d} onChange={(e) => setD(e.target.value)} placeholder="10" />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>해상도</span>
            <select style={inputStyle} value={r} onChange={(e) => setR(e.target.value)}>
              {["1080p", "720p", "480p"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>
            최종 영상 비율 (클립 3개 이어붙일 때)
          </span>
          <select style={inputStyle} value={mr} onChange={(e) => setMr(e.target.value)}>
            {MERGE_RES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: 14,
          padding: "10px 12px",
          border: "1px solid var(--line-2)",
          borderRadius: "var(--radius)",
          background: cheap ? "var(--accent-bg, #eef)" : "var(--surface)",
          cursor: "pointer",
        }}
      >
        <input type="checkbox" checked={cheap} onChange={(e) => setCheap(e.target.checked)} style={{ marginTop: 2, width: 17, height: 17 }} />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>
          <b>저렴 모드 (10초 1클립)</b>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            켜면 30초(클립 3개+병합) 대신 <b>10초 클립 1개</b>만 만들어 크레딧을 약 1/3로 아낍니다. 테스트·초안용으로 권장.
          </div>
        </span>
      </label>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn" onClick={save} disabled={pending} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</div>}
    </div>
  );
}
