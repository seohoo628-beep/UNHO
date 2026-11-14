"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DbSetupNotice } from "@/components/DbSetupNotice";
import {
  MDT_STAGES, MDT_CHANNELS, MDT_SHIP_KINDS, MDT_OPEN_STAGES, MDT_LIVE_STAGES,
  supplyExVat, autoShipCost, cartons, saleCalc, totals, lotSold, lotStock, daysUntil, expiryLevel, lastMonths,
  type MdtAccount, type MdtLot, type MdtSale, type MdtSettings, type MdtShipment,
} from "@/lib/mudangtea";
import { saveMdt, deleteMdt, saveMdtSettings, type MdtKind } from "./actions";

// supabase/migrations/0099_mudangtea_distribution.sql 과 같은 내용
const SETUP_SQL = `create table if not exists public.mdt_settings (
  id text primary key default 'main',
  supply_price_incl bigint,            -- 공급가(박스당, VAT 포함, 원)
  vat_rate numeric not null default 0.1,
  retail_price bigint,                 -- 권장 소비자가(박스당, 원)
  ship_per_carton bigint,              -- 배송비(1건당, 원)
  boxes_per_carton int,                -- 1건(카톤)당 박스 수
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text,
  stage text not null default '발굴'
    check (stage in ('발굴','제안','샘플','협상','입점','판매중','보류','종료')),
  deal_type text check (deal_type is null or deal_type in ('사입','위탁')),
  sale_price bigint,                   -- 판매처 공급가(박스당, VAT 별도)
  contact text,
  next_action text,
  next_date date,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null,
  received_date date,
  expiry date not null,
  qty_in int not null check (qty_in > 0),
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mdt_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  account_id uuid not null references public.mdt_accounts(id) on delete restrict,
  lot_id uuid references public.mdt_lots(id) on delete restrict,
  qty int not null check (qty > 0),    -- 박스
  unit_price bigint not null,          -- 박스당, VAT 별도
  ship_cost bigint,                    -- 배송비(원)
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mdt_sales_date_idx on public.mdt_sales(sale_date);
create index if not exists mdt_sales_account_idx on public.mdt_sales(account_id);

create table if not exists public.mdt_shipments (
  id uuid primary key default gen_random_uuid(),
  ship_date date not null,
  kind text not null default '샘플' check (kind in ('샘플','반품','재발송','기타')),
  account_id uuid references public.mdt_accounts(id) on delete set null,
  cost bigint not null,
  note text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['mdt_settings','mdt_accounts','mdt_lots','mdt_sales','mdt_shipments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (public.current_app_role() in ('owner','staff'))
      with check (public.current_app_role() in ('owner','staff'))$p$, t || '_all', t);
  end loop;
end $$;`;

type Tab = "overview" | "accounts" | "sales" | "lots" | "ship" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "요약" }, { key: "accounts", label: "판매처·제안" }, { key: "sales", label: "판매 기록" },
  { key: "lots", label: "재고·유통기한" }, { key: "ship", label: "배송비" }, { key: "settings", label: "설정" },
];

