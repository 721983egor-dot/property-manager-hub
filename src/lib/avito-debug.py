#!/usr/bin/env python3
import json, re, subprocess, urllib.parse, urllib.request

def psql(sql):
    result = subprocess.run(
        ["docker", "exec", "-i", "deploy-supabase-db-1", "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
        text=True, capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout

def secret(name):
    return psql(f"SELECT value FROM public.platform_secrets WHERE name = '{name}'").strip()

form = urllib.parse.urlencode({
    "grant_type": "client_credentials",
    "client_id": secret("AVITO_CLIENT_ID"),
    "client_secret": secret("AVITO_CLIENT_SECRET"),
}).encode()
req = urllib.request.Request("https://api.avito.ru/token", data=form, headers={"Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(req, timeout=40) as resp:
    token = json.loads(resp.read().decode())["access_token"]

def get(url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())

items = []
page = 1
while page <= 10:
    payload = get(f"https://api.avito.ru/core/v1/items?status=active&per_page=99&page={page}")
    batch = payload.get("resources") or []
    items.extend(batch)
    if len(batch) < 99:
        break
    page += 1

props = json.loads(psql(
    "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ("
    "SELECT ref_id, title, address, complex_name, rooms, area, floor, price_month "
    "FROM public.properties WHERE status IS DISTINCT FROM 'archived') t"
).strip())

print(json.dumps({
    "avito": [
        {"id": i.get("id"), "title": i.get("title"), "address": i.get("address"), "price": i.get("price")}
        for i in items
    ],
    "rm": props,
}, ensure_ascii=False))
