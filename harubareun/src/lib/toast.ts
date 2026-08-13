// 어디서든 호출 가능한 전역 토스트. 커스텀 이벤트로 Toaster에 전달한다.
export type ToastType = "ok" | "err" | "info";

export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, type } }));
}
