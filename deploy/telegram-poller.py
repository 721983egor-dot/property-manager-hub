#!/usr/bin/env python3
"""Long-poll Telegram updates and forward them to the local RM OS webhook.

Needed when Telegram cannot open inbound HTTPS to the server (common on RU hosts),
while outbound calls to api.telegram.org still work.

For voice/audio/video_note: downloads the file here (with retries) and attaches
base64 under `_rm_os_media`, so the app does not need a second hop to Telegram
(Node fetch to api.telegram.org often times out on this host).
"""

from __future__ import annotations

import hashlib
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
WEBHOOK_URL = os.environ.get(
    "TELEGRAM_FORWARD_URL",
    "http://app:3000/api/public/telegram/webhook",
).strip()
API = f"https://api.telegram.org/bot{TOKEN}"
FILE_API = f"https://api.telegram.org/file/bot{TOKEN}"


def die(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)
    raise SystemExit(1)


def secret_for(token: str) -> str:
    digest = hashlib.sha256(f"telegram-webhook:{token}".encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def http_json(
    url: str,
    payload: dict | None = None,
    headers: dict | None = None,
    timeout: int = 60,
    retries: int = 4,
):
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            data = None if payload is None else json.dumps(payload).encode()
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json", **(headers or {})},
                method="POST" if payload is not None else "GET",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            last_err = e
            time.sleep(min(2**attempt, 8))
    raise last_err or RuntimeError("http_json failed")


def http_bytes(url: str, timeout: int = 90, retries: int = 4) -> bytes:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:
            last_err = e
            time.sleep(min(2**attempt, 8))
    raise last_err or RuntimeError("http_bytes failed")


def attach_media(upd: dict) -> None:
    """If update has voice/audio/video_note — download and embed as `_rm_os_media`."""
    msg = upd.get("message") or upd.get("edited_message")
    if not isinstance(msg, dict):
        return
    media = msg.get("voice") or msg.get("audio") or msg.get("video_note")
    if not isinstance(media, dict):
        return
    file_id = media.get("file_id")
    if not file_id:
        return
    try:
        meta = http_json(f"{API}/getFile", {"file_id": file_id}, timeout=45)
        if not meta.get("ok"):
            print(f"getFile not ok: {meta}", flush=True)
            return
        path = (meta.get("result") or {}).get("file_path")
        if not path:
            print("getFile missing file_path", flush=True)
            return
        raw = http_bytes(f"{FILE_API}/{path}", timeout=120)
        # Cap ~20 MB so webhook JSON stays reasonable.
        if len(raw) > 20 * 1024 * 1024:
            print(f"media too large ({len(raw)} bytes), skip attach", flush=True)
            return
        upd["_rm_os_media"] = {
            "file_id": file_id,
            "path": path,
            "base64": base64.b64encode(raw).decode("ascii"),
            "bytes": len(raw),
        }
        print(f"attached media path={path} bytes={len(raw)}", flush=True)
    except Exception as e:
        print(f"attach media failed: {e}", flush=True)


def main() -> None:
    if not TOKEN or ":" not in TOKEN:
        die("TELEGRAM_BOT_TOKEN missing")

    secret = secret_for(TOKEN)
    print(f"poller start forward={WEBHOOK_URL}", flush=True)

    # Ensure webhook is cleared so getUpdates works.
    try:
        http_json(f"{API}/deleteWebhook", {"drop_pending_updates": False}, timeout=30)
        print("webhook deleted", flush=True)
    except Exception as e:
        print(f"deleteWebhook warn: {e}", flush=True)

    offset = 0
    while True:
        try:
            body = http_json(
                f"{API}/getUpdates",
                {
                    "timeout": 50,
                    "offset": offset,
                    "allowed_updates": ["message", "edited_message", "callback_query"],
                },
                timeout=70,
            )
            if not body.get("ok"):
                print(f"getUpdates not ok: {body}", flush=True)
                time.sleep(3)
                continue
            for upd in body.get("result") or []:
                uid = upd.get("update_id")
                if not isinstance(uid, int):
                    continue
                offset = uid + 1
                attach_media(upd)
                try:
                    http_json(
                        WEBHOOK_URL,
                        upd,
                        headers={"X-Telegram-Bot-Api-Secret-Token": secret},
                        timeout=180,
                    )
                    print(f"forwarded update_id={uid}", flush=True)
                except Exception as e:
                    print(f"forward failed update_id={uid}: {e}", flush=True)
                    time.sleep(1)
        except urllib.error.HTTPError as e:
            print(f"http error: {e.code} {e.read()[:300]}", flush=True)
            time.sleep(5)
        except Exception as e:
            print(f"poll error: {e}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
