#!/usr/bin/env python3
"""daily-sns-card-news — 스레드·인스타그램 발행 스크립트.

작업 폴더(threads.txt, caption.txt, cards/*.png)를 읽어 Threads API와
Instagram Graph API로 발행한다. 기본은 dry-run이며 --live일 때만 실제
API를 호출한다. 토큰은 환경변수로만 받는다(SKILL.md 표 참조).

인스타그램은 공개 이미지 URL이 필요하다:
  - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY가 있으면 sns-cards 버킷에
    업로드해 공개 URL을 생성한다.
  - 또는 --image-urls 로 카드 순서대로 URL을 직접 넘긴다.

Usage:
    python3 publish_sns.py <작업폴더> --account <account> [--live]
        [--image-urls URL ...] [--skip-instagram] [--skip-threads] [--force]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

GRAPH = "https://graph.facebook.com/v23.0"
THREADS = "https://graph.threads.net/v1.0"
BUCKET = "sns-cards"
THREADS_TEXT_LIMIT = 500


def env_token(base: str, account: str) -> str:
    scoped = f"{base}__{account.upper().replace('-', '_')}"
    return os.environ.get(scoped) or os.environ.get(base) or ""


def api(method: str, url: str, params: dict | None = None, data: bytes | None = None,
        headers: dict | None = None) -> dict:
    if params:
        query = urllib.parse.urlencode(params)
        if method == "GET":
            url = f"{url}?{query}"
        else:
            data = query.encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"API 오류 {e.code} {url.split('?')[0]}: {e.read().decode()[:800]}")
    return json.loads(body) if body else {}


# ---------- Supabase storage ----------

def supabase_upload(pngs: list[Path], date: str, account: str) -> list[str]:
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        return []
    auth = {"Authorization": f"Bearer {key}", "apikey": key}
    # 버킷이 없으면 공개 버킷으로 생성(이미 있으면 409 → 무시)
    req = urllib.request.Request(
        f"{base}/storage/v1/bucket", method="POST",
        data=json.dumps({"name": BUCKET, "public": True}).encode(),
        headers={**auth, "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        if e.code not in (400, 409):
            sys.exit(f"Supabase 버킷 확인 실패 {e.code}: {e.read().decode()[:400]}")
    urls = []
    for png in pngs:
        path = f"{date}/{account}/{png.name}"
        ctype = mimetypes.guess_type(png.name)[0] or "image/png"
        req = urllib.request.Request(
            f"{base}/storage/v1/object/{BUCKET}/{path}", method="POST",
            data=png.read_bytes(),
            headers={**auth, "Content-Type": ctype, "x-upsert": "true"})
        try:
            urllib.request.urlopen(req, timeout=120).read()
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase 업로드 실패 {png.name} {e.code}: {e.read().decode()[:400]}")
        urls.append(f"{base}/storage/v1/object/public/{BUCKET}/{path}")
    return urls


# ---------- Instagram ----------

def wait_container(container_id: str, token: str) -> None:
    for _ in range(30):
        status = api("GET", f"{GRAPH}/{container_id}",
                     {"fields": "status_code", "access_token": token})
        code = status.get("status_code")
        if code == "FINISHED":
            return
        if code == "ERROR":
            sys.exit(f"인스타 컨테이너 처리 실패: {status}")
        time.sleep(2)
    sys.exit("인스타 컨테이너 처리 대기 시간 초과")


def publish_instagram(image_urls: list[str], caption: str, account: str) -> str:
    token = env_token("IG_ACCESS_TOKEN", account)
    user_id = env_token("IG_USER_ID", account)
    if not token or not user_id:
        sys.exit("IG_ACCESS_TOKEN / IG_USER_ID 미설정 — 드래프트 모드로 전환하세요.")
    if len(image_urls) == 1:
        container = api("POST", f"{GRAPH}/{user_id}/media",
                        {"image_url": image_urls[0], "caption": caption,
                         "access_token": token})["id"]
    else:
        children = []
        for url in image_urls:
            child = api("POST", f"{GRAPH}/{user_id}/media",
                        {"image_url": url, "is_carousel_item": "true",
                         "access_token": token})["id"]
            children.append(child)
        container = api("POST", f"{GRAPH}/{user_id}/media",
                        {"media_type": "CAROUSEL", "children": ",".join(children),
                         "caption": caption, "access_token": token})["id"]
    wait_container(container, token)
    return api("POST", f"{GRAPH}/{user_id}/media_publish",
               {"creation_id": container, "access_token": token})["id"]


# ---------- Threads ----------

def publish_threads(text: str, image_url: str | None, account: str) -> str:
    token = env_token("THREADS_ACCESS_TOKEN", account)
    user_id = env_token("THREADS_USER_ID", account)
    if not token or not user_id:
        sys.exit("THREADS_ACCESS_TOKEN / THREADS_USER_ID 미설정 — 드래프트 모드로 전환하세요.")
    params = {"text": text, "access_token": token}
    if image_url:
        params.update({"media_type": "IMAGE", "image_url": image_url})
    else:
        params["media_type"] = "TEXT"
    creation = api("POST", f"{THREADS}/{user_id}/threads", params)["id"]
    time.sleep(3)  # Threads 권장: 컨테이너 생성 직후 발행 금지
    return api("POST", f"{THREADS}/{user_id}/threads_publish",
               {"creation_id": creation, "access_token": token})["id"]


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser(description="스레드·인스타 카드뉴스 발행")
    ap.add_argument("workdir", help="projects/sns/YYYY-MM-DD/<account>/ 작업 폴더")
    ap.add_argument("--account", required=True)
    ap.add_argument("--live", action="store_true", help="실제 발행 (기본 dry-run)")
    ap.add_argument("--image-urls", nargs="*", default=None,
                    help="카드 순서대로 공개 이미지 URL (Supabase 업로드 대신)")
    ap.add_argument("--skip-instagram", action="store_true")
    ap.add_argument("--skip-threads", action="store_true")
    ap.add_argument("--force", action="store_true", help="당일 중복 발행 가드 무시")
    args = ap.parse_args()

    workdir = Path(args.workdir)
    threads_file = workdir / "threads.txt"
    caption_file = workdir / "caption.txt"
    pngs = sorted((workdir / "cards").glob("card-*.png"))
    log_file = workdir / "publish-log.json"

    problems = []
    if not args.skip_threads and not threads_file.exists():
        problems.append("threads.txt 없음")
    if not args.skip_instagram:
        if not caption_file.exists():
            problems.append("caption.txt 없음")
        if not pngs:
            problems.append("cards/card-*.png 없음")
    if problems:
        sys.exit("발행 불가: " + ", ".join(problems))

    threads_text = threads_file.read_text(encoding="utf-8").strip() if threads_file.exists() else ""
    caption = caption_file.read_text(encoding="utf-8").strip() if caption_file.exists() else ""
    if threads_text and len(threads_text) > THREADS_TEXT_LIMIT:
        sys.exit(f"스레드 텍스트 {len(threads_text)}자 — {THREADS_TEXT_LIMIT}자 이내로 줄이세요.")

    if log_file.exists() and args.live and not args.force:
        prev = json.loads(log_file.read_text(encoding="utf-8"))
        if prev.get("mode") == "live" and (prev.get("instagram_id") or prev.get("threads_id")):
            sys.exit("이미 오늘 live 발행 기록이 있습니다. 재발행하려면 --force.")

    date = workdir.parent.name if workdir.parent.name[:2] == "20" else dt.date.today().isoformat()
    print(f"계정={args.account} 카드={len(pngs)}장 "
          f"스레드={len(threads_text)}자 캡션={len(caption)}자 mode={'live' if args.live else 'dry-run'}")

    if not args.live:
        print("dry-run: 페이로드 검증만 수행. 실제 발행은 --live.")
        for p in pngs:
            print(f"  [ig] {p.name} ({p.stat().st_size:,} bytes)")
        print(f"  [threads] {threads_text[:80]}...")
        return

    image_urls = args.image_urls
    if not args.skip_instagram and not image_urls:
        image_urls = supabase_upload(pngs, date, args.account)
        if not image_urls:
            sys.exit("공개 이미지 URL이 없습니다. SUPABASE_URL/SERVICE_ROLE_KEY 설정 "
                     "또는 --image-urls 사용. (스레드만 발행하려면 --skip-instagram)")

    result = {"date": date, "account": args.account, "mode": "live",
              "published_at": dt.datetime.now(dt.timezone.utc).isoformat(),
              "image_urls": image_urls or [], "instagram_id": None, "threads_id": None}

    if not args.skip_instagram:
        result["instagram_id"] = publish_instagram(image_urls, caption, args.account)
        print(f"인스타그램 발행 완료: {result['instagram_id']}")
    if not args.skip_threads:
        cover = (image_urls or [None])[0]
        result["threads_id"] = publish_threads(threads_text, cover, args.account)
        print(f"스레드 발행 완료: {result['threads_id']}")

    log_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"로그 기록: {log_file}")


if __name__ == "__main__":
    main()
