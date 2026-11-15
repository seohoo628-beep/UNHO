#!/usr/bin/env python3
"""Threads 공식 API로 게시물을 발행한다.

사용 예:
    python3 threads_publish.py --text "본문"
    python3 threads_publish.py --text "본문" --image-url "https://example.com/a.jpg"

토큰은 ~/unho-automation/.env 의 THREADS_ACCESS_TOKEN, THREADS_USER_ID 를 읽는다.
Threads API는 컨테이너 생성 → 발행 2단계로 동작한다.
"""
import argparse
import os
import sys
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv

    load_dotenv(Path.home() / "unho-automation" / ".env")
except ImportError:
    pass

API = "https://graph.threads.net/v1.0"


def die(msg: str) -> None:
    print(f"오류: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Threads 게시물 발행")
    parser.add_argument("--text", required=True, help="게시물 본문 (500자 이내)")
    parser.add_argument("--image-url", help="첨부 이미지의 공개 URL (선택)")
    args = parser.parse_args()

    token = os.environ.get("THREADS_ACCESS_TOKEN")
    user_id = os.environ.get("THREADS_USER_ID")
    if not token or not user_id:
        die("THREADS_ACCESS_TOKEN / THREADS_USER_ID 가 없습니다. ~/unho-automation/.env 를 채우세요.")
    if len(args.text) > 500:
        die(f"본문이 {len(args.text)}자입니다. 500자 이내로 줄이세요.")

    payload = {"access_token": token, "text": args.text}
    if args.image_url:
        payload.update({"media_type": "IMAGE", "image_url": args.image_url})
    else:
        payload["media_type"] = "TEXT"

    r = requests.post(f"{API}/{user_id}/threads", data=payload, timeout=30)
    if not r.ok:
        die(f"컨테이너 생성 실패: {r.status_code} {r.text}")
    creation_id = r.json()["id"]

    # 이미지 처리 시간을 위해 잠시 대기 후 발행
    if args.image_url:
        time.sleep(10)
    r = requests.post(
        f"{API}/{user_id}/threads_publish",
        data={"access_token": token, "creation_id": creation_id},
        timeout=30,
    )
    if not r.ok:
        die(f"발행 실패: {r.status_code} {r.text}")
    post_id = r.json()["id"]
    print(f"발행 완료. 게시물 ID: {post_id}")


if __name__ == "__main__":
    main()
