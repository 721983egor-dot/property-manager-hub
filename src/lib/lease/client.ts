import { supabase } from "@/integrations/supabase/client";
export async function leaseRequest(body: unknown, raw = false) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Требуется вход администратора");
  const form = body instanceof FormData;
  const r = await fetch("/api/lease-documents", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      ...(!form ? { "Content-Type": "application/json" } : {}),
    },
    body: form ? body : JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json();
    throw new Error(e.error || "Ошибка документов");
  }
  return raw ? r : r.json();
}
export async function downloadLease(id: string, format: string) {
  const r = (await leaseRequest({ action: "file", id, format }, true)) as Response;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download =
    r.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "Договор." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
