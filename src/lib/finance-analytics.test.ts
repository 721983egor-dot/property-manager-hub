import assert from "node:assert/strict";
import { test, mock } from "node:test";
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T09:00:00Z") });
import {
  reportEntries,
  entryTotals,
  currentDebts,
  csvText,
  planFactCategories,
} from "./finance-analytics.ts";
import type { Payment } from "./finance.ts";
import type { FinanceCatalog } from "./finance-articles-model.ts";
import type { FinanceObligation } from "./finance-counterparties.ts";
const catalog: FinanceCatalog = { categories: [], articles: [] };
const p = (patch: Partial<Payment> = {}): Payment =>
  ({
    id: "p",
    amount: 100,
    direction: "in",
    status: "paid",
    kind: "other",
    planned_date: "2026-09-15",
    paid_at: "2026-10-02",
    paid_amount: null,
    accrual_date: null,
    property_id: null,
    article_id: null,
    article: null,
    ...patch,
  }) as Payment;
const entries = (
  payments: Payment[],
  basis: "cash" | "profit" | "plan",
  cat = catalog,
  property = "all",
) => reportEntries(payments, cat, basis, "2026-10-01", "2026-10-31", property);
test("cash follows actual payment date across planned months", () => {
  assert.equal(entryTotals(entries([p()], "cash")).income, 100);
  assert.equal(entries([p()], "plan").length, 0);
  assert.equal(
    entries([p({ planned_date: "2026-10-01", paid_at: "2026-11-01" })], "cash").length,
    0,
  );
});
test("due plans become full cash while partial payments keep their actual amount", () => {
  assert.equal(
    entryTotals(
      entries(
        [
          p({ status: "partial", paid_amount: 20 }),
          p({ status: "expected", paid_amount: 90 }),
          p({ status: "partial", paid_amount: null }),
        ],
        "cash",
      ),
    ).income,
    120,
  );
});
test("explicit accrual recognizes full unpaid amount in its period", () => {
  const pay = p({
    status: "expected",
    planned_date: "2026-11-05",
    paid_at: null,
    accrual_date: "2026-10-05",
  });
  assert.equal(entryTotals(entries([pay], "profit")).income, 100);
  assert.equal(entries([pay], "cash").length, 0);
  assert.equal(entries([p({ accrual_date: "2026-09-01" })], "profit").length, 0);
});
test("default accrual follows operation date regardless of payment status", () => {
  const all = [
    p({ planned_date: "2026-10-01", status: "partial", paid_amount: 35 }),
    p({ planned_date: "2026-10-05", status: "expected" }),
  ];
  assert.equal(entryTotals(entries(all, "profit")).income, 200);
  assert.equal(entries([p()], "profit").length, 0);
});

test("deposits affect cash but not profit, current article policy wins", () => {
  const deposit = p({ kind: "deposit_in" });
  assert.equal(entries([deposit], "profit").length, 0);
  assert.equal(entries([deposit], "cash")[0]?.activity, "Финансовая деятельность");
  const cat: FinanceCatalog = {
    categories: [],
    articles: [
      {
        id: "a",
        name: "Займ",
        code: null,
        category_id: null,
        position: 0,
        direction: "in",
        created_at: "",
        updated_at: "",
        cash_flow_type: "financing",
        affects_profit: false,
      },
    ],
  };
  assert.equal(entries([p({ article_id: "a" })], "profit", cat).length, 0);
  assert.equal(
    entries([p({ article_id: "a" })], "cash", cat)[0]?.activity,
    "Финансовая деятельность",
  );
});
test("object filters retain unallocated separately; zero income has no margin", () => {
  assert.equal(entries([p(), p({ property_id: "one" })], "cash", catalog, "none").length, 1);
  assert.equal(
    entries([p(), p({ property_id: "one" }), p({ property_id: "two" })], "cash", catalog, "one")
      .length,
    1,
  );
  assert.equal(entryTotals(entries([p({ direction: "out" })], "cash")).margin, null);
});
test("debt subtracts only paid matching settlement and respects closed/object filters", () => {
  const debt = {
    id: "d",
    amount: 100,
    status: "open",
    direction: "payable",
    property_id: "one",
  } as FinanceObligation;
  const all = [
    p({ obligation_id: "d", direction: "in", amount: 100 }),
    p({ obligation_id: "d", direction: "out", status: "partial", paid_amount: 25 }),
  ];
  assert.equal(currentDebts([debt], all)[0]?.remaining, 75);
  assert.equal(currentDebts([{ ...debt, status: "closed" }], all).length, 0);
  assert.equal(currentDebts([debt], all, "two").length, 0);
});
test("CSV quotes separators, quotes and embedded newlines", () => {
  assert.equal(csvText([["a;b", 'a"b', "a\nb", 12]]), '\uFEFF"a;b";"a""b";"a\nb";"12"');
});

