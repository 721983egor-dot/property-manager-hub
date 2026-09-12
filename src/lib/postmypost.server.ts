import { getPlatformSecret } from "@/lib/platform-secrets.server";

const BASE = "https://api.postmypost.io/v4.1";

export type PostmypostProject = { id: number; name: string };
export type PostmypostAccount = {
  id: number;
  name: string;
  channel: string;
};

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (Array.isArray(rec["data"])) return rec["data"];
  if (Array.isArray(rec["items"])) return rec["items"];
  if (Array.isArray(rec["accounts"])) return rec["accounts"];
  if (Array.isArray(rec["projects"])) return rec["projects"];
  if (Array.isArray(rec["publications"])) return rec["publications"];
  return [];
}

export async function getPostmypostToken(): Promise<string> {
  return (await getPlatformSecret("POSTMYPOST_API_TOKEN")).trim();
}

async function request<T>(
  token: string,
  path: string,
  init?: { method?: string; query?: Record<string, string | number | undefined>; body?: unknown },
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    const rec = asRecord(json);
    const message =
      String(rec["message"] ?? rec["error"] ?? text ?? `Postmypost ${res.status}`).trim() ||
      `Postmypost ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}

export function guessAccountChannel(account: unknown): string {
  const rec = asRecord(account);
  const nested = asRecord(rec["channel"] ?? rec["social_network"] ?? rec["network"]);
  const raw = [
    rec["channel"],
    rec["channel_code"],
    rec["code"],
    rec["type"],
    rec["network"],
    nested["code"],
    nested["name"],
    nested["slug"],
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  if (raw.includes("instagram")) return "instagram";
  if (raw.includes("telegram")) return "telegram";
  if (raw.includes("vkontakte") || /\bvk\b/.test(raw)) return "vk";
  if (raw.includes("max")) return "max";
  if (raw.includes("webhook")) return "webhook";
  return String(nested["code"] ?? rec["channel"] ?? "").toLowerCase();
}

function mapAccount(row: unknown): PostmypostAccount | null {
  const rec = asRecord(row);
  const id = Number(rec["id"]);
  if (!Number.isFinite(id) || id <= 0) return null;
  const name =
    String(rec["name"] ?? rec["title"] ?? rec["username"] ?? rec["login"] ?? "").trim() ||
    `Аккаунт ${id}`;
  return { id, name, channel: guessAccountChannel(row) };
}

function mapProject(row: unknown): PostmypostProject | null {
  const rec = asRecord(row);
  const id = Number(rec["id"]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { id, name: String(rec["name"] ?? rec["title"] ?? `Проект ${id}`).trim() };
}

export async function listPostmypostProjects(token: string): Promise<PostmypostProject[]> {
  const json = await request<unknown>(token, "/projects", { query: { per_page: 50 } });
  return asList(json).map(mapProject).filter((row): row is PostmypostProject => Boolean(row));
}

export async function listPostmypostAccounts(
  token: string,
  projectId: number,
): Promise<PostmypostAccount[]> {
  const json = await request<unknown>(token, "/accounts", {
    query: { project_id: projectId, per_page: 50 },
  });
  return asList(json).map(mapAccount).filter((row): row is PostmypostAccount => Boolean(row));
}

export async function createPostmypostPublication(
  token: string,
  input: {
    projectId: number;
    postAt: string;
    status: "draft" | "pending_publication";
    details: { accountId: number; content: string; fileIds?: number[] }[];
  },
): Promise<number> {
  const json = await request<unknown>(token, "/publications", {
    method: "POST",
    body: {
      project_id: input.projectId,
      post_at: input.postAt,
      account_ids: input.details.map((d) => d.accountId),
      publication_status: input.status,
      details: input.details.map((d) => ({
        account_id: d.accountId,
        publication_type: "post",
        content: d.content,
        ...(d.fileIds?.length ? { file_ids: d.fileIds } : {}),
      })),
    },
  });
  const rec = asRecord(asRecord(json)["data"] ?? json);
  const id = Number(rec["id"]);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Postmypost не вернул номер публикации");
  return id;
}

export async function deletePostmypostPublication(token: string, id: number): Promise<void> {
  await request(token, `/publications/${id}`, { method: "DELETE" });
}

export async function getPostmypostPublication(token: string, id: number): Promise<Json> {
  const json = await request<unknown>(token, `/publications/${id}`);
  return asRecord(asRecord(json)["data"] ?? json);
}

export async function listPostmypostPublications(
  token: string,
  projectId: number,
  page = 1,
): Promise<Json[]> {
  const json = await request<unknown>(token, "/publications", {
    query: { project_id: projectId, page, per_page: 50, sort: "-post_at" },
  });
  return asList(json).map(asRecord);
}

export async function getPublicationAnalytics(
  token: string,
  input: { projectId: number; accountId: number; from: string; to: string },
): Promise<Json[]> {
  const json = await request<unknown>(token, "/analytics/publications", {
    query: {
      project_id: input.projectId,
      account_id: input.accountId,
      date_from: input.from,
      date_to: input.to,
      per_page: 50,
    },
  });
  return asList(json).map(asRecord);
}

export async function uploadFileByUrl(
  token: string,
  projectId: number,
  url: string,
): Promise<number | null> {
  try {
    const init = await request<unknown>(token, "/upload/init", {
      method: "POST",
      body: { project_id: projectId, url },
    });
    const rec = asRecord(asRecord(init)["data"] ?? init);
    const uploadId = rec["id"];
    if (uploadId == null) return null;
    const done = await request<unknown>(token, "/upload/complete", {
      method: "POST",
      query: { id: Number(uploadId) },
    });
    const status = await request<unknown>(token, "/upload/status", {
      query: { id: Number(uploadId) },
    });
    const statusRec = asRecord(asRecord(status)["data"] ?? asRecord(done)["data"] ?? status);
    const fileId = Number(statusRec["file_id"] ?? statusRec["id"]);
    return Number.isFinite(fileId) && fileId > 0 ? fileId : null;
  } catch (error) {
    console.error("Postmypost upload by URL failed", error);
    return null;
  }
}
