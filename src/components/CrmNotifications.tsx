import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { fetchThreads } from "@/lib/chat.functions";
import { fetchLeads } from "@/lib/leads";

/** Короткий звуковой сигнал без внешних файлов. */
function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* звук не критичен */
  }
}

function systemNotify(title: string, body: string, url: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.png", tag: url });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
    };
  } catch {
    /* игнорируем */
  }
}

/**
 * Уведомления менеджеру о новых сообщениях в чате и новых заявках:
 * всплывающее окно, звук и системное уведомление браузера.
 */
export function CrmNotifications() {
  const loadThreads = useServerFn(fetchThreads);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const { data: threadsData } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => loadThreads({ data: undefined }),
    refetchInterval: 15000,
  });
  const { data: leads } = useQuery({
    queryKey: ["leads"],
    queryFn: fetchLeads,
    refetchInterval: 30000,
  });

  const prevUnread = useRef<number | null>(null);
  const prevLeadId = useRef<string | null>(null);

  useEffect(() => {
    if (!threadsData) return;
    const threads = threadsData.threads ?? [];
    const unread = threads.reduce((s, t) => s + t.unread_count, 0);
    if (prevUnread.current !== null && unread > prevUnread.current) {
      const top = threads.find((t) => t.unread_count > 0);
      const who = top?.name?.trim() || top?.phone?.trim() || "Посетитель сайта";
      const text = top?.last_body?.trim() || "Новое сообщение";
      beep();
      toast.message(`Новое сообщение — ${who}`, {
        description: text,
        action: { label: "Открыть", onClick: () => (window.location.href = "/chats") },
      });
      systemNotify(`Новое сообщение — ${who}`, text, "/chats");
    }
    prevUnread.current = unread;
  }, [threadsData]);

  useEffect(() => {
    if (!leads) return;
    const latest = leads[0];
    if (!latest) {
      prevLeadId.current = null;
      return;
    }
    if (prevLeadId.current !== null && latest.id !== prevLeadId.current) {
      const who = latest.name?.trim() || latest.phone?.trim() || "Клиент";
      beep();
      toast.message(`Новая заявка — ${who}`, {
        description: latest.phone || "",
        action: { label: "Открыть", onClick: () => (window.location.href = "/crm/leads") },
      });
      systemNotify(`Новая заявка — ${who}`, latest.phone || "", "/crm/leads");
    }
    prevLeadId.current = latest.id;
  }, [leads]);

  return null;
}
