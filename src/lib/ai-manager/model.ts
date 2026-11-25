import { z } from "zod";

export const playbookSchema = z.object({
  instructions: z.string().min(20).max(12000),
  answers: z.string().max(16000),
});
export const DEFAULT_PLAYBOOK = {
  instructions:
    "Помогай клиенту подобрать длительную аренду и договориться о просмотре. Уточняй бюджет, даты, срок, состав жильцов, животных и важные требования. Задавай не более двух вопросов за раз. Не выдумывай объекты, цены, наличие, скидки и условия. Просмотр подтверждает менеджер после проверки календаря и ключей. Если договорились о повторном контакте, предложи конкретную дату и уточни время. Не выдавай предложение за уже поставленную задачу. Не раскрывай внутренние данные. При конфликте, претензии, юридическом вопросе или неизвестном условии передавай вопрос человеку.",
  answers:
    "Актуальность объекта — проверить даты и статус. Не переспрашивать срок или дату, если клиент их уже указал.\nТорг, животные, дети и особые условия — уточнить разрешение по конкретному объекту.\nЦену аренды, комиссию, залог и коммунальные расходы называть по отдельности. Итог — только если все обязательные суммы подтверждены. Переменные расходы обозначать как ориентир.\nПри расхождении между объявлением и карточкой передать вопрос менеджеру. Сезонные цены и возврат залога объяснять только по подтверждённым условиям.\nОплата и документы — передать менеджеру. Не просить деньги или документы в чате.\nЕсли клиент не хочет переходить в мессенджер — продолжить здесь.",
};
export const factSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
  messageId: z.string().uuid(),
  quote: z.string().min(1).max(1000),
});
export const analysisSchema = z.object({
  reply: z.string().min(1).max(2500),
  facts: z.array(factSchema).max(20),
  questions: z.array(z.string().max(300)).max(6),
  needsHuman: z.boolean(),
  reason: z.string().max(1000),
  handoff: z.object({
    status: z.enum(["not_discussed", "requested", "agreed", "declined"]),
    messenger: z.enum(["", "Telegram", "WhatsApp", "MAX"]),
    contact: z.string().max(200),
    messageId: z.string().uuid().nullable(),
    quote: z.string().max(1000),
  }),
});
export type Analysis = z.infer<typeof analysisSchema>;
export type EvidenceMessage = { id: string; direction: string; body: string };

// Quotes are evidence of customer statements, never instructions for our tools.
export function verifyAnalysis(raw: unknown, messages: EvidenceMessage[]): Analysis {
  const value = analysisSchema.parse(raw);
  const hasQuote = (id: string | null, quote: string) =>
    Boolean(
      id &&
      quote.trim() &&
      messages.some((m) => m.id === id && m.direction === "in" && m.body.includes(quote)),
    );
  for (const fact of value.facts) {
    if (!hasQuote(fact.messageId, fact.quote))
      throw Error("Не удалось подтвердить данные цитатой клиента. Повторите разбор.");
  }
  if (
    value.handoff.status !== "not_discussed" &&
    !hasQuote(value.handoff.messageId, value.handoff.quote)
  )
    throw Error("Не найдено подтверждение выбора мессенджера клиентом");
  if (value.handoff.status === "not_discussed")
    value.handoff = {
      status: "not_discussed",
      messenger: "",
      contact: "",
      messageId: null,
      quote: "",
    };
  // A phone in the chat is not proof of consent; contact identity needs human verification.
  return value;
}

export function marketplaceListingUrl(source: "avito" | "cian", value: string) {
  const url = URL.parse(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![`${source}.ru`, `www.${source}.ru`].includes(url.hostname) ||
    url.pathname === "/"
  )
    return null;
  return url.origin + url.pathname;
}

export function hasUnapprovedMarketplaceContact(reply: string, listingUrls: ReadonlySet<string>) {
  const remaining = reply.replace(/https:\/\/[^\s<>"'\])]+/giu, (match) => {
    const url = match.replace(/[.,!?;:]+$/u, "");
    return listingUrls.has(url) ? "" : match;
  });
  return /https?:|www\.|\b(?:avito|cian)\.ru\b|t\.me|wa\.me|телеграм|telegram|whats|ватс|мессендж|\bmax\b|макс|\+\d[\d\s()-]{7,}|@[a-z\d_]{3,}/iu.test(
    remaining,
  );
}

export function channelNotice(source: string) {
  return source === "avito" || source === "cian"
    ? "Правила перехода на этой площадке ещё не подтверждены. Ответ остаётся в чате площадки. Контакт и желание клиента можно зафиксировать для проверки менеджером; внешняя отправка отключена."
    : "Переход в мессенджер — по желанию клиента. Адресата проверяет менеджер. Автоматической отправки нет.";
}

export function crmNote(value: Analysis) {
  const facts = value.facts.map((f) => `${f.label}: ${f.value}\nКлиент: «${f.quote}»`).join("\n");
  const handoff =
    value.handoff.status === "not_discussed"
      ? ""
      : `\nМессенджер: ${value.handoff.messenger || "не выбран"}; статус: ${value.handoff.status}; контакт (не проверен): ${value.handoff.contact || "нет"}.\nКлиент: «${value.handoff.quote}»`;
  return `[Разбор ИИ — проверен менеджером]\n${facts}${handoff}\nСледующий шаг: ${value.questions.join("; ") || "уточнить у менеджера"}${value.needsHuman ? `\nНужен менеджер: ${value.reason}` : ""}`;
}

export function assertOpenStage(stage: { kind: string; pipeline: string }, pipeline: string) {
  if (stage.kind !== "open" || stage.pipeline !== pipeline)
    throw Error(
      "Доступны только открытые этапы этой воронки. Закрытие и бронь оформляются отдельно.",
    );
}
