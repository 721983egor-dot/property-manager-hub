#!/usr/bin/env python3
"""Build and activate the private staff test chat without changing public inbox behavior."""
import argparse
import copy
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re
import shutil
import subprocess
import time
import urllib.request
from urllib.parse import unquote, urlsplit

ROOT = Path("/opt/rm-os-recovery")
BASE = ROOT / "beget-production-20261115"
PRODUCTION = BASE / "production.yml"
WORK = ROOT / "ai-employees-20261125"
SOURCE = WORK / "marina-marketplaces-v2"
CANDIDATE = WORK / "private-employee-test"
OVERLAY = WORK / "private-employee-test-overlay.json"
BACKUP = BASE / "production.before-private-employee-test.yml"
PENDING = BASE / "production.private-employee-test-candidate.yml"
OLD = "rmos-beget-prod-app:marina-marketplaces-20261125"
NEW = "rmos-beget-prod-app:private-employee-test-20261125"
CONTAINER = "rmos-beget-prod-app-1"
HEALTH = "http://127.0.0.1:64197/api/public/health"
COMPOSE = ["docker", "compose", "-p", "rmos-beget-prod", "--env-file", str(BASE / "production.env")]

MIGRATIONS = (
    ("ai_support_playbook", "supabase/migrations/20261125130000_ai_support_playbook.sql"),
    ("ai_employee_skill_usage", "supabase/migrations/20261125140000_ai_employee_skill_usage.sql"),
    ("private_employee_test_dialogs", "supabase/migrations/20261125170000_private_employee_test_chat.sql"),
)

def output(cmd):
    return subprocess.check_output(cmd, text=True)

def config(*files):
    cmd = COMPOSE + [part for path in files for part in ("-f", str(path))]
    return json.loads(output(cmd + ["config", "--format", "json"]))

def live():
    return json.loads(output(["docker", "inspect", CONTAINER]))[0]

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError("Unexpected source layout near " + old.splitlines()[0][:75])
    return text.replace(old, new, 1)

def build(revision):
    if not re.fullmatch("[a-f0-9]{40}", revision) or live()["Config"]["Image"] != OLD:
        raise RuntimeError("The deployed image or release revision is different.")
    original = config(PRODUCTION)["services"]["app"]
    if original["build"]["context"] != str(SOURCE) or original["image"] != OLD:
        raise RuntimeError("The deployed build source changed.")
    raw = f"https://raw.githubusercontent.com/721983egor-dot/property-manager-hub/{revision}/"
    def fetch(path):
        with urllib.request.urlopen(raw + path, timeout=25) as response:
            return response.read(300_000).decode()
    shutil.copytree(SOURCE, CANDIDATE,
                    ignore=shutil.ignore_patterns(".git", ".env*", "node_modules", ".output", "dist"))
    for path in (
        "src/components/PrivateEmployeeTestChat.tsx",
        "src/components/MarinaShowingLearning.tsx",
        "src/lib/ai-manager/private-employee-chat.ts",
        "src/lib/ai-manager/private-employee-chat.server.ts",
        "src/lib/ai-manager/private-employee-chat.functions.ts",
        "src/lib/ai-manager/support-playbook.server.ts",
        "src/lib/ai-manager/employee-tests.ts",
        "src/lib/ai-manager/employee-skills.server.ts",
        "src/lib/ai-manager/inbox.ts",
        *[path for _, path in MIGRATIONS],
    ):
        (CANDIDATE / path).write_text(fetch(path))

    def edit(path, transform):
        file = CANDIDATE / path
        file.write_text(transform(file.read_text()))

    tool_reference = json.loads(fetch("scripts/private-test-assistant-tools.json"))

    def register_tools(source):
        source = 'import { privateDialogVersion, privateEmployeeInput } from "./private-employee-chat";\n' + source
        for declaration, name in (
            ("managerReadTools()", "listPrivateEmployeeTestDialogs"),
            ("managerMutateTools(ctx: AssistantToolContext)", "proposeApprovePrivateTestRule"),
        ):
            marker = f"export function {declaration} {{\n  return {{\n"
            source = replace_once(source, marker, marker + tool_reference[name])
        return source

    edit("src/lib/ai-manager/tools.server.ts", register_tools)
    executor_marker = "export const ASSISTANT_EXECUTORS: Record<string, Executor> = {\n"
    edit("src/lib/ai/executors.server.ts", lambda source: replace_once(source, executor_marker,
        executor_marker + '  approvePrivateEmployeeRule: async (input) =>\n'
        '    (await import("@/lib/ai-manager/private-employee-chat.server")).approvePrivateEmployeeRule(input),\n'))

    OVERLAY.write_text(json.dumps({"services": {"app": {
        "image": NEW, "build": {"context": str(CANDIDATE)},
        "environment": {"MESSENGER_MARINA_TEST_ENABLED": "false"},
    }}}))
    cmd = COMPOSE + ["-f", str(PRODUCTION), "-f", str(OVERLAY), "build", "app"]
    print("Building the private staff chat candidate.", flush=True)
    with (WORK / "private-employee-test-build.log").open("wb") as log:
        subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
    print("Candidate built. Production is still on the prior version.", flush=True)

