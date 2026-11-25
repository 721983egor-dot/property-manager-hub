#!/usr/bin/env python3
"""Verify a Polza key with a synthetic request and optionally store server settings."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request
import warnings

API_URL = "https://polza.ai/api/v1"
MODEL = "openai/gpt-5.4-mini"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, help="Create a new private environment file")
    parser.add_argument("--hex", action="store_true", help="Accept a hex-encoded key from the hidden prompt")
    args = parser.parse_args()
    if args.save and args.save.exists():
        raise SystemExit("The configuration file already exists.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            key = getpass.getpass("Polza API key (hidden): ").strip()
        except getpass.GetPassWarning:
            raise SystemExit("Use a terminal with hidden input.") from None
    if args.hex:
        try:
            key = bytes.fromhex(key).decode("ascii")
        except ValueError:
            raise SystemExit("Invalid hex encoding.") from None
    if not re.fullmatch(r"pza_[a-zA-Z0-9_-]{16,}", key):
        raise SystemExit("Unexpected key format.")
    request = urllib.request.Request(
        f"{API_URL}/chat/completions",
        data=json.dumps({
            "model": MODEL,
            "messages": [{"role": "user", "content": "Synthetic health check. Reply with OK."}],
            "max_completion_tokens": 64,
        }).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Polza returned HTTP {error.code}.") from None
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit("Could not reach Polza from this server.") from None
    if not (body["choices"][0]["message"].get("content") or "").strip():
        raise SystemExit("The API returned an empty reply.")
    print("Polza GPT-5.4 mini: API request succeeded.")
    if args.save:
        args.save.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(args.save, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as config:
            config.write(
                "AI_EMPLOYEES_PROVIDER=gateway\n"
                f"AI_EMPLOYEES_GATEWAY_URL={API_URL}\n"
                f"AI_EMPLOYEES_GATEWAY_KEY={key}\n"
                f"AI_EMPLOYEES_OPENAI_MODEL={MODEL}\n"
            )
        print("Created the private environment file.")

if __name__ == "__main__":
    main()
