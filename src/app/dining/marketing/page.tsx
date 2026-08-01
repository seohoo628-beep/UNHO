"use client";

import { useState } from "react";
import { useData, inScope } from "@dining/lib/store";
import { Card, Badge, Stat, Bar, Modal, Field } from "@dining/components/ui";
import { storeName, STORES } from "@dining/lib/stores";
import { won, manwon, num, pct, ratio, uid, today } from "@dining/lib/format";
import type { Campaign, CampaignStatus, StoreId } from "@dining/lib/types";

const STATUS: Record<CampaignStatus, [string, string]> = {
  planned: ["gray", "예정"],
  running: ["green", "진행중"],
  done: ["blue", "종료"],
};

export default function MarketingPage() {
  const { data, scope, update, ready } = useData();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Campaign | null>(null);
  if (!ready) return null;

  const camps = inScope(data.campaigns, scope);
  const budget = camps.reduce((s, c) => s + c.budget, 0);
  const spent = camps.reduce((s, c) => s + c.spent, 0);
  const reach = camps.reduce((s, c) => s + c.reach, 0);
  const conv = camps.reduce((s, c) => s + c.conversions, 0);

  // 채널별 집계
  const channels = Array.from(new Set(camps.map((c) => c.channel))).map((ch) => {
    const cs = camps.filter((c) => c.channel === ch);
    return {
      channel: ch,
      spent: cs.reduce((s, c) => s + c.spent, 0),
      conv: cs.reduce((s, c) => s + c.conversions, 0),
    };
  });
  const maxChSpent = Math.max(1, ...channels.map((c) => c.spent));

  const save = (c: Campaign) =>
    update((d) => {
      const i = d.campaigns.findIndex((x) => x.id === c.id);
      if (i >= 0) d.campaigns[i] = c;
      else d.campaigns.unshift(c);
      return d;
    });
  const remove = (id: string) =>
    update((d) => ({ ...d, campaigns: d.campaigns.filter((c) => c.id !== id) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>마케팅관리</h1>
          <p>캠페인·채널 성과와 예산 집행 — {storeName(scope)}</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          + 캠페인 추가
        </button>
      </div>

      <div className="grid grid-4">
        <Stat icon="💸" label="예산 / 집행" value={manwon(spent)} foot={`예산 ${manwon(budget)} · 소진 ${pct(ratio(spent, budget), 0)}`} />
        <Stat icon="👁" label="총 도달" value={num(reach)} />
        <Stat icon="🎯" label="전환(예약·방문)" value={`${num(conv)}건`} accent="var(--brand)" />
        <Stat icon="🧮" label="전환당 비용(CPA)" value={conv ? won(Math.round(spent / conv)) : "-"} />
      </div>

      <div className="grid grid-2 mt-24" style={{ alignItems: "start" }}>
        <Card title="채널별 집행·전환" pad>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {channels.map((c) => (
              <div key={c.channel}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{c.channel}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {won(c.spent)} · 전환 {c.conv}건
                  </span>
                </div>
                <Bar value={ratio(c.spent, maxChSpent)} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="예산 소진 현황" pad>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {camps.map((c) => (
              <div key={c.id}>
                <div className="row between" style={{ marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {pct(ratio(c.spent, c.budget), 0)}
                  </span>
                </div>
                <Bar
                  value={ratio(c.spent, c.budget)}
                  color={ratio(c.spent, c.budget) > 90 ? "var(--red)" : undefined}
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="캠페인 목록" pad={false} action={undefined}>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>캠페인</th>
                <th>채널</th>
                {scope === "all" && <th>매장</th>}
                <th>기간</th>
                <th className="num">예산/집행</th>
                <th className="num">도달</th>
                <th className="num">전환</th>
                <th className="num">CPA</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {camps.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>
                    <span className="badge gray">{c.channel}</span>
                  </td>
                  {scope === "all" && <td className="muted">{storeName(c.storeId)}</td>}
                  <td className="muted" style={{ fontSize: 12 }}>
                    {c.startDate}
                    <br />~ {c.endDate}
                  </td>
                  <td className="num">
                    {manwon(c.spent)}
                    <div className="muted" style={{ fontSize: 11 }}>
                      / {manwon(c.budget)}
                    </div>
                  </td>
                  <td className="num">{num(c.reach)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {c.conversions}
                  </td>
                  <td className="num muted">{c.conversions ? won(Math.round(c.spent / c.conversions)) : "-"}</td>
                  <td>
                    <Badge tone={STATUS[c.status][0] as any}>{STATUS[c.status][1]}</Badge>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="btn ghost sm"
                        onClick={() => {
                          setEdit(c);
                          setOpen(true);
                        }}
                      >
                        수정
                      </button>
                      <button className="btn danger sm" onClick={() => remove(c.id)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <CampModal
          initial={edit}
          defaultStore={scope === "all" ? "smjp" : scope}
          onClose={() => setOpen(false)}
          onSave={(c) => {
            save(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function CampModal({
  initial,
  defaultStore,
  onClose,
  onSave,
}: {
  initial: Campaign | null;
  defaultStore: StoreId;
  onClose: () => void;
  onSave: (c: Campaign) => void;
}) {
  const [f, setF] = useState<Campaign>(
    initial ?? {
      id: uid("c"),
      storeId: defaultStore,
      name: "",
      channel: "인스타그램",
      status: "planned",
      startDate: today(),
      endDate: today(),
      budget: 1_000_000,
      spent: 0,
      reach: 0,
      conversions: 0,
      owner: "",
    }
  );
  const set = (k: keyof Campaign, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal
      title={initial ? "캠페인 수정" : "캠페인 추가"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={() => onSave(f)}>
            저장
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="캠페인명" full>
          <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="매장">
          <select className="field" value={f.storeId} onChange={(e) => set("storeId", e.target.value)}>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="채널">
          <select className="field" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
            {["인스타그램", "네이버", "캐치테이블", "블로그", "배달앱", "제휴", "유튜브"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="시작일">
          <input type="date" className="field" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="종료일">
          <input type="date" className="field" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
        <Field label="예산(원)">
          <input type="number" className="field" value={f.budget} onChange={(e) => set("budget", Number(e.target.value))} />
        </Field>
        <Field label="집행(원)">
          <input type="number" className="field" value={f.spent} onChange={(e) => set("spent", Number(e.target.value))} />
        </Field>
        <Field label="도달/노출">
          <input type="number" className="field" value={f.reach} onChange={(e) => set("reach", Number(e.target.value))} />
        </Field>
        <Field label="전환(건)">
          <input type="number" className="field" value={f.conversions} onChange={(e) => set("conversions", Number(e.target.value))} />
        </Field>
        <Field label="상태">
          <select className="field" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="planned">예정</option>
            <option value="running">진행중</option>
            <option value="done">종료</option>
          </select>
        </Field>
        <Field label="담당자">
          <input className="field" value={f.owner} onChange={(e) => set("owner", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