test("category plan/fact retains cash from plans outside the selected month", () => {
  const cash = entries([p()], "cash");
  const plan = entries(
    [p({ planned_date: "2026-10-05", status: "expected", amount: 200 })],
    "plan",
  );
  const group = planFactCategories(plan, cash)[0];
  assert.equal(group?.plan, 200);
  assert.equal(group?.fact, 100);
  assert.equal(group?.planEntries.length, 1);
  assert.equal(group?.cashEntries.length, 1);
});

test("rental advance and balance recognize fee once; transit stays in cash only", () => {
  const cat: FinanceCatalog = {
    categories: [
      {
        id: "income",
        name: "Доходы компании",
        direction: "in",
        position: 0,
        created_at: "",
        updated_at: "",
      },
    ],
    articles: [
      {
        id: "fee",
        name: "Комиссия компании",
        direction: "in",
        category_id: "income",
        code: "company_commission",
        affects_profit: true,
        position: 0,
        created_at: "",
        updated_at: "",
      },
    ],
  };
  const advance = p({
    id: "advance",
    amount: 150000,
    planned_date: "2026-10-14",
    paid_at: null,
    kind: "rent_in",
    rental_component: "rent",
    company_fee: 100000,
    booking_id: "b",
    rental_period: "2026-10-01",
  });
  const all = [
    advance,
    p({
      id: "balance",
      amount: 750000,
      planned_date: "2026-10-19",
      paid_at: null,
      status: "expected",
      kind: "rent_in",
      rental_component: "rent",
      company_fee: 0,
      booking_id: "b",
      rental_period: "2026-10-01",
    }),
    p({
      id: "deposit",
      amount: 500000,
      planned_date: "2026-10-19",
      paid_at: null,
      kind: "deposit_in",
      status: "expected",
    }),
    p({
      id: "owner",
      amount: 800000,
      planned_date: "2026-10-19",
      paid_at: null,
      kind: "owner_payout",
      direction: "out",
      status: "partial",
      paid_amount: 0,
    }),
    p({
      id: "ku",
      amount: 2500,
      planned_date: "2026-10-14",
      paid_at: null,
      rental_component: "utilities",
      company_fee: 0,
    }),
    p({
      id: "advert",
      amount: 2000,
      planned_date: "2026-10-14",
      paid_at: null,
      direction: "out",
      kind: "agency_cost",
    }),
    p({
      id: "legacy",
      amount: 100000,
      planned_date: "2026-10-19",
      paid_at: null,
      booking_id: "b",
      management_period: "2026-10-01",
    }),
  ];
  const profit = entries(all, "profit", cat);
  assert.deepEqual(entryTotals(profit), { income: 100000, expense: 2000, net: 98000, margin: 98 });
  assert.equal(profit[0]!.article, "Комиссия компании");
  assert.equal(profit[0]!.category, "Доходы компании");
  assert.equal(profit[0]!.payment, advance, "editing allocation opens original 150000 receipt");
  assert.equal(
    entryTotals(entries(all, "cash", cat)).income,
    152500,
    "actual advance plus KU, no duplicate fee",
  );
  assert.equal(
    entryTotals(entries(all, "plan", cat)).income,
    1402500,
    "gross rent + deposit + KU, no legacy duplicate",
  );
  assert.equal(entries(all, "profit", cat, "another-object").length, 0);
  assert.equal(
    entryTotals(entries([advance], "profit")).income,
    100000,
    "works without catalog during rollout",
  );
  assert.equal(
    entries([p({ kind: "rent_in", planned_date: "2026-10-14" })], "profit").length,
    0,
    "unknown commission is not guessed",
  );
});

test("transit article policy excludes KU remittance and deposit return from company profit", () => {
  const cat: FinanceCatalog = {
    categories: [],
    articles: [
      {
        id: "ku-out",
        name: "Перечисление КУ собственнику",
        code: "utilities_out",
        direction: "out",
        category_id: null,
        affects_profit: false,
        position: 0,
        created_at: "",
        updated_at: "",
      },
    ],
  };
  const all = [
    p({
      id: "ku-out",
      amount: 2500,
      direction: "out",
      planned_date: "2026-10-14",
      article_id: "ku-out",
    }),
    p({
      id: "deposit-return",
      amount: 500000,
      direction: "out",
      planned_date: "2026-10-14",
      kind: "deposit_out",
    }),
  ];
  assert.equal(entries(all, "profit", cat).length, 0);
  assert.equal(entryTotals(entries(all, "cash", cat)).expense, 502500);
});
