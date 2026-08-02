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
  { label: "Seedance Pro (기본, ~10초)", model: "fal-ai/bytedance/seedance/v1/pro/image-to-video", note: "안정적, 최대 10초" },
  { label: "Kling 2.1 Master (~10초)", model: "fal-ai/kling-video/v2.1/master/image-to-video", note: "고퀄, 최대 10초" },
];

export default function VideoConfigSettings({
  model,
  duration,
  resolution,
}: {
  model: string;
  duration: string;
  resolution: string;
}) {
  const [m, setM] = useState(model);
  const [d, setD] = useState(duration);
  const [r, setR] = useState(resolution);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () =>
    start(async () => {
      const res = await saveVideoConfig(m, d, r);
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "저장됨" : "오류") });
    });

  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 10, lineHeight: 1.6 }}>
        릴스·숏츠 영상 생성에 쓰는 <b>fal.ai 모델</b>·길이·해상도를 재배포 없이 바꿉니다. 30초를 지원하는 모델 ID를
        넣고 길이를 30으로 저장하세요. (대부분의 이미지→영상 모델은 단일 생성 5~10초라, 지원 여부는 fal 계정에서 확인)
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4, fontWeight: 600 }}>fal 모델 ID</span>
          <input style={inputStyle} value={m} onChange={(e) => setM(e.target.value)} placeholder="fal-ai/bytedance/seedance/v1/pro/image-to-video" />
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
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn" onClick={save} disabled={pending} style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }}>저장</button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.ok ? "var(--ok, #16a34a)" : "var(--owner, #b91c1c)" }}>{msg.text}</div>}
    </div>
  );
}
