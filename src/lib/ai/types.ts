/** Типы Ассистента, безопасные для клиента (без серверных импортов). */

export type AssistantChatMessage = { role: "user" | "assistant"; content: string };

/** Предложенное Ассистентом изменение, которое подтверждает менеджер. */
export type AssistantAction = {
  id: string;
  /** Имя инструмента-исполнителя из реестра, например "setPrice". */
  tool: string;
  /** Человеческое описание: что именно произойдёт. */
  summary: string;
  /** Аргументы исполнителя в виде JSON-строки (для безопасной передачи). */
  input: string;
};

export type AssistantReply = {
  text: string;
  actions: AssistantAction[];
  error: string;
};