const won = (v: number) => `${Math.round(v || 0).toLocaleString("ko-KR")}원`;
const qty = (v: number) => Math.round(v || 0).toLocaleString("ko-KR");
const short = (v: number) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1).replace(/\.0$/, "")}억` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : Math.round(v).toLocaleString("ko-KR"));

interface Props {
  dbReady: boolean; today: string; isOwner: boolean; settings: MdtSettings | null;
  accounts: MdtAccount[]; lots: MdtLot[]; sales: MdtSale[]; shipments: MdtShipment[];
}

export default function MudangteaClient(p: Props) {
  if (!p.dbReady) {
    return (
      <div>
        <div className="page-head"><h1 style={{ margin: 0 }}>무당티 유통 관리</h1></div>
        <DbSetupNotice title="무당티 유통 관리" sql={SETUP_SQL} />
      </div>
    );
  }
  return <Board {...p} />;
}

function Board({ today, isOwner, settings, accounts, lots, sales, shipments }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<{ kind: MdtKind; id: string | null } | null>(null);
  const [err, setErr] = useState("");

  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "(삭제된 판매처)";
  const lotNo = (id: string) => lots.find((l) => l.id === id)?.lotNo ?? "";
  const ym = today.slice(0, 7);
  const otherShip = (pred: (x: MdtShipment) => boolean) => shipments.filter(pred).reduce((a, x) => a + x.cost, 0);

  const run = (pr: Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await pr;
      if (!r.ok) setErr(r.error ?? "저장하지 못했습니다.");
      else { setErr(""); after?.(); router.refresh(); }
    });

  const open = (kind: MdtKind, id: string | null = null, goto?: Tab) => { if (goto) setTab(goto); setEditor({ kind, id }); setErr(""); };

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>무당티 유통 관리</h1>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            무(無)당티 젤리스틱 · 판매처 {accounts.length}곳 · 판매 {sales.length}건{pending ? " · 저장 중…" : ""}
          </p>
        </div>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            style={{ all: "unset", cursor: "pointer", padding: "10px 14px", whiteSpace: "nowrap", fontWeight: 600, color: tab === t.key ? "var(--ink)" : "var(--ink-2)", borderBottom: `2px solid ${tab === t.key ? "var(--accent)" : "transparent"}` }}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div className="card" style={{ padding: 10, marginBottom: 12, color: "var(--owner)", background: "var(--owner-bg)" }}>{err}</div>}
      {!settings?.supplyPriceIncl && (
        <div className="card" style={{ padding: 10, marginBottom: 12, background: "var(--warn-bg)", color: "var(--warn)", fontSize: 13 }}>
          가격 설정이 비어 있어 원가·이익이 0으로 계산됩니다. 설정 탭에서 공급가를 입력하세요.
        </div>
      )}

      {tab === "overview" && <Overview {...{ today, settings, accounts, lots, sales, shipments, ym, otherShip, open }} />}

      {tab === "accounts" && (
        <Section title="판매처·제안" hint="행을 누르면 수정" action={<button className="btn primary" onClick={() => open("accounts")}>+ 판매처 추가</button>}>
          {editor?.kind === "accounts" && <Editor key={editor.id ?? "new"} kind="accounts" rec={accounts.find((a) => a.id === editor.id) ?? null} {...{ accounts, lots, settings, today, pending }} onClose={() => setEditor(null)} onSave={(d) => run(saveMdt("accounts", editor.id, d), () => setEditor(null))} onDelete={(id) => run(deleteMdt("accounts", id), () => setEditor(null))} />}
          <AccountsTable {...{ accounts, sales, settings, today }} onEdit={(id) => open("accounts", id)} />
        </Section>
      )}

      {tab === "sales" && (
        <Section title="판매 기록" hint="출고·정산 단위로 한 줄씩" action={<button className="btn primary" onClick={() => open("sales")}>+ 판매 기록 추가</button>}>
          {editor?.kind === "sales" && <Editor key={editor.id ?? "new"} kind="sales" rec={sales.find((s) => s.id === editor.id) ?? null} {...{ accounts, lots, settings, today, pending }} onClose={() => setEditor(null)} onSave={(d) => run(saveMdt("sales", editor.id, d), () => setEditor(null))} onDelete={(id) => run(deleteMdt("sales", id), () => setEditor(null))} />}
          <SalesTable {...{ sales, accounts, settings, accName, lotNo }} onEdit={(id) => open("sales", id)} />
        </Section>
      )}

      {tab === "lots" && (
        <Section title="재고·유통기한" hint="재고 = 입고 − 그 로트로 기록한 판매" action={<button className="btn primary" onClick={() => open("lots")}>+ 입고 로트 추가</button>}>
          {editor?.kind === "lots" && <Editor key={editor.id ?? "new"} kind="lots" rec={lots.find((l) => l.id === editor.id) ?? null} {...{ accounts, lots, settings, today, pending }} onClose={() => setEditor(null)} onSave={(d) => run(saveMdt("lots", editor.id, d), () => setEditor(null))} onDelete={(id) => run(deleteMdt("lots", id), () => setEditor(null))} />}
          <Table head={["로트(제조번호)", "입고일", "유통기한", "남은 기간", "입고", "판매", "재고", "메모"]} num={[4, 5, 6]}
            empty="아직 입고 로트가 없습니다. '입고 로트 추가'로 제조번호·유통기한·입고 수량을 적어 주세요."
            rows={[...lots].sort((a, b) => (a.expiry || "9").localeCompare(b.expiry || "9")).map((l) => ({
              key: l.id, onClick: () => open("lots", l.id),
              cells: [<b key="n" style={{ fontFamily: "monospace" }}>{l.lotNo}</b>, l.receivedDate, l.expiry, <ExpiryPill key="e" d={daysUntil(l.expiry, today)} />, qty(l.qtyIn), qty(lotSold(l, sales)), <b key="s">{qty(lotStock(l, sales))}</b>, l.note],
            }))} />
        </Section>
      )}

      {tab === "ship" && (
        <Section title="배송비" hint="판매 기록의 배송비 + 샘플·반품 등 따로 쓴 배송비" action={<button className="btn primary" onClick={() => open("shipments")}>+ 기타 배송비 추가</button>}>
          {editor?.kind === "shipments" && <Editor key={editor.id ?? "new"} kind="shipments" rec={shipments.find((x) => x.id === editor.id) ?? null} {...{ accounts, lots, settings, today, pending }} onClose={() => setEditor(null)} onSave={(d) => run(saveMdt("shipments", editor.id, d), () => setEditor(null))} onDelete={(id) => run(deleteMdt("shipments", id), () => setEditor(null))} />}
          <ShipView {...{ sales, shipments, accName }} onEdit={(kind, id) => open(kind, id, kind === "sales" ? "sales" : "ship")} />
        </Section>
      )}

      {tab === "settings" && <SettingsView settings={settings} isOwner={isOwner} pending={pending} onSave={(d) => run(saveMdtSettings(d))} />}
    </div>
  );
}

/* ---------------- overview ---------------- */
function Overview({ today, settings, accounts, lots, sales, shipments, ym, otherShip, open }: {
  today: string; settings: MdtSettings | null; accounts: MdtAccount[]; lots: MdtLot[]; sales: MdtSale[]; shipments: MdtShipment[];
  ym: string; otherShip: (p: (x: MdtShipment) => boolean) => number; open: (k: MdtKind, id?: string | null, g?: Tab) => void;
}) {
  const all = totals(sales, settings);
  const allOther = otherShip(() => true);
  const month = totals(sales.filter((s) => s.saleDate.startsWith(ym)), settings);
  const monthOther = otherShip((x) => x.shipDate.startsWith(ym));
  const stock = lots.reduce((a, l) => a + lotStock(l, sales), 0);
  const live = accounts.filter((a) => MDT_LIVE_STAGES.includes(a.stage)).length;
  const opened = accounts.filter((a) => MDT_OPEN_STAGES.includes(a.stage)).length;
  const todo = accounts.filter((a) => a.nextDate && a.stage !== "종료").map((a) => ({ a, d: daysUntil(a.nextDate, today) })).filter((x) => x.d !== null && x.d <= 7).sort((x, y) => (x.d ?? 0) - (y.d ?? 0));
  const exp = lots.filter((l) => lotStock(l, sales) > 0).map((l) => ({ l, d: daysUntil(l.expiry, today) })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9)).slice(0, 6);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <Stat label="누적 매출" value={won(all.revenue)} sub={`${qty(all.boxes)}박스 판매`} accent />
        <Stat label="누적 이익" value={won(all.profit - allOther)} sub={`원가 ${won(all.cost)} · 배송비 ${won(all.ship + allOther)}`} />
        <Stat label="이번 달 매출" value={won(month.revenue)} sub={`이익 ${won(month.profit - monthOther)}`} />
        <Stat label="입점·판매 중" value={`${live}곳`} sub={`제안 진행 ${opened}곳`} />
        <Stat label="현재 재고" value={`${qty(stock)}박스`} sub={`${lots.length}개 로트`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Section title="월별 매출·이익" hint="최근 6개월, VAT 별도"><MonthChart {...{ today, sales, shipments, settings }} /></Section>
        <Section title="제안 현황" hint="판매처 단계별">
          {accounts.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {MDT_STAGES.map((st) => {
                const c = accounts.filter((a) => a.stage === st).length;
                const max = Math.max(1, ...MDT_STAGES.map((x) => accounts.filter((a) => a.stage === x).length));
                return (
                  <div key={st} style={{ display: "grid", gridTemplateColumns: "70px 1fr 32px", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span>{st}</span>
                    <div style={{ height: 10, background: "var(--line)", borderRadius: 999, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${(c / max) * 100}%`, background: "var(--accent)", borderRadius: 999 }} /></div>
                    <b style={{ textAlign: "right" }}>{c}</b>
                  </div>
                );
              })}
            </div>
          ) : <Empty>판매처를 추가하면 단계별로 모입니다.</Empty>}
        </Section>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Section title="다음 할 일" hint="지연·7일 이내">
          {todo.length ? todo.map(({ a, d }) => (
            <div key={a.id} onClick={() => open("accounts", a.id, "accounts")} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
              <DuePill d={d!} /><div><b>{a.name}</b><div className="muted" style={{ fontSize: 13 }}>{a.nextAction || "할 일 미입력"} · {a.nextDate}</div></div>
            </div>
          )) : <Empty>7일 안에 예정된 할 일이 없습니다. 판매처의 '다음 할 일'과 날짜를 적어 두면 여기에 뜹니다.</Empty>}
        </Section>
        <Section title="유통기한 확인" hint="재고 남은 로트, 가까운 순">
          {exp.length ? exp.map(({ l, d }) => (
            <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "monospace", minWidth: 90 }}>{l.lotNo}</span><ExpiryPill d={d} /><span className="muted">{l.expiry}</span><b style={{ marginLeft: "auto" }}>{qty(lotStock(l, sales))}박스</b>
            </div>
          )) : <Empty>재고가 남은 로트가 없습니다. 입고되면 '재고·유통기한'에 로트를 추가하세요.</Empty>}
        </Section>
      </div>
    </div>
  );
}

