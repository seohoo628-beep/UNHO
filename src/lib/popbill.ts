import "server-only";
// 팝빌 API 클라이언트(서버 전용).
// 키 순서: Vercel 환경변수(POPBILL_LINK_ID·POPBILL_SECRET_KEY·POPBILL_IS_TEST) → 설정 화면(app_settings).
// 운영 발행은 is_test 값이 "false"일 때만. 비어 있으면 테스트베드(test.popbill.com, 국세청 미전송).
import { getSetting } from "@/lib/settings";

export type PopbillConfig = { linkId: string; secretKey: string; isTest: boolean; source: "env" | "settings" };

export async function getPopbillConfig(): Promise<PopbillConfig | null> {
  const envId = process.env.POPBILL_LINK_ID?.trim();
  const envKey = process.env.POPBILL_SECRET_KEY?.trim();
  if (envId && envKey) return { linkId: envId, secretKey: envKey, isTest: process.env.POPBILL_IS_TEST !== "false", source: "env" };
  const [id, key, test] = await Promise.all([
    getSetting("popbill_link_id").catch(() => null),
    getSetting("popbill_secret_key").catch(() => null),
    getSetting("popbill_is_test").catch(() => null),
  ]);
  if (!id || !key) return null;
  return { linkId: id.trim(), secretKey: key.trim(), isTest: test !== "false", source: "settings" };
}

type Svc = {
  registIssue: (...a: unknown[]) => void;
  checkCertValidation: (corpNum: string, success: (r: unknown) => void, error: (e: unknown) => void) => void;
  getBalance: (corpNum: string, success: (r: unknown) => void, error: (e: unknown) => void) => void;
  getTaxCertURL: (corpNum: string, userId: string, success: (r: unknown) => void, error: (e: unknown) => void) => void;
  getChargeURL: (corpNum: string, userId: string, success: (r: unknown) => void, error: (e: unknown) => void) => void;
};

function service(cfg: PopbillConfig): Svc {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaxinvoiceService = require("popbill/lib/TaxinvoiceService");
  return new TaxinvoiceService({
    LinkID: cfg.linkId,
    SecretKey: cfg.secretKey,
    IsTest: cfg.isTest,
    IPRestrictOnOff: false, // Vercel은 요청마다 IP가 바뀔 수 있다
    UseStaticIP: false,
    UseLocalTimeYN: true,
    defaultErrorHandler: () => {},
  }) as Svc;
}

export type PopbillError = { code?: number; message?: string };
const toErr = (e: unknown): PopbillError => (e && typeof e === "object" ? (e as PopbillError) : { message: String(e) });

export function describePopbillError(e: PopbillError): string {
  const c = e.code ?? 0;
  const hint =
    c === -11000006 || /회원/.test(e.message ?? "") ? " (팝빌 연동회원 가입이 안 된 사업자입니다. 팝빌 파트너센터에서 해당 법인을 연동회원으로 가입하세요.)"
    : /인증서/.test(e.message ?? "") ? " (팝빌에 이 법인의 공동인증서를 등록해야 합니다.)"
    : /관리번호/.test(e.message ?? "") ? " (이미 발행 요청한 건입니다. 팝빌에서 발행 내역을 확인하세요.)"
    : /포인트|잔액/.test(e.message ?? "") ? " (팝빌 포인트를 충전하세요.)"
    : "";
  return `${e.message ?? "팝빌 오류"}${c ? ` [${c}]` : ""}${hint}`;
}

export async function registIssue(cfg: PopbillConfig, corpNum: string, invoice: Record<string, unknown>, memo: string) {
  const svc = service(cfg);
  return new Promise<{ code: number; message: string; ntsConfirmNum?: string }>((resolve, reject) => {
    svc.registIssue(corpNum, invoice, false, false, memo, "", "", "", (r: unknown) => resolve(r as never), (e: unknown) => reject(toErr(e)));
  });
}

/** 연결 확인: 인증서 유효성(1이면 정상) + 잔여 포인트 */
export async function checkPopbill(cfg: PopbillConfig, corpNum: string): Promise<{ ok: boolean; message: string }> {
  const svc = service(cfg);
  try {
    const balance = await new Promise<number>((res, rej) => svc.getBalance(corpNum, (r) => res(Number(r)), (e) => rej(toErr(e))));
    try {
      await new Promise((res, rej) => svc.checkCertValidation(corpNum, res, (e) => rej(toErr(e))));
      return { ok: true, message: `연결 정상 · 인증서 유효 · 잔여 포인트 ${balance.toLocaleString("ko-KR")}` };
    } catch (e) {
      return { ok: false, message: `연결은 됐지만 인증서 확인 실패: ${describePopbillError(e as PopbillError)}` };
    }
  } catch (e) {
    return { ok: false, message: describePopbillError(e as PopbillError) };
  }
}

/** 팝빌 팝업 URL(30초 유효): 공동인증서 등록 / 포인트 충전 */
export async function popbillUrl(cfg: PopbillConfig, corpNum: string, kind: "cert" | "charge"): Promise<string> {
  const svc = service(cfg);
  return new Promise<string>((resolve, reject) => {
    const ok = (u: unknown) => resolve(String(u));
    const no = (e: unknown) => reject(toErr(e));
    if (kind === "cert") svc.getTaxCertURL(corpNum, "", ok, no);
    else svc.getChargeURL(corpNum, "", ok, no);
  });
}
