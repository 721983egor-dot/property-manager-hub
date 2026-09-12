#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import json
import urllib.request

KEYS = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "TELEGRAM_BOT_TOKEN",
    "CRON_SECRET",
    "LOVABLE_CRON_SECRET",  # legacy alias
    "LOVABLE_API_KEY",      # must be unused
]


def check_file(path: str) -> None:
    p = Path(path)
    if not p.exists():
        print(f"FILE {path}: missing")
        return
    text = p.read_text(errors="ignore")
    print(f"FILE {path}:")
    for k in KEYS:
        m = re.search(rf"^{re.escape(k)}=(.*)$", text, re.M)
        if not m:
            print(f"  {k}=missing")
            continue
        val = m.group(1).strip().strip("'\"")
        print(f"  {k}={'SET(len=' + str(len(val)) + ')' if val else 'EMPTY'}")


for f in [".env", "../.env", "/opt/rm-os/.env", "/opt/rm-os/repo/.env"]:
    check_file(f)

comp = Path("docker-compose.yml").read_text()
print("COMPOSE refs:")
for k in KEYS:
    if k in comp:
        print(" ", k, "referenced")

print("CONTAINER app env:")
out = subprocess.check_output(["docker", "exec", "deploy-app-1", "env"], text=True)
found = False
for line in out.splitlines():
    for k in KEYS:
        if line.startswith(k + "="):
            found = True
            v = line.split("=", 1)[1]
            print(f"  {k}={'SET(len=' + str(len(v)) + ')' if v else 'EMPTY'}")
if not found:
    print("  (none of the AI keys present in container)")

# webhook
bot = None
for line in out.splitlines():
    if line.startswith("TELEGRAM_BOT_TOKEN=") or line.startswith("TELEGRAM_API_KEY="):
        bot = line.split("=", 1)[1].strip()
        if bot:
            break
if not bot:
    for path in [".env", "../.env", "/opt/rm-os/.env"]:
        p = Path(path)
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN=") or line.startswith("TELEGRAM_API_KEY="):
                bot = line.split("=", 1)[1].strip().strip("'\"")
                break
        if bot:
            break

if not bot:
    print("WEBHOOK: no telegram token available")
else:
    url = f"https://api.telegram.org/bot{bot}/getWebhookInfo"
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    result = data.get("result", {})
    print("WEBHOOK_URL=", result.get("url", ""))
    print("pending=", result.get("pending_update_count"))
    print("last_error=", result.get("last_error_message"))