function MonthChart({ today, sales, shipments, settings }: { today: string; sales: MdtSale[]; shipments: MdtShipment[]; settings: MdtSettings | null }) {
  const rows = lastMonths(today, 6).map((m) => {
    const t = totals(sales.filter((s) => s.saleDate.startsWith(m)), settings);
    const other = shipments.filter((x) => x.shipDate.startsWith(m)).reduce((a, x) => a + x.cost, 0);
    return { m, revenue: t.revenue, profit: t.profit - other };
  });
  const empty = rows.every((r) => !r.revenue && !r.profit);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue, r.profit)));
  const min = Math.min(0, ...rows.map((r) => r.profit));
  const W = 560, H = 220, L = 52, R = 8, T = 12, B = 28;
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const step = (W - L - R) / rows.length, bw = Math.min(26, step / 3);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="최근 6개월 매출과 이익">
        {!empty && [min, (max + min) / 2, max].map((v, i) => (
          <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-2)">{short(v)}</text></g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {rows.map((r, i) => {
          const cx = L + step * i + step / 2, y0 = y(0);
          return (
            <g key={r.m}>
              <rect x={cx - bw - 2} y={Math.min(y(r.revenue), y0)} width={bw} height={Math.abs(y0 - y(r.revenue))} rx="3" fill="var(--accent)" />
              <rect x={cx + 2} y={Math.min(y(r.profit), y0)} width={bw} height={Math.abs(y0 - y(r.profit))} rx="3" fill={r.profit < 0 ? "var(--owner)" : "var(--ok)"} />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{+r.m.slice(5)}월</text>
            </g>
          );
        })}
        {empty && <text x={(W + L) / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--ink-2)">판매 기록을 추가하면 여기에 쌓입니다</text>}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink-2)", marginTop: 6 }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent)", borderRadius: 2, marginRight: 5 }} />매출</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, background: "var(--ok)", borderRadius: 2, marginRight: 5 }} />이익(배송비 차감)</span>
      </div>
    </div>
  );
}

