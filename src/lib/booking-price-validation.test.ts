import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingPriceProblem,
  nextBookingPricePeriod,
  bookingErrorMessage,
} from "./booking-price-validation.ts";
const p = (start_date: string, end_date: string, price_month = 100000) => ({
  start_date,
  end_date,
  price_month,
});
const check = (periods: ReturnType<typeof p>[]) =>
  bookingPriceProblem(periods, "2026-10-19", "2027-10-19", 19, "2026-10-19");
test("shared inclusive boundary explains the exact conflicting periods", () => {
  assert.match(
    check([p("2026-10-19", "2027-06-01"), p("2027-06-01", "2027-10-19")])!,
    /Периоды 1 и 2 пересекаются/,
  );
  assert.equal(check([p("2026-10-19", "2027-05-31"), p("2027-06-01", "2027-10-19")]), null);
});
test("missing, incomplete, invalid amount and out-of-contract rows give actionable errors", () => {
  assert.match(check([])!, /Добавьте периоды/);
  assert.match(check([p("", "2027-10-19")])!, /обе даты/);
  assert.match(check([p("2026-10-19", "2027-10-19", 0)])!, /больше нуля/);
  assert.match(check([p("2026-10-18", "2027-10-19")])!, /в пределах аренды/);
});
test("coverage checks payment dates and clamps 31 to the actual month length", () => {
  assert.match(
    bookingPriceProblem(
      [p("2026-10-19", "2027-02-27"), p("2027-03-01", "2027-10-19")],
      "2026-10-19",
      "2027-10-19",
      31,
      "2026-10-19",
    )!,
    /2027-02-28/,
  );
  assert.equal(
    bookingPriceProblem(
      [p("2026-10-19", "2027-02-28"), p("2027-03-01", "2027-10-19")],
      "2026-10-19",
      "2027-10-19",
      31,
      "2026-10-19",
    ),
    null,
  );
});
test("suggested added period uses the first available gap and does not duplicate all rental dates", () => {
  assert.deepEqual(
    nextBookingPricePeriod([p("2026-10-19", "2027-05-31")], "2026-10-19", "2027-10-19"),
    p("2027-06-01", "2027-10-19", 0),
  );
  assert.deepEqual(
    nextBookingPricePeriod([p("2026-10-19", "2027-10-19")], "2026-10-19", "2027-10-19"),
    p("", "", 0),
  );
  assert.deepEqual(
    nextBookingPricePeriod([p("2027-06-01", "2027-10-19")], "2026-10-19", "2027-10-19"),
    p("2026-10-19", "2027-05-31", 0),
  );
});
test("plain RPC errors keep their message instead of becoming object Object", () => {
  assert.equal(
    bookingErrorMessage({ message: "Объект уже забронирован на эти даты", code: "P0001" }),
    "Объект уже забронирован на эти даты",
  );
  assert.equal(bookingErrorMessage(new Error("Проверьте даты")), "Проверьте даты");
});

test("booking ending in May cannot include May and summer prices beyond its end", () => {
  const periods = [p("2026-10-19", "2027-05-31", 140000), p("2027-06-01", "2027-09-30", 250000)];
  assert.match(
    bookingPriceProblem(periods, "2026-10-19", "2027-05-22", 22, "2026-10-19")!,
    /Период 1: даты должны быть в пределах аренды/,
  );
  assert.equal(bookingPriceProblem(periods, "2026-10-19", "2027-09-30", 22, "2026-10-19"), null);
  assert.equal(
    bookingPriceProblem(
      [p("2026-10-19", "2027-05-22", 140000)],
      "2026-10-19",
      "2027-05-22",
      22,
      "2026-10-19",
    ),
    null,
  );
});
