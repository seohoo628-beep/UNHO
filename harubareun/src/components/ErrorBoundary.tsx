"use client";

import React from "react";

// 클라이언트 예외로 전체 화면이 흰색으로 죽는 것을 막는 경계.
// 위젯 감싸기용(fallback 기본 null → 위젯만 사라지고 페이지는 유지).
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    // 콘솔에만 남기고 앱은 계속 동작.
    try { console.error("[ErrorBoundary]", err); } catch { /* noop */ }
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