/* ---------------- tables ---------------- */
function AccountsTable({ accounts, sales, settings, today, onEdit }: { accounts: MdtAccount[]; sales: MdtSale[]; settings: MdtSettings | null; today: string; onEdit: (id: string) => void }) {
  const [fs, setFs] = useState(""), [fc, setFc] = useState("");
  const rows = accounts
    .filter((a) => (!fs || a.stage === fs) && (!fc || a.channel === fc))
    .sort((a, b) => MDT_STAGES.indexOf(a.stage as never) - MDT_STAGES.indexOf(b.stage as never) || a.name.localeCompare(b.name, "ko"));
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select value={fs} onChange={(e) => setFs(e.target.value)} style={selStyle} aria-label="단계 필터"><option value="">모든 단계</option>{MDT_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={fc} onChange={(e) => setFc(e.target.value)} style={selStyle} aria-label="채널 필터"><option value="">모든 채널</option>{MDT_CHANNELS.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <Table head={["판매처", "채널", "단계", "방식", "판매가(박스)", "누적 판매", "누적 매출", "다음 할 일"]} num={[4, 5, 6]}
        empty={accounts.length ? "조건에 맞는 판매처가 없습니다." : "아직 판매처가 없습니다. '판매처 추가'로 제안할 곳부터 적어 주세요."}
        rows={rows.map((a) => {
          const t = totals(sales.filter((s) => s.accountId === a.id), settings);
          const d = a.nextDate ? daysUntil(a.nextDate, today) : null;
          return {
            key: a.id, onClick: () => onEdit(a.id),
            cells: [
              <div key="n"><b>{a.name}</b>{a.contact && <div className="muted" style={{ fontSize: 12 }}>{a.contact}</div>}</div>,
              a.channel, <StagePill key="s" stage={a.stage} />, a.dealType || "-", a.salePrice ? won(a.salePrice) : "-", qty(t.boxes), won(t.revenue),
              <span key="t">{a.nextAction || <span className="muted">-</span>} {d !== null && <DuePill d={d} />}</span>,
            ],
          };
        })} />
    </>
  );
}

function SalesTable({ sales, accounts, settings, accName, lotNo, onEdit }: { sales: MdtSale[]; accounts: MdtAccount[]; settings: MdtSettings | null; accName: (id: string) => string; lotNo: (id: string) => string; onEdit: (id: string) => void }) {
  const [fm, setFm] = useState(""), [fa, setFa] = useState("");
  const months = useMemo(() => [...new Set(sales.map((s) => s.saleDate.slice(0, 7)).filter(Boolean))].sort().reverse(), [sales]);
  const rows = sales.filter((s) => (!fm || s.saleDate.startsWith(fm)) && (!fa || s.accountId === fa));
  const t = totals(rows, settings);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select value={fm} onChange={(e) => setFm(e.target.value)} style={selStyle} aria-label="월 필터"><option value="">전체 기간</option>{months.map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>
        <select value={fa} onChange={(e) => setFa(e.target.value)} style={selStyle} aria-label="판매처 필터"><option value="">모든 판매처</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </div>
      <Table head={["날짜", "판매처", "로트", "수량(박스)", "판매가", "매출", "원가", "배송비", "이익"]} num={[3, 4, 5, 6, 7, 8]}
        empty={sales.length ? "조건에 맞는 기록이 없습니다." : "아직 판매 기록이 없습니다. 출고·정산할 때 '판매 기록 추가'로 한 줄씩 남겨 주세요."}
        rows={rows.map((s) => {
          const c = saleCalc(s, settings);
          return { key: s.id, onClick: () => onEdit(s.id), cells: [s.saleDate, accName(s.accountId), lotNo(s.lotId), qty(s.qty), won(s.unitPrice), won(c.revenue), won(c.cost), won(c.ship), <b key="p" style={{ color: c.profit < 0 ? "var(--owner)" : undefined }}>{won(c.profit)}</b>] };
        })}
        foot={rows.length ? [`합계 ${rows.length}건`, "", "", qty(t.boxes), "", won(t.revenue), won(t.cost), won(t.ship), won(t.profit)] : undefined} />
    </>
  );
}

function ShipView({ sales, shipments, accName, onEdit }: { sales: MdtSale[]; shipments: MdtShipment[]; accName: (id: string) => string; onEdit: (k: MdtKind, id: string) => void }) {
  const fromSales = sales.filter((s) => (s.shipCost || 0) > 0).map((s) => ({ key: "s" + s.id, date: s.saleDate, kind: "판매 출고", acc: accName(s.accountId), what: `${qty(s.qty)}박스`, cost: s.shipCost || 0, open: () => onEdit("sales", s.id) }));
  const other = shipments.map((x) => ({ key: "x" + x.id, date: x.shipDate, kind: x.kind, acc: x.accountId ? accName(x.accountId) : "-", what: x.note, cost: x.cost, open: () => onEdit("shipments", x.id) }));
  const rows = [...fromSales, ...other].sort((a, b) => b.date.localeCompare(a.date));
  const sum = (arr: { cost: number }[]) => arr.reduce((a, x) => a + x.cost, 0);
  const boxes = sales.reduce((a, s) => a + s.qty, 0);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Stat label="배송비 합계" value={won(sum(rows))} sub={`${rows.length}건`} />
        <Stat label="판매 출고 배송비" value={won(sum(fromSales))} sub={boxes ? `박스당 ${won(sum(fromSales) / boxes)}` : "판매 없음"} />
        <Stat label="샘플·반품 등" value={won(sum(other))} sub={`${other.length}건`} />
      </div>
      <Table head={["날짜", "구분", "판매처", "내용", "배송비"]} num={[4]}
        empty="배송비 기록이 없습니다. 판매 기록에 배송비를 적거나, 샘플·반품 배송은 '기타 배송비 추가'로 남겨 주세요."
        rows={rows.map((r) => ({ key: r.key, onClick: r.open, cells: [r.date, r.kind, r.acc, r.what, won(r.cost)] }))} />
    </>
  );
}

