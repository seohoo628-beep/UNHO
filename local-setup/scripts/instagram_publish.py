#!/usr/bin/env python3
"""Instagram Graph API로 피드 게시물(단일 이미지 또는 카루셀)을 발행한다.

사용 예:
    python3 instagram_publish.py --image-url "https://.../1.jpg" --caption "캡션"
    python3 instagram_publish.py --image-url "https://.../1.jpg" --image-url "https://.../2.jpg" --caption "카드뉴스"

전제: 인스타그램 비즈니스/크리에이터 계정 + Facebook 페이지 연결.
이미지 URL은 반드시 외부에서 접근 가능한 공개 URL이어야 한다.
토큰은 ~/unho-automation/.env 의 IG_ACCESS_TOKEN, IG_USER_ID 를 읽는다.
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

API = "https://graph.facebook.com/v21.0"


def die(msg: str) -> None:
    print(f"오류: {msg}", file=sys.stderr)
    sys.exit(1)


def create_container(user_id: str, token: str, data: dict) -> str:
    r = requests.post(f"{API}/{user_id}/media", data={**data, "access_token": token}, timeout=30)
    if not r.ok:
        die(f"컨테이너 생성 실패: {r.status_code} {r.text}")
    return r.json()["id"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Instagram 피드 발행")
    parser.add_argument("--image-url", action="append", required=True, dest="image_urls",
                        help="공개 이미지 URL (카루셀은 여러 번 지정, 최대 10장)")
    parser.add_argument("--caption", default="", help="캡션 (해시태그 포함 가능)")
    args = parser.parse_args()

    token = os.environ.get("IG_ACCESS_TOKEN")
    user_id = os.environ.get("IG_USER_ID")
    if not token or not user_id:
        die("IG_ACCESS_TOKEN / IG_USER_ID 가 없습니다. ~/unho-automation/.env 를 채우세요.")
    if len(args.image_urls) > 10:
        die("카루셀은 최대 10장입니다.")

    if len(args.image_urls) == 1:
        container = create_container(user_id, token, {
            "image_url": args.image_urls[0],
            "caption": args.caption,
        })
    else:
        children = [
            create_container(user_id, token, {"image_url": url, "is_carousel_item": "true"})
            for url in args.image_urls
        ]
        container = create_container(user_id, token, {
            "media_type": "CAROUSEL",
            "children": ",".join(children),
            "caption": args.caption,
        })

    # 이미지 처리 대기 후 발행
    time.sleep(10)
    r = requests.post(
        f"{API}/{user_id}/media_publish",
        data={"access_token": token, "creation_id": container},
        timeout=30,
    )
    if not r.ok:
        die(f"발행 실패: {r.status_code} {r.text}")
    print(f"발행 완료. 게시물 ID: {r.json()['id']}")


if __name__ == "__main__":
    main()
