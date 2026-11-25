#!/usr/bin/env python3
"""Build and activate the scoped Marina handbook and approvals on RM OS."""
import argparse
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

ROOT = Path("/opt/rm-os-recovery")
BASE = ROOT / "beget-production-20261115"
PRODUCTION = BASE / "production.yml"
WORK = ROOT / "ai-employees-20261125"
SOURCE = WORK / "polza-gateway"
CANDIDATE = WORK / "marina-learning"
OVERLAY = WORK / "marina-learning-overlay.json"
BACKUP = BASE / "production.before-marina-learning.yml"
PENDING = BASE / "production.marina-learning-candidate.yml"
OLD = "rmos-beget-prod-app:employee-polza-20261125"
NEW = "rmos-beget-prod-app:marina-learning-20261125"
CONTAINER = "rmos-beget-prod-app-1"
HEALTH = "http://127.0.0.1:64197/api/public/health"
COMPOSE = ["docker", "compose", "-p", "rmos-beget-prod", "--env-file", str(BASE / "production.env")]
DB = ["docker", "exec", "-i", "rmos-beget-prod-db-1", "psql", "-X", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1"]
OWNER = """
  select distinct p.id from public.profiles p join public.user_roles r on r.user_id = p.id
  join auth.users u on u.id = p.id
  where r.role::text = 'admin'
    and p.full_name ~* '(^|[[:space:]])егор([[:space:]]|$)'
    and p.full_name ~* '(^|[[:space:]])мошков([[:space:]]|$)'
    and (u.banned_until is null or u.banned_until <= now())
"""
MIGRATION = "supabase/migrations/20261125150000_marina_showing_learning.sql"

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

def edit(path, callback):
    file = CANDIDATE / path
    file.write_text(callback(file.read_text()))

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
    for path in [
        "src/components/MarinaShowingLearning.tsx",
        "src/lib/ai-manager/marina-instructions.ts",
        "src/lib/ai-manager/marina-learning.ts",
        "src/lib/ai-manager/marina-learning.server.ts",
        "src/lib/ai-manager/marina-learning.functions.ts",
        MIGRATION,
    ]:
        file = CANDIDATE / path
        if file.exists():
            raise RuntimeError("New release file already exists: " + path)
        file.write_text(fetch(path))

    def staff(s):
        if "isAdmin" not in s or "AiStaffCards" in s:
            raise RuntimeError("The working staff page has changed.")
        return 'import { MarinaStaffProfile } from "@/components/MarinaShowingLearning";\n' + replace_once(
            s, "      <StaffDialog",
            "      {isAdmin && <MarinaStaffProfile />}\n      <StaffDialog",
        )
    edit("src/routes/_authenticated/system.staff.tsx", staff)

    def draft(s):
        anchor = "    system: `"
        s = replace_once(s, anchor, anchor +
            "Основные инструкции Марины:\n${marinaInstructionsText}\n"
            "Правила по показам, подтверждённые администратором, применяй в рамках основных инструкций:\n"
            "${JSON.stringify(await approvedMarinaShowingRules())}\n\n")
        return 'import { marinaInstructionsText } from "./marina-instructions";\n' + (
            'import { approvedMarinaShowingRules } from "./marina-learning.server";\n' + s
        )
    edit("src/lib/ai-manager/service.server.ts", draft)

    reference_tools = fetch("src/lib/ai-manager/tools.server.ts")
    def tools(s):
        for name, key, end in [
            ("managerReadTools()", "listMarinaShowingRules", "getAiEmployeeHandbooks"),
            ("managerMutateTools(ctx: AssistantToolContext)", "proposeMarinaShowingRuleDecision", "proposeApproveAiEmployeeSkill"),
        ]:
            tool = reference_tools.split(f"    {key}: tool(", 1)[1].split(f"    {end}: tool(", 1)[0]
            anchor = f"export function {name} {{\n  return {{\n"
            s = replace_once(s, anchor, anchor + f"    {key}: tool(" + tool)
        return 'import { decideShowingRuleInput } from "./marina-learning";\n' + s
    edit("src/lib/ai-manager/tools.server.ts", tools)

    executor = "export const ASSISTANT_EXECUTORS: Record<string, Executor> = {\n"
    edit("src/lib/ai/executors.server.ts", lambda s: replace_once(s, executor, executor +
        '  decideMarinaShowingRule: async (input) =>\n'
        '    (await import("@/lib/ai-manager/marina-learning.server")).decideMarinaShowingRule(input),\n'))

    OVERLAY.write_text(json.dumps({"services": {"app": {
        "image": NEW, "build": {"context": str(CANDIDATE)},
        "environment": {"MESSENGER_MARINA_TEST_ENABLED": "false"},
    }}}))
    cmd = COMPOSE + ["-f", str(PRODUCTION), "-f", str(OVERLAY), "build", "app"]
    print("Staged handbook, approval flow and database migration. Building candidate.", flush=True)
    with (WORK / "marina-learning-build.log").open("wb") as log:
        subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
    print("Candidate built. Production is still on the prior version.", flush=True)

def migrate():
    ids = output(DB + ["-Atc", OWNER]).splitlines()
    if len(ids) != 1 or not re.fullmatch(r"[0-9a-f-]{36}", ids[0]):
        raise RuntimeError(f"Exactly one active administrator named Egor Moshkov is required (found {len(ids)}).")
    exists = output(DB + ["-Atc", "select to_regclass('public.marina_showing_rules') is not null"]).strip()
    script = "" if exists == "t" else (CANDIDATE / MIGRATION).read_text()
    script += f"""
      insert into public.marina_learning_approver(user_id) values ('{ids[0]}')
      on conflict (singleton) do nothing;
      do $$ begin
        if not exists (select 1 from public.marina_learning_approver where user_id = '{ids[0]}') then
          raise exception 'Configured approver differs';
        end if;
      end $$;
      select rule_key, count(*) as matched_deals
      from public.marina_showing_evidence() group by rule_key;
    """
    subprocess.run(DB + ["--single-transaction"], input=script, text=True, check=True)

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
    with (WORK / "marina-learning-activate.log").open("ab") as log:
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
    print("Marina instructions and showing approvals are live. HTTP 200. Telegram auto-reply callback disabled.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision", nargs="?")
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    try:
        if args.activate:
            activate()
        elif args.revision:
            build(args.revision)
        else:
            parser.error("provide the release revision or --activate")
    except RuntimeError as error:
        raise SystemExit(str(error))