/* ---------------- editor ---------------- */
type Field = { key: string; label: string; type: "text" | "number" | "date" | "select" | "account" | "lot" | "textarea"; req?: boolean; opts?: readonly string[]; full?: boolean };
const FIELDS: Record<MdtKind, Field[]> = {
  accounts: [
    { key: "name", label: "판매처명", type: "text", req: true }, { key: "channel", label: "채널", type: "select", opts: MDT_CHANNELS },
    { key: "stage", label: "단계", type: "select", opts: MDT_STAGES }, { key: "dealType", label: "거래 방식", type: "select", opts: ["", "사입", "위탁"] },
    { key: "salePrice", label: "판매가(박스당, VAT 별도, 원)", type: "number" }, { key: "contact", label: "담당자", type: "text" },
    { key: "nextAction", label: "다음 할 일", type: "text" }, { key: "nextDate", label: "할 일 날짜", type: "date" },
    { key: "note", label: "메모(진행 상황)", type: "textarea", full: true },
  ],
  sales: [
    { key: "saleDate", label: "날짜", type: "date", req: true }, { key: "accountId", label: "판매처", type: "account", req: true },
    { key: "lotId", label: "로트(선택)", type: "lot" }, { key: "qty", label: "수량(박스)", type: "number", req: true },
    { key: "unitPrice", label: "판매가(박스당, VAT 별도, 원)", type: "number", req: true }, { key: "shipCost", label: "배송비(원, 수량 입력 시 자동)", type: "number" },
    { key: "note", label: "메모", type: "text", full: true },
  ],
  lots: [
    { key: "lotNo", label: "로트(제조번호)", type: "text", req: true }, { key: "receivedDate", label: "입고일", type: "date" },
    { key: "expiry", label: "유통기한", type: "date", req: true }, { key: "qtyIn", label: "입고 수량(박스)", type: "number", req: true },
    { key: "note", label: "메모(입고처·보관 위치 등)", type: "text", full: true },
  ],
  shipments: [
    { key: "shipDate", label: "날짜", type: "date", req: true }, { key: "kind", label: "구분", type: "select", opts: MDT_SHIP_KINDS },
    { key: "accountId", label: "판매처(선택)", type: "account" }, { key: "cost", label: "배송비(원)", type: "number", req: true },
    { key: "note", label: "내용", type: "text", full: true },
  ],
};
const TITLE: Record<MdtKind, string> = { accounts: "판매처", sales: "판매 기록", lots: "입고 로트", shipments: "기타 배송비" };

