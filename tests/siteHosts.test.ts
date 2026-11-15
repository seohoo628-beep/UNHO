import { test } from "node:test";
import assert from "node:assert/strict";
import { hostLabel, isMudangteaHost, isMudangteaSitePath } from "../src/lib/siteHosts";

test("무당티 전용 도메인 판별", () => {
  assert.equal(hostLabel("Mudangtea.example.com:443"), "mudangtea");
  assert.equal(isMudangteaHost("mudangtea.example.com"), true);
  assert.equal(isMudangteaHost("mudang.example.com"), true);
  assert.equal(isMudangteaHost("unho-mudangtea.vercel.app"), true);
  assert.equal(isMudangteaHost("unho-ops.vercel.app"), false);
  assert.equal(isMudangteaHost("sinmi.example.com"), false);
  assert.equal(isMudangteaHost(null), false);
  // 브랜치 프리뷰는 브랜치 이름에 mudang 이 있어도 메인 앱으로 동작
  assert.equal(isMudangteaHost("unho-ops-git-claude-mudangti-dashboard-abc.vercel.app"), false);
});

test("전용 도메인에서 열어 두는 경로", () => {
  for (const p of ["/mudangtea", "/mudangtea/x", "/login", "/auth/callback", "/api/auth/session-link", "/store-manifest/mudangtea", "/icons/icon-192.png", "/sw.js"]) {
    assert.equal(isMudangteaSitePath(p), true, p);
  }
  for (const p of ["/", "/hub", "/ceo-todos", "/pnl", "/mudangteax", "/sinmi"]) {
    assert.equal(isMudangteaSitePath(p), false, p);
  }
});
