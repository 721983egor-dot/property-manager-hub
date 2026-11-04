#!/usr/bin/env python3
"""Isolated local RM OS. Never imports the production .env or business data."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT.parent / 'local-rmos-runtime'
LIMA = RUNTIME / 'tools/bin/limactl'
LOCAL = ROOT / 'deploy/local'
STATE = LOCAL / '.env.local'
VM_ENV = {**os.environ, 'LIMA_HOME': str(Path.home() / '.rmos-lima')}

def token(secret, role):
    encode = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
    body = '.'.join(encode(json.dumps(v).encode()) for v in [
        {'alg': 'HS256', 'typ': 'JWT'},
        {'role': role, 'iss': 'supabase-local', 'iat': int(time.time()), 'exp': int(time.time()) + 315360000},
    ])
    return body + '.' + encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())

def settings():
    if not STATE.exists():
        secret = secrets.token_hex(32)
        data = dict(LOCAL_DB_PASSWORD=secrets.token_hex(24), LOCAL_JWT_SECRET=secret,
                    LOCAL_ANON_KEY=token(secret, 'anon'), LOCAL_SERVICE_KEY=token(secret, 'service_role'),
                    LOCAL_ADMIN_EMAIL='admin@rm-os.test', LOCAL_ADMIN_PASSWORD=secrets.token_urlsafe(18))
        STATE.write_text('\n'.join(k+'='+v for k,v in data.items())+'\n')
        STATE.chmod(0o600)
    return dict(line.split('=', 1) for line in STATE.read_text().splitlines() if '=' in line)

def vm(*args, **kwargs):
    return subprocess.run([str(LIMA), 'shell', 'rm-os', *args], env=VM_ENV, check=True, **kwargs)

def compose(*args, **kwargs):
    return vm('sudo', 'docker', 'compose', '--project-name', 'rmos-local', '--env-file', str(STATE),
              '-f', str(LOCAL/'compose.yml'), *args, **kwargs)

def wait_backend():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:54321/auth/v1/health', timeout=2) as response:
                if response.status == 200:
                    sql('SELECT 1 FROM storage.objects LIMIT 0;')
                    return
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(1)
    raise SystemExit('Local backend is not ready; check: python3 scripts/local-dev.py logs')

def sql(source):
    return compose('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
                   input=source, text=True, capture_output=True)

def migrate():
    sql('CREATE TABLE IF NOT EXISTS public.local_dev_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now());')
    applied = sql('SELECT name FROM public.local_dev_migrations;').stdout
    for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):
        if path.name in applied:
            continue
        try:
            sql('BEGIN;\n'+path.read_text()+"\nINSERT INTO public.local_dev_migrations(name) VALUES ('"+path.name+"');\nCOMMIT;")
            print('Applied', path.name, flush=True)
        except subprocess.CalledProcessError as error:
            print('Migration stopped:', path.name, '\n', error.stderr, file=sys.stderr)
            raise SystemExit(1)
    sql("NOTIFY pgrst, 'reload schema';")

def app_env(data):
    # Explicit values take precedence over the existing working-system .env.
    values = dict(SUPABASE_URL='http://127.0.0.1:54321', SUPABASE_PROJECT_ID='local-test',
                  SUPABASE_PUBLISHABLE_KEY=data['LOCAL_ANON_KEY'], SUPABASE_SERVICE_ROLE_KEY=data['LOCAL_SERVICE_KEY'],
                  VITE_SUPABASE_URL='http://127.0.0.1:54321', VITE_SUPABASE_PROJECT_ID='local-test',
                  VITE_SUPABASE_PUBLISHABLE_KEY=data['LOCAL_ANON_KEY'], VITE_LOCAL_TEST_MODE='true',
                  PREVIEW_MODE='1', PUBLIC_SITE_URL='http://127.0.0.1:4194', PUBLIC_BASE_URL='http://127.0.0.1:4194',
                  RM_OS_URL='http://127.0.0.1:4194')
    for key in ['CIAN_API_KEY', 'YANDEX_REALTY_TOKEN', 'YANDEX_GEOCODER_API_KEY', 'YANDEX_MAPS_JS_API_KEY',
                'YANDEX_SUGGEST_API_KEY', 'LOVABLE_CRON_SECRET', 'LOVABLE_API_KEY', 'TELEGRAM_API_KEY',
                'TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY', 'DEPLOY_AGENT_TOKEN', 'DEPLOY_AGENT_URL']:
        values[key] = ''
    return {**os.environ, **values}

def seed(data):
    body = json.dumps({'email':data['LOCAL_ADMIN_EMAIL'], 'password':data['LOCAL_ADMIN_PASSWORD'], 'email_confirm':True, 'role':'authenticated'}).encode()
    req = urllib.request.Request('http://127.0.0.1:54321/auth/v1/admin/users', data=body,
                                 headers={'Authorization':'Bearer '+data['LOCAL_SERVICE_KEY'], 'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            user = json.load(response)
        uid = user['id']
    except urllib.error.HTTPError as error:
        if error.code != 422:
            raise
        response = sql("SELECT id FROM auth.users WHERE email='admin@rm-os.test';").stdout
        import re
        uid = re.search(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', response).group()
    sql("UPDATE auth.users SET role='authenticated' WHERE id='"+uid+"';"
        "INSERT INTO public.user_roles(user_id,role) VALUES ('"+uid+"','admin') ON CONFLICT DO NOTHING;"
        "INSERT INTO public.profiles(id,email,full_name) VALUES ('"+uid+"','admin@rm-os.test','Тестовый администратор') ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name;")
    if (LOCAL/'seed.sql').exists():
        sql((LOCAL/'seed.sql').read_text())
    print('Local test administrator ready. Credentials: deploy/local/.env.local')

def main():
    data = settings()
    action = sys.argv[1] if len(sys.argv)>1 else 'status'
    if action == 'setup':
        compose('up', '-d')
        wait_backend()
    elif action == 'start':
        subprocess.run([str(LIMA), 'start', 'rm-os', '--tty=false'],env=VM_ENV,check=True)
        compose('up', '-d')
        wait_backend()
        migrate()
        seed(data)
        # Reuse the existing local app without launching a second listener.
        try:
            with urllib.request.urlopen('http://127.0.0.1:4194/auth', timeout=3) as response:
                if 'Локальная РМ ОС' in response.read().decode():
                    print('Already running: http://127.0.0.1:4194/objects')
                    return
        except OSError:
            pass
        os.chdir(ROOT)
        os.execvpe('npm', ['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '4194', '--strictPort', '--mode', 'localtest'], app_env(data))
    elif action == 'migrate':
        migrate()
    elif action == 'seed':
        seed(data)
    elif action == 'sql':
        result = sql(sys.stdin.read())
        print(result.stdout)
    elif action == 'dev':
        os.chdir(ROOT)
        os.execvpe('npm', ['npm', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '4194', '--strictPort', '--mode', 'localtest'], app_env(data))
    elif action == 'stop':
        compose('stop')  # volumes and demo edits remain intact
    elif action == 'status':
        compose('ps')
    elif action == 'logs':
        compose('logs', '--tail', '50', *sys.argv[2:])
    else:
        raise SystemExit('Use start, setup, migrate, seed, dev, stop, status, logs or sql')

if __name__ == '__main__':
    main()