function Editor({ kind, rec, accounts, lots, settings, today, pending, onClose, onSave, onDelete }: {
  kind: MdtKind; rec: Record<string, unknown> | MdtAccount | MdtSale | MdtLot | MdtShipment | null; accounts: MdtAccount[]; lots: MdtLot[];
  settings: MdtSettings | null; today: string; pending: boolean; onClose: () => void; onSave: (d: Record<string, unknown>) => void; onDelete: (id: string) => void;
}) {
  const defaults: Record<string, unknown> = kind === "sales" ? { saleDate: today } : kind === "shipments" ? { shipDate: today, kind: "샘플" } : kind === "accounts" ? { stage: "발굴", channel: MDT_CHANNELS[0] } : {};
  const init = Object.fromEntries(FIELDS[kind].map((f) => [f.key, (rec as Record<string, unknown> | null)?.[f.key] ?? defaults[f.key] ?? ""]));
  const [f, setF] = useState<Record<string, unknown>>(init);
  const [shipAuto, setShipAuto] = useState(kind === "sales" && !rec);
  const [armed, setArmed] = useState(false);

  const set = (k: string, v: string) => {
    const next = { ...f, [k]: v };
    if (kind === "sales") {
      if (k === "shipCost") setShipAuto(false);
      if (k === "qty" && shipAuto) { const s = autoShipCost(Number(v), settings); next.shipCost = s == null ? "" : String(s); }
      if (k === "accountId" && !f.unitPrice) { const a = accounts.find((x) => x.id === v); if (a?.salePrice) next.unitPrice = String(a.salePrice); }
    }
    setF(next);
  };
  const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(/,/g, "")));
  const calc = kind === "sales" ? saleCalc({ qty: num(f.qty) ?? 0, unitPrice: num(f.unitPrice) ?? 0, shipCost: num(f.shipCost) }, settings) : null;
  const ct = kind === "sales" ? cartons(num(f.qty) ?? 0, settings) : null;
  const recId = (rec as { id?: string } | null)?.id;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }}
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px 12px", padding: 14, marginBottom: 14, border: "1px dashed var(--accent)", borderRadius: 10, background: "var(--accent-bg)" }}>
      <b style={{ gridColumn: "1 / -1" }}>{TITLE[kind]} {rec ? "수정" : "추가"}</b>
      {FIELDS[kind].map((fd) => (
        <label key={fd.key} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)", gridColumn: fd.full ? "1 / -1" : undefined }}>
          {fd.label}{fd.req ? " *" : ""}
          <FieldInput fd={fd} value={String(f[fd.key] ?? "")} onChange={(v) => set(fd.key, v)} accounts={accounts} lots={lots} />
        </label>
      ))}
      {calc && (
        <div style={{ gridColumn: "1 / -1", fontSize: 13 }}>
          {settings?.supplyPriceIncl ? <>매출 <b>{won(calc.revenue)}</b> − 원가 {won(calc.cost)} − 배송비 {won(calc.ship)}{ct ? ` · ${ct}건(카톤)` : ""} = 이익 <b>{won(calc.profit)}</b> <span className="muted">(VAT 별도)</span></> : <span className="muted">설정에서 공급가를 입력하면 원가·이익이 계산됩니다.</span>}
        </div>
      )}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn primary" type="submit" disabled={pending}>{rec ? "저장" : "추가"}</button>
        <button className="btn" type="button" onClick={onClose}>닫기</button>
        {recId && <button className="btn" type="button" style={{ color: armed ? "#fff" : "var(--owner)", background: armed ? "var(--owner)" : undefined }} onClick={() => (armed ? onDelete(recId) : setArmed(true))}>{armed ? "한 번 더 누르면 삭제" : "삭제"}</button>}
      </div>
    </form>
  );
}

