#!/usr/bin/env python3
"""Stage and check an AI employee candidate using the currently deployed source."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request

ROOT = Path("/opt/rm-os-recovery")
SOURCE = ROOT / "telegram/selection-20261120"
STAGING = ROOT / "ai-employees-20261125"
BASE = "8229ee519215d0dd24a243afbd290a42f23d5f19"
REMOTE = "https://github.com/721983egor-dot/property-manager-hub"
APP = "rmos-beget-prod-app-1"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    args = parser.parse_args()
    if not re.fullmatch("[a-f0-9]{40}", args.revision):
        raise SystemExit("Provide the exact release revision.")
    active = json.loads(subprocess.check_output(["docker", "inspect", APP]))[0]
    image = active["Config"]["Image"]
    if image != "rmos-beget-prod-app:selection-public-20261120":
        raise SystemExit("Active image changed. Check its source before staging.")
    labels = active["Config"]["Labels"]
    print("Active compose files:", labels.get("com.docker.compose.project.config_files"), flush=True)
    print("Active compose directory:", labels.get("com.docker.compose.project.working_dir"), flush=True)
    candidate = STAGING / args.revision[:12]
    if not (SOURCE / "deploy/Dockerfile").is_file():
        raise SystemExit("Source for the active image is missing.")
    with urllib.request.urlopen(f"{REMOTE}/compare/{BASE}...{args.revision}.diff", timeout=30) as response:
        diff = response.read(1_000_000)
    if not diff.startswith(b"diff --git "):
        raise SystemExit("The release diff could not be read.")
    allowed_prefixes = (b"src/", b"supabase/migrations/")
    parts = re.split(rb"(?=^diff --git )", diff, flags=re.M)
    selected = [part for part in parts if any(part.startswith(b"diff --git a/" + prefix)
                                               for prefix in allowed_prefixes)]
    if len(selected) < 20:
        raise SystemExit("The release diff is incomplete.")
    shutil.copytree(
        SOURCE, candidate,
        ignore=shutil.ignore_patterns(".git", ".env*", "node_modules", ".output", "dist"),
    )
    print("Candidate:", candidate, flush=True)
    patch = b"".join(selected)
    result = subprocess.run(["git", "apply", "--check", "-"], cwd=candidate, input=patch)
    if result.returncode:
        raise SystemExit("Active source differs from the release base. Candidate left for review.")
    subprocess.run(["git", "apply", "-"], cwd=candidate, input=patch, check=True)
    print("Candidate staged. Running service was not changed.")

if __name__ == "__main__":
    main()
