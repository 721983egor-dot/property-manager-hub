import assert from "node:assert/strict";
import test from "node:test";
import {
  validReminder,
  nextReminder,
  reminderAnchors,
  reminderKeyboard,
  type ReminderRow,
} from "./model.ts";
const now = Date.parse("2026-10-13T09:00:00+03:00");
const row: ReminderRow = {
  id: "49a121fa-8c33-4001-b3b7-72d5d2a49f10",
  account_id: "a",
  title: "Аренда",
  due_at: "2026-01-31T10:00:00+03:00",
  repeat: "monthly",
  ...reminderAnchors("2026-01-31T10:00:00+03:00"),
  state: "notified",
  occurrence: 4,
  lease_token: null,
};
test("reject missing time, invalid calendar day, UTC instead of Moscow and past time", () => {
  for (const dueAt of [
    "2026-10-14",
    "2026-02-30T10:00:00+03:00",
    "2026-10-14T10:00:00Z",
    "2026-10-13T08:00:00+03:00",
  ])
    assert.throws(() => validReminder({ title: "Позвонить", dueAt }, now));
  assert.equal(
    validReminder({ title: " Позвонить ", dueAt: "2026-10-14T11:00:00+03:00" }, now).title,
    "Позвонить",
  );
});
test("monthly 31 clamps February then recovers March 31", () => {
  const feb = nextReminder(row, Date.parse("2026-01-31T11:00:00+03:00"));
  assert.equal(feb, "2026-02-28T07:00:00.000Z");
  assert.equal(
    nextReminder({ ...row, due_at: feb! }, Date.parse("2026-02-28T11:00:00+03:00")),
    "2026-03-31T07:00:00.000Z",
  );
});
test("late completion skips missed periods; one-time does not repeat", () => {
  assert.equal(nextReminder(row, now), "2026-10-31T07:00:00.000Z");
  assert.equal(nextReminder({ ...row, repeat: "once" }, now), null);
  assert.equal(
    nextReminder(
      { ...row, due_at: "2026-10-07T10:00:00+03:00", repeat: "weekly", anchor_weekday: 3 },
      now,
    ),
    "2026-10-14T07:00:00.000Z",
  );
});
test("snooze does not change recurring original time; keys bind occurrence and fit Telegram 64 bytes", () => {
  assert.equal(
    nextReminder({ ...row, due_at: "2026-10-13T12:00:00+03:00", repeat: "daily" }, now),
    "2026-10-14T07:00:00.000Z",
  );
  for (const button of reminderKeyboard(row).flat()) {
    assert.ok(Buffer.byteLength(button.callback_data) <= 64);
    assert.ok(button.callback_data.endsWith(`${row.id}:4`));
  }
});