function FieldInput({ fd, value, onChange, accounts, lots }: { fd: Field; value: string; onChange: (v: string) => void; accounts: MdtAccount[]; lots: MdtLot[] }) {
  const id = `mdt-${fd.key}`;
  if (fd.type === "select") return <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>{fd.opts!.map((o) => <option key={o} value={o}>{o || "선택 안 함"}</option>)}</select>;
  if (fd.type === "account") return <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} required={fd.req}><option value="">선택</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
  if (fd.type === "lot") return <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}><option value="">선택 안 함</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.lotNo} ({l.expiry})</option>)}</select>;
  if (fd.type === "textarea") return <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />;
  return <input id={id} type={fd.type === "number" ? "text" : fd.type} inputMode={fd.type === "number" ? "numeric" : undefined} value={value} onChange={(e) => onChange(e.target.value)} required={fd.req} style={inputStyle} />;
}

/* ---------------- settings ---------------- */
function SettingsView({ settings, isOwner, pending, onSave }: { settings: MdtSettings | null; isOwner: boolean; pending: boolean; onSave: (d: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    supplyPriceIncl: settings?.supplyPriceIncl ?? "", vatRate: settings?.vatRate ?? 0.1, retailPrice: settings?.retailPrice ?? "",
    shipPerCarton: settings?.shipPerCarton ?? "", boxesPerCarton: settings?.boxesPerCarton ?? "",
  });
  const ex = supplyExVat(settings);
  const fields: [keyof typeof f, string][] = [["supplyPriceIncl", "공급가 (박스당, VAT 포함, 원)"], ["vatRate", "부가세율"], ["retailPrice", "권장 소비자가 (박스당, 원)"], ["shipPerCarton", "배송비 (1건당, 원)"], ["boxesPerCarton", "1건(카톤)당 박스 수"]];
  return (
    <Section title="가격 설정" hint={isOwner ? "원가·이익·배송비 계산의 기준" : "대표 계정만 바꿀 수 있습니다"}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px 12px" }}>
        {fields.map(([k, label]) => (
          <label key={k} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--ink-2)" }}>{label}
            <input id={`mdt-set-${k}`} value={String(f[k])} disabled={!isOwner} inputMode="decimal" onChange={(e) => setF({ ...f, [k]: e.target.value })} style={inputStyle} />
          </label>
        ))}
        <div style={{ gridColumn: "1 / -1", fontSize: 13 }}>
          {ex != null ? <>원가 계산에 쓰는 공급가(VAT 별도) <b>{won(ex)}</b>{settings?.boxesPerCarton ? ` · ${qty(settings.boxesPerCarton)}박스까지 배송 1건` : ""}</> : <span className="muted">공급가가 아직 없습니다.</span>}
        </div>
        {isOwner && <div style={{ gridColumn: "1 / -1" }}><button className="btn primary" type="submit" disabled={pending}>저장</button></div>}
      </form>
      <h3 style={{ fontSize: 14, margin: "18px 0 6px" }}>계산 규칙</h3>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 3 }}>
        <li>매출 = 판매 수량(박스) × 판매가(박스당, VAT 별도)</li>
        <li>원가 = 판매 수량 × 공급가(VAT 별도). 공급가는 VAT 포함으로 입력하고 ÷ (1 + 부가세율)로 환산, 판매 1건마다 원 단위 반올림</li>
        <li>판매 배송비 = 올림(수량 ÷ 1건당 박스 수) × 건당 배송비. 판매 기록에서 직접 고칠 수 있음</li>
        <li>이익 = 매출 − 원가 − 배송비 / 배송비 합계 = 판매 배송비 + 기타 배송비(샘플·반품 등)</li>
        <li>재고 = 로트 입고 − 그 로트로 기록한 판매 / 유통기한: 지남 · 90일 이내 임박 · 180일 이내 주의 · 그 이후 정상</li>
      </ul>
    </Section>
  );
}

