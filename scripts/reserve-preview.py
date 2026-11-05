#!/usr/bin/env python3
"""Deploy only the fictional preview database on the independent VPS.

Must run from its dedicated checkout on the Linux server. No production
credentials, Beget backups or live integrations are read by this script.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / 'deploy/reserve-preview/.env.preview'
spec = importlib.util.spec_from_file_location('local_dev', ROOT/'scripts/local-dev.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

def compose(*args, **kwargs):
    return subprocess.run(['docker','compose','--project-name','rmos-preview','--env-file',str(STATE),
                           '-f',str(ROOT/'deploy/local/compose.yml'),
                           '-f',str(ROOT/'deploy/reserve-preview/compose.yml'),*args],check=True,**kwargs)

def main():
    if sys.platform != 'linux' or not STATE.exists():
        raise SystemExit('Run on the preview Linux VPS with deploy/reserve-preview/.env.preview configured.')
    data = dict(line.split('=',1) for line in STATE.read_text().splitlines() if line and not line.startswith('#'))
    if data.get('TEST_DOMAIN') != 'preview-rm-os.residence-more.ru':
        raise SystemExit('Refusing an unexpected domain: this tool is preview-only.')
    local.compose = compose
    action = sys.argv[1] if len(sys.argv)>1 else 'status'
    if action == 'setup':
        compose('up','-d','db','auth','rest','storage','gateway')
        local.wait_backend()
        local.migrate()
        local.seed(data)
    elif action == 'update':
        # Save existing test edits before running migrations or replacing the app.
        backup_dir = ROOT.parent/'backups'
        backup_dir.mkdir(mode=0o700,exist_ok=True)
        target = backup_dir/time.strftime('preview-%Y%m%d-%H%M%S.sql')
        with target.open('wb') as out:
            compose('exec','-T','db','pg_dump','-U','postgres','-d','postgres',stdout=out)
        target.chmod(0o600)
        local.migrate()
        compose('up','-d','--build','app')
    elif action == 'build':
        compose('up','-d','--build','app')
    elif action == 'migrate':
        local.migrate()
    elif action == 'status':
        compose('ps')
    elif action == 'logs':
        compose('logs','--tail','60',*sys.argv[2:])
    elif action == 'sql':
        print(local.sql(sys.stdin.read()).stdout)
    else:
        raise SystemExit('Use setup, update, build, migrate, status, logs or sql')

if __name__ == '__main__':
    main()
