#!/usr/bin/env python3
"""One-off matcher: published Avito ads -> RM OS properties. Does not print secrets."""

import json
import re
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def psql(sql, args=None):
    cmd = [
        "docker",
        "exec",
        "-i",
        "deploy-supabase-db-1",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-tA",
        "-c",
        sql,
    ]
    result = subprocess.run(cmd, input=args, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "psql failed")
    return result.stdout


def secret(name):
    value = psql(f"SELECT value FROM public.platform_secrets WHERE name = '{name}'").strip()
    return value


def http_json(url, token=None, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.loads(resp.read().decode())


def token_and_user(client_id, client_secret):
    form = urllib.parse.urlencode(
        {"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}
    ).encode()
    req = urllib.request.Request(
        "https://api.avito.ru/token",
        data=form,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        payload = json.loads(resp.read().decode())
    access = payload_token = payload["access_token"]
    me = http_json("https://api.avito.ru/core/v1/accounts/self", token=access)
    return payload_token, int(me["id"])


def list_active(token):
    items = []
    page = 1
    while page <= 20:
        payload = http_json(
            f"https://api.avito.ru/core/v1/items?status=active&per_page=99&page={page}",
            token=token,
        )
        batch = payload.get("resources") or []
        items.extend(batch)
        if len(batch) < 99:
            break
        page += 1
    return items


NOISE_RE = re.compile(r"[«»\"'`.,()/]")
ADDR_NOISE = re.compile(
    r"^(россия|краснодарский край|сочи|г сочи|город сочи|адлерский район|центральный район|хостинский район|лазаревский район)$|^\d{6}$"
)


def norm(value):
    return re.sub(r"\s+", " ", NOISE_RE.sub(" ", (value or "").lower().replace("ё", "е"))).strip()


def address_key(address):
    parts = []
    for part in norm(address).split(","):
        part = part.strip()
        if part and not ADDR_NOISE.match(part):
            parts.append(part)
    return " ".join(parts)


def tokens(value):
    return {t for t in value.split(" ") if len(t) > 1}


def overlap(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0
    return len(ta & tb) / max(len(ta), len(tb))


def rooms_of(title):
    text = title or ""
    m = re.search(r"(\d+)\s*[- ]?\s*к", text, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*комн", text, re.I)
    if m:
        return int(m.group(1))
    if re.search(r"студи", text, re.I):
        return 0
    return None


def area_of(title):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*м", title or "", re.I)
    return float(m.group(1).replace(",", ".")) if m else None


def floor_of(title):
    m = re.search(r"(\d+)\s*/\s*\d+\s*эт", title or "", re.I)
    return int(m.group(1)) if m else None


def score(item, prop):
    title = item.get("title") or ""
    points = 0
    points += overlap(address_key(item.get("address") or ""), address_key(prop["address"] or "")) * 50
    points += overlap(norm(title), norm(prop["complex_name"] or "")) * 15
    points += overlap(norm(title + " " + (item.get("address") or "")), norm(prop["title"] or "")) * 10

    rooms = rooms_of(title)
    if rooms is not None and prop["rooms"] is not None and rooms == prop["rooms"]:
        points += 12
    area = area_of(title)
    if area is not None and prop["area"] is not None:
        if abs(area - float(prop["area"])) <= 0.8:
            points += 15
        elif abs(area - float(prop["area"])) <= 3:
            points += 6
    floor = floor_of(title)
    if floor is not None and prop["floor"] is not None and floor == prop["floor"]:
        points += 8
    price = item.get("price")
    if price and prop["price_month"]:
        diff = abs(float(price) - float(prop["price_month"])) / max(float(prop["price_month"]), 1)
        if diff <= 0.03:
            points += 8
        elif diff <= 0.08:
            points += 3
    return round(points)


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def admin_sql(sql):
    cmd = [
        "docker",
        "exec",
        "-i",
        "deploy-supabase-db-1",
        "sh",
        "-c",
        'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1',
    ]
    result = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "admin sql failed")
    return result.stdout


def main():
    client_id = secret("AVITO_CLIENT_ID")
    client_secret = secret("AVITO_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit("AVITO_KEYS_MISSING")
    token, _user_id = token_and_user(client_id, client_secret)
    items = list_active(token)
    raw = psql(
        "SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM ("
        "SELECT id::text, title, address, complex_name, rooms, area, floor, price_month, status, ref_id "
        "FROM public.properties WHERE status IS DISTINCT FROM 'archived'"
        ") t"
    ).strip()
    props = json.loads(raw or "[]")
    taken = set()
    linked = []
    skipped = []
    now = datetime.now(timezone.utc).isoformat()

    for item in items:
        scored = sorted(
            ({"id": p["id"], "title": p["title"], "ref": p["ref_id"], "score": score(item, p)} for p in props),
            key=lambda x: x["score"],
            reverse=True,
        )
        best = scored[0] if scored else None
        second = scored[1] if len(scored) > 1 else None
        gap = (best["score"] - second["score"]) if best and second else 100
        if not best or best["score"] < 72 or best["id"] in taken or gap < 10:
            skipped.append(
                {
                    "avito": item.get("id"),
                    "title": (item.get("title") or "")[:80],
                    "best": (best or {}).get("ref"),
                    "score": (best or {}).get("score", 0),
                    "gap": gap,
                }
            )
            continue
        taken.add(best["id"])
        url = item.get("url") or f"https://www.avito.ru/items/{item.get('id')}"
        admin_sql(
            "INSERT INTO public.property_listings "
            "(property_id, platform, published, published_at, unpublished_at, external_id, external_url, last_synced_at, sync_status, sync_error) "
            f"VALUES ({sql_literal(best['id'])}::uuid, 'avito', true, {sql_literal(now)}, NULL, {sql_literal(item.get('id'))}, {sql_literal(url)}, {sql_literal(now)}, 'linked', '') "
            "ON CONFLICT (property_id, platform) DO UPDATE SET "
            "published = true, "
            "published_at = COALESCE(public.property_listings.published_at, EXCLUDED.published_at), "
            "external_id = EXCLUDED.external_id, "
            "external_url = EXCLUDED.external_url, "
            "last_synced_at = EXCLUDED.last_synced_at, "
            "sync_status = 'linked', "
            "sync_error = ''"
        )
        admin_sql(
            "UPDATE public.chat_threads SET property_id = "
            f"{sql_literal(best['id'])}::uuid "
            f"WHERE source = 'avito' AND external_offer_id = {sql_literal(item.get('id'))}"
        )
        linked.append({"avito": item.get("id"), "ref": best["ref"], "title": (best["title"] or "")[:80], "score": best["score"]})

    print(json.dumps({"avito_active": len(items), "properties": len(props), "linked": linked, "skipped": skipped}, ensure_ascii=False))


if __name__ == "__main__":
    main()
