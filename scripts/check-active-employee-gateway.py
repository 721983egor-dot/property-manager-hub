#!/usr/bin/env python3
"""Stage the gateway integration without changing unrelated production source."""
from pathlib import Path
import argparse
import json
import os
import re
import shutil
import subprocess
import urllib.request

ROOT = Path("/opt/rm-os-recovery")
SOURCE = ROOT / "telegram/selection-20261120"
CANDIDATE = ROOT / "ai-employees-20261125/polza-gateway"
ENVIRONMENT = Path("/root/.config/rmos/polza.env")
ROOT_URL = "https://raw.githubusercontent.com/721983egor-dot/property-manager-hub"
PRODUCTION = ROOT / "beget-production-20261115"
IMAGE = "rmos-beget-prod-app:employee-polza-20261125"

def deployed_compose():
    info = json.loads(subprocess.check_output(["docker", "inspect", "rmos-beget-prod-app-1"]))[0]
    if info["Config"]["Image"] != "rmos-beget-prod-app:selection-public-20261120":
        raise SystemExit("The active image has changed.")
    return [
        "docker", "compose", "-p", "rmos-beget-prod",
        "--env-file", str(PRODUCTION / "production.env"),
        "-f", str(PRODUCTION / "production.yml"),
    ]

def stage(revision):
    if not re.fullmatch("[a-f0-9]{40}", revision):
        raise SystemExit("Expected exact release revision.")
    gateway_path = Path("src/lib/ai-gateway.server.ts")
    service_path = Path("src/lib/ai-manager/service.server.ts")
    with urllib.request.urlopen(f"{ROOT_URL}/{revision}/{gateway_path}", timeout=25) as response:
        new_gateway = response.read(50_000).decode()
    current_gateway = (SOURCE / gateway_path).read_text()
    common_prefix, suffix = new_gateway.split("type EmployeeModelSetup =", 1)
    if current_gateway.strip() != common_prefix.strip():
        raise SystemExit("Production gateway differs from the reviewed shared assistant implementation.")
    service = (SOURCE / service_path).read_text()
    if service.count("resolveAssistantModel") != 2:
        raise SystemExit("Unexpected model integration in the production service.")
    shutil.copytree(
        SOURCE, CANDIDATE,
        ignore=shutil.ignore_patterns(".git", ".env*", "node_modules", ".output", "dist"),
    )
    (CANDIDATE / gateway_path).write_text(current_gateway.rstrip() + "\n\ntype EmployeeModelSetup =" + suffix)
    (CANDIDATE / service_path).write_text(service.replace("resolveAssistantModel", "resolveEmployeeModel"))
    print("Staged two source files for the active build.", flush=True)

def build(compose):
    override = CANDIDATE.parent / "polza-employee-overlay.json"
    if not ENVIRONMENT.is_file():
        raise SystemExit("Private model settings are missing.")
    override.write_text(json.dumps({"services": {"app": {
        "build": {"context": str(CANDIDATE)},
        "image": IMAGE,
        "env_file": [str(ENVIRONMENT)],
    }}}))
    command = compose + ["-f", str(override)]
    config = json.loads(subprocess.check_output(command + ["config", "--format", "json"]))
    app = config["services"]["app"]
    if app["image"] != IMAGE or app["build"]["context"] != str(CANDIDATE):
        raise SystemExit("Candidate build is not isolated.")
    if app["environment"].get("AI_EMPLOYEES_PROVIDER") != "gateway":
        raise SystemExit("The gateway settings did not load into the candidate.")
    with (CANDIDATE.parent / "polza-build.log").open("wb") as log:
        subprocess.run(command + ["build", "app"], stdout=log, stderr=subprocess.STDOUT, check=True)
    print("Candidate image built. Active service is still running its original image.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    parser.add_argument("--build", action="store_true")
    args = parser.parse_args()
    if os.getuid() != 0:
        raise SystemExit("Run on the application server as the deployment user.")
    compose = deployed_compose()
    stage(args.revision)
    if args.build:
        build(compose)

if __name__ == "__main__":
    main()