/* ---------------- bits ---------------- */
function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 16, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{title}</h2>{hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
        {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: "12px 14px", background: accent ? "var(--accent)" : undefined, color: accent ? "var(--accent-ink)" : undefined }}>
      <div style={{ fontSize: 12, opacity: accent ? 0.85 : 1, color: accent ? undefined : "var(--ink-2)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, opacity: accent ? 0.85 : 1, color: accent ? undefined : "var(--ink-2)" }}>{sub}</div>}
    </div>
  );
}
function Table({ head, num = [], rows, empty, foot }: { head: string[]; num?: number[]; rows: { key: string; onClick?: () => void; cells: React.ReactNode[] }[]; empty: string; foot?: React.ReactNode[] }) {
  const align = (i: number): "right" | "left" => (num.includes(i) ? "right" : "left");
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
        <thead><tr>{head.map((h, i) => <th key={h} style={{ ...th, textAlign: align(i) }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r) => (
            <tr key={r.key} onClick={r.onClick} style={{ borderTop: "1px solid var(--line)", cursor: r.onClick ? "pointer" : undefined }}>
              {r.cells.map((c, i) => <td key={i} style={{ ...tdS, textAlign: align(i) }}>{c}</td>)}
            </tr>
          )) : <tr><td colSpan={head.length}><Empty>{empty}</Empty></td></tr>}
        </tbody>
        {foot && <tfoot><tr style={{ borderTop: "2px solid var(--line-2)" }}>{foot.map((c, i) => <th key={i} style={{ ...th, textAlign: align(i), color: "var(--ink)" }}>{c}</th>)}</tr></tfoot>}
      </table>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="muted" style={{ padding: "16px 4px", textAlign: "center", fontSize: 13 }}>{children}</div>; }
function StagePill({ stage }: { stage: string }) {
  const tone = stage === "판매중" ? ["var(--ok-bg)", "var(--ok)"] : stage === "입점" ? ["var(--accent-bg)", "var(--ink)"] : stage === "협상" ? ["var(--warn-bg)", "var(--warn)"] : ["var(--surface-2)", "var(--ink-2)"];
  return <span style={{ ...pill, background: tone[0], color: tone[1] }}>{stage}</span>;
}
function DuePill({ d }: { d: number }) {
  const [bg, fg, t] = d < 0 ? ["var(--owner-bg)", "var(--owner)", `${-d}일 지연`] : d === 0 ? ["var(--warn-bg)", "var(--warn)", "오늘"] : ["var(--surface-2)", "var(--ink-2)", `D-${d}`];
  return <span style={{ ...pill, background: bg, color: fg }}>{t}</span>;
}
function ExpiryPill({ d }: { d: number | null }) {
  const lv = expiryLevel(d);
  const map = { none: ["var(--surface-2)", "var(--ink-2)", "미입력"], past: ["var(--owner-bg)", "var(--owner)", `${Math.abs(d ?? 0)}일 지남`], urgent: ["var(--owner-bg)", "var(--owner)", `D-${d} 임박`], watch: ["var(--warn-bg)", "var(--warn)", `D-${d} 주의`], ok: ["var(--ok-bg)", "var(--ok)", `D-${d}`] } as const;
  const [bg, fg, t] = map[lv];
  return <span style={{ ...pill, background: bg, color: fg }}>{t}</span>;
}

const pill: React.CSSProperties = { display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" };
const th: React.CSSProperties = { padding: "8px 8px", fontSize: 12, fontWeight: 500, color: "var(--ink-2)", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "9px 8px", verticalAlign: "top", whiteSpace: "nowrap" };
const inputStyle: React.CSSProperties = { font: "inherit", color: "var(--ink)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 9px", width: "100%", minWidth: 0 };
const selStyle: React.CSSProperties = { ...inputStyle, width: "auto" };
