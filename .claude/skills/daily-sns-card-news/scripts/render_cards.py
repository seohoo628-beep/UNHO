#!/usr/bin/env python3
"""daily-sns-card-news — 카드 HTML을 PNG로 렌더.

작업 폴더의 card-*.html(또는 지정한 단일 파일)을 헤드리스 Chromium으로
1080×1350 PNG 스크린샷을 뜬다. HTML 안의 {{FONTS_DIR}} 토큰은 repo 번들
Pretendard 폰트 디렉터리의 file:// 경로로 치환된다.

Usage:
    python3 render_cards.py <html파일 또는 폴더> [--out DIR] [--size WxH]
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
FONTS_DIR = REPO_ROOT / ".claude" / "skills" / "ppt-master" / "assets" / "fonts" / "Pretendard"

CHROMIUM_CANDIDATES = (
    os.environ.get("CHROMIUM_BIN", ""),
    "/opt/pw-browsers/chromium",
    shutil.which("chromium") or "",
    shutil.which("chromium-browser") or "",
    shutil.which("google-chrome") or "",
)


def find_chromium() -> str:
    for cand in CHROMIUM_CANDIDATES:
        if cand and Path(cand).exists():
            return cand
    sys.exit("Chromium 실행 파일을 찾지 못했습니다. CHROMIUM_BIN 환경변수로 지정하세요.")


def render_one(chromium: str, html: Path, out_png: Path, width: int, height: int) -> None:
    text = html.read_text(encoding="utf-8")
    text = text.replace("{{FONTS_DIR}}", FONTS_DIR.as_uri())
    with tempfile.TemporaryDirectory(prefix="card-render-") as tmp:
        tmp_html = Path(tmp) / html.name
        tmp_html.write_text(text, encoding="utf-8")
        cmd = [
            chromium,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={width},{height}",
            f"--screenshot={out_png}",
            tmp_html.as_uri(),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0 or not out_png.exists() or out_png.stat().st_size == 0:
        sys.exit(f"렌더 실패: {html.name}\n{proc.stderr.strip()[-2000:]}")
    print(f"  {html.name} -> {out_png} ({out_png.stat().st_size:,} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser(description="카드 HTML → PNG 렌더")
    ap.add_argument("target", help="card-*.html이 있는 폴더 또는 단일 HTML 파일")
    ap.add_argument("--out", help="PNG 출력 폴더 (기본: <폴더>/cards)")
    ap.add_argument("--size", default="1080x1350", help="WxH (기본 1080x1350)")
    args = ap.parse_args()

    width, height = (int(v) for v in args.size.lower().split("x"))
    target = Path(args.target)
    if target.is_dir():
        htmls = sorted(target.glob("card-*.html"))
        if not htmls:
            sys.exit(f"{target} 에 card-*.html 이 없습니다.")
        out_dir = Path(args.out) if args.out else target / "cards"
    elif target.is_file():
        htmls = [target]
        out_dir = Path(args.out) if args.out else target.parent / "cards"
    else:
        sys.exit(f"경로가 없습니다: {target}")

    out_dir.mkdir(parents=True, exist_ok=True)
    chromium = find_chromium()
    print(f"렌더 시작: {len(htmls)}장, {width}x{height}, chromium={chromium}")
    for html in htmls:
        render_one(chromium, html, out_dir / f"{html.stem}.png", width, height)
    print("렌더 완료.")


if __name__ == "__main__":
    main()
