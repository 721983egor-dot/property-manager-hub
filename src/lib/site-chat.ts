const KEY = "rm_chat_visitor";

/** Постоянный анонимный ключ посетителя для чата (хранится в браузере). */
export function getVisitorKey(): string {
  if (typeof window === "undefined") return "";
  let value = window.localStorage.getItem(KEY);
  if (!value) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, value);
  }
  return value;
}

/** Время сообщения в формате ЧЧ:ММ. */
export function chatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