def migrate():
    rest, postgres = json.loads(output(["docker", "inspect",
        "rmos-beget-prod-rest-1", "rmos-beget-prod-db-1"]))
    rest_env = dict(entry.split("=", 1) for entry in rest["Config"]["Env"])
    uri = urlsplit(rest_env.get("PGRST_DB_URI", ""))
    database = unquote(uri.path.removeprefix("/"))
    aliases = {"rmos-beget-prod-db-1"}
    for network in postgres["NetworkSettings"]["Networks"].values():
        aliases.update(network.get("Aliases") or [])
        aliases.add(network.get("IPAddress", ""))
    if uri.hostname not in aliases or not re.fullmatch(r"[a-zA-Z0-9_]+", database):
        raise RuntimeError("Could not match the running REST API to its database.")
    db = ["docker", "exec", "-i", "-u", "postgres", "rmos-beget-prod-db-1",
          "psql", "-h", "/tmp", "-w", "-X", "-U", "postgres", "-d", database,
          "-v", "ON_ERROR_STOP=1"]
    owner = output(db + ["-Atc", """
        select count(*) from public.marina_learning_approver a
        join public.user_roles r on r.user_id = a.user_id and r.role = 'admin'
        join auth.users u on u.id = a.user_id
        where a.singleton and (u.banned_until is null or u.banned_until <= now())
    """]).strip()
    if owner != "1":
        raise RuntimeError("The private staff chat requires exactly one active configured owner.")
    statements = []
    for table, path in MIGRATIONS:
        if output(db + ["-Atc", f"select to_regclass('public.{table}') is null"]).strip() == "t":
            statements.append((CANDIDATE / path).read_text())
    statements.append("""
        do $$ begin
          if to_regprocedure('public.approve_private_employee_test_rule(uuid,text,uuid,uuid,text,text,jsonb)') is null
             or to_regprocedure('public.save_ai_support_playbook(uuid,text,jsonb)') is null
             or has_table_privilege('authenticated', 'public.private_employee_test_dialogs','SELECT')
             or has_table_privilege('anon', 'public.private_employee_test_dialogs','SELECT')
          then raise exception 'Private chat schema or access check failed'; end if;
        end $$;
        notify pgrst, 'reload schema';
    """)
    subprocess.run(db + ["--single-transaction"], input="\n".join(statements), text=True, check=True)

def health(image):
    for _ in range(24):
        try:
            container = live()
            env = dict(entry.split("=", 1) for entry in container["Config"]["Env"])
            if container["Config"]["Image"] == image and container["State"]["Running"]:
                if image == NEW and env.get("MESSENGER_MARINA_TEST_ENABLED") != "false":
                    return False
                with urllib.request.urlopen(HEALTH, timeout=3) as response:
                    if response.status == 200:
                        return True
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(2)
    return False

def activate():
    if BACKUP.exists() or PENDING.exists():
        raise RuntimeError("The previous activation attempt needs review.")
    before = config(PRODUCTION)
    previous_app = before["services"]["app"]
    active = live()["Config"]
    live_env = dict(entry.split("=", 1) for entry in active["Env"])
    if active["Image"] != OLD or previous_app["image"] != OLD:
        raise RuntimeError("The running release has changed.")
    if any(live_env.get(key) != value for key, value in previous_app["environment"].items()):
        raise RuntimeError("The running application settings differ from Compose.")
    subprocess.run(["docker", "image", "inspect", NEW], stdout=subprocess.DEVNULL, check=True)

    text = PRODUCTION.read_text()
    match = re.search(r"(?ms)^  app:\s*\n.*?(?=^  \w[\w-]*:\s*\n|\Z)", text)
    if not match:
        raise RuntimeError("Cannot identify the app service in the working configuration.")
    app = replace_once(match[0], f"    image: {OLD}\n", f"    image: {NEW}\n")
    app = replace_once(app, f"      context: {SOURCE}\n", f"      context: {CANDIDATE}\n")
    if re.search(r"(?m)^ +MESSENGER_MARINA_TEST_ENABLED:", app):
        app = re.sub(r"(?m)^( +MESSENGER_MARINA_TEST_ENABLED:).*?$", r'\1 "false"', app)
    else:
        app = replace_once(app, "    environment:\n",
                           '    environment:\n      MESSENGER_MARINA_TEST_ENABLED: "false"\n')
    PENDING.write_text(text[:match.start()] + app + text[match.end():])
    os.chmod(PENDING, PRODUCTION.stat().st_mode & 0o777)
    expected = copy.deepcopy(before)
    expected_app = expected["services"]["app"]
    expected_app["image"] = NEW
    expected_app["build"]["context"] = str(CANDIDATE)
    expected_app["environment"]["MESSENGER_MARINA_TEST_ENABLED"] = "false"
    if config(PENDING) != expected:
        raise RuntimeError("Unexpected differences in the staged application settings.")

    migrate()
    shutil.copy2(PRODUCTION, BACKUP)
    os.replace(PENDING, PRODUCTION)
    command = COMPOSE + ["-f", str(PRODUCTION), "up", "-d", "--no-deps", "--no-build", "app"]
    with (WORK / "private-employee-test-activate.log").open("ab") as log:
        try:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not health(NEW):
                raise RuntimeError("The new application did not pass its health check.")
        except BaseException:
            shutil.copy2(BACKUP, PENDING)
            os.replace(PENDING, PRODUCTION)
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
            if not health(OLD):
                raise RuntimeError("Rollback attempted; prior application health could not be confirmed.")
            raise RuntimeError("Health check failed. Previous application restored.") from None
    print("Private staff test chat is live. HTTP 200. Telegram auto-reply callback disabled.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision")
    args = parser.parse_args()
    try:
        build(args.revision)
        activate()
    except RuntimeError as error:
        raise SystemExit(str(error))
