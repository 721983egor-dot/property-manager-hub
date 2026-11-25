import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertOpenStage,
  channelNotice,
  crmNote,
  hasUnapprovedMarketplaceContact,
  marketplaceListingUrl,
  verifyAnalysis,
} from "./model";

const id = "10000000-0000-4000-8000-000000000001";
const inbound = { id, direction: "in", body: "Бюджет 70 тысяч. В Telegram переходить не хочу." };
const sample = () => ({
  reply: "Хорошо, продолжим здесь. На какой срок ищете жильё?",
  facts: [{ label: "Бюджет", value: "70 тысяч", messageId: id, quote: "Бюджет 70 тысяч." }],
  questions: ["Срок аренды"],
  needsHuman: false,
  reason: "",
  handoff: {
    status: "declined",
    messenger: "Telegram",
    contact: "",
    messageId: id,
    quote: "В Telegram переходить не хочу.",
  },
});
test("сохраняет пожелания с исходной цитатой и отказ от перехода", () => {
  const result = verifyAnalysis(sample(), [inbound]);
  assert.equal(result.handoff.status, "declined");
  assert.match(crmNote(result), /70 тысяч/);
  assert.match(crmNote(result), /переходить не хочу/);
});
test("не принимает выдуманное сообщение или цитату оператора", () => {
  assert.throws(() => verifyAnalysis(sample(), [{ ...inbound, direction: "out" }]));
  assert.throws(() => verifyAnalysis(sample(), [{ ...inbound, body: "Ищу квартиру" }]));
});
test("не сохраняет контакт или согласие, когда переход не обсуждался", () => {
  const s = sample();
  s.handoff.status = "not_discussed";
  s.handoff.contact = "+79990000000";
  const result = verifyAnalysis(s, [inbound]);
  assert.equal(result.handoff.contact, "");
  assert.equal(result.handoff.messageId, null);
});
test("не принимает согласие без цитаты клиента", () => {
  const s = sample();
  s.handoff.status = "agreed";
  s.handoff.quote = "";
  assert.throws(() => verifyAnalysis(s, [inbound]));
});
test("нельзя закрыть сделку или перевести в чужую воронку", () => {
  assert.throws(() => assertOpenStage({ kind: "won", pipeline: "rental" }, "rental"));
  assert.throws(() => assertOpenStage({ kind: "lost", pipeline: "rental" }, "rental"));
  assert.throws(() => assertOpenStage({ kind: "open", pipeline: "intake" }, "rental"));
  assert.doesNotThrow(() => assertOpenStage({ kind: "open", pipeline: "rental" }, "rental"));
});
test("неподтверждённые правила площадок оставляют диалог на площадке", () => {
  for (const source of ["avito", "cian"])
    assert.match(channelNotice(source), /внешняя отправка отключена/);
});

test("разрешает только точную ссылку из списка публикаций текущей площадки", () => {
  const avito = "https://www.avito.ru/sochi/kvartiry/test_123";
  const cian = "https://www.cian.ru/rent/flat/456/";
  assert.equal(marketplaceListingUrl("avito", `${avito}?utm_source=chat`), avito);
  assert.equal(marketplaceListingUrl("cian", cian), cian);
  assert.equal(marketplaceListingUrl("cian", avito), null);
  assert.equal(marketplaceListingUrl("avito", "https://avito.ru.example.org/123"), null);
  const listings = new Set([avito]);
  assert.equal(hasUnapprovedMarketplaceContact(`Вот объявление: (${avito}).`, listings), false);
  assert.equal(hasUnapprovedMarketplaceContact(`Вот объявление: ${cian}`, listings), true);
  assert.equal(hasUnapprovedMarketplaceContact(`Смотрите ${avito}?other=1`, listings), true);
  assert.equal(hasUnapprovedMarketplaceContact(`${avito} или напишите в Telegram`, listings), true);
});
