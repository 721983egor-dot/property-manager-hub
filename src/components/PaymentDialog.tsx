import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ensureCounterparty,
  fetchCounterparties,
  kindFromPaymentDirection,
  saveObligation,
  type CounterpartyKind,
} from "@/lib/finance-counterparties";
import {
  PAYMENT_ACCOUNTS,
  PAYMENT_KINDS,
  buildPaymentSeriesDates,
  defaultDirectionForKind,
  deletePayment,
  fetchFinancePropertyOptions,
  financePropertyLabel,
  savePayment,
  savePaymentSeries,
  type Payment,
  type PaymentDirection,
  type PaymentKind,
  type PaymentRepeatInterval,
  type PaymentStatus,
} from "@/lib/finance";
import { toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";

type RepeatEndMode = "count" | "until";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: Payment | null;
  defaultPropertyId?: string | undefined;
  defaultDate?: string | undefined;
  defaultDirection?: PaymentDirection | undefined;
  defaultCounterpartyId?: string | undefined;
  defaultCounterpartyName?: string | undefined;
};

type FormState = {
  planned_date: string;
  amount: string;
  direction: PaymentDirection;
  status: PaymentStatus;
  kind: PaymentKind;
  account: string;
  property_id: string;
  counterparty_id: string;
  counterparty_name: string;
  comment: string;
  paid_at: string;
  paid_amount: string;
  countInObligations: boolean;
  otherAccrual: boolean;
  accrual_date: string;
  repeat: boolean;
  repeatInterval: PaymentRepeatInterval;
  repeatEndMode: RepeatEndMode;
  repeatCount: string;
  repeatUntil: string;
};

function emptyForm(
  propertyId = "",
  date = "",
  direction: PaymentDirection = "out",
  counterpartyId = "",
  counterpartyName = "",
): FormState {
  const kind = direction === "out" ? "agency_cost" : "rent_in";
  return {
    planned_date: date || toISODate(new Date()),
    amount: "",
    direction,
    status: "expected",
    kind,
    account: "Основной",
    property_id: propertyId,
    counterparty_id: counterpartyId,
    counterparty_name: counterpartyName,
    comment: "",
    paid_at: "",
    paid_amount: "",
    countInObligations: false,
    otherAccrual: false,
    accrual_date: "",
    repeat: false,
    repeatInterval: "month",
    repeatEndMode: "count",
    repeatCount: "12",
    repeatUntil: "",
  };
}

function fromPayment(payment: Payment): FormState {
  return {
    planned_date: payment.planned_date,
    amount: String(payment.amount),
    direction: payment.direction,
    status: payment.status === "overdue" ? "expected" : payment.status,
    kind: payment.kind,
    account: payment.account || "Основной",
    property_id: payment.property_id ?? "",
    counterparty_id: payment.counterparty_id ?? "",
    counterparty_name: payment.counterparty_name,
    comment: payment.comment,
    paid_at: payment.paid_at ?? "",
    paid_amount: payment.paid_amount == null ? "" : String(payment.paid_amount),
    countInObligations: Boolean(payment.obligation_id),
    otherAccrual: Boolean(payment.accrual_date),
    accrual_date: payment.accrual_date ?? "",
    repeat: false,
    repeatInterval: "month",
    repeatEndMode: "count",
    repeatCount: "12",
    repeatUntil: "",
  };
}

export function PaymentDialog({
  open,
  onOpenChange,
  payment,
  defaultPropertyId,
  defaultDate,
  defaultDirection,
  defaultCounterpartyId,
  defaultCounterpartyName,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(
      defaultPropertyId,
      defaultDate,
      defaultDirection ?? "out",
      defaultCounterpartyId,
      defaultCounterpartyName,
    ),
  );

  const { data: properties = [] } = useQuery({
    queryKey: ["finance-property-options"],
    queryFn: fetchFinancePropertyOptions,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const { data: counterparties = [] } = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
    enabled: open,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      payment
        ? fromPayment(payment)
        : emptyForm(
            defaultPropertyId,
            defaultDate,
            defaultDirection ?? "out",
            defaultCounterpartyId,
            defaultCounterpartyName,
          ),
    );
  }, [
    open,
    payment,
    defaultPropertyId,
    defaultDate,
    defaultDirection,
    defaultCounterpartyId,
    defaultCounterpartyName,
  ]);

  const propertyOptions = useMemo(
    () => properties.map((p) => ({ id: p.id, label: financePropertyLabel(p) })),
    [properties],
  );

  const kinds = PAYMENT_KINDS.filter(
    (k) => k.value === "other" || k.direction === form.direction,
  );

  const seriesDates = useMemo(() => {
    if (payment || !form.repeat || !form.planned_date) return [form.planned_date].filter(Boolean);
    if (form.repeatEndMode === "until") {
      if (!form.repeatUntil) return [form.planned_date];
      return buildPaymentSeriesDates(form.planned_date, {
        interval: form.repeatInterval,
        untilDate: form.repeatUntil,
      });
    }
    const count = Number(form.repeatCount);
    return buildPaymentSeriesDates(form.planned_date, {
      interval: form.repeatInterval,
      count: Number.isFinite(count) && count > 0 ? count : 1,
    });
  }, [
    payment,
    form.repeat,
    form.planned_date,
    form.repeatEndMode,
    form.repeatUntil,
    form.repeatCount,
    form.repeatInterval,
  ]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-counterparties"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-obligations"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const party = await ensureCounterparty({
        id: form.counterparty_id || null,
        name: form.counterparty_name,
        kind: kindFromPaymentDirection(form.direction, form.kind) as CounterpartyKind,
      });
      const input = {
        planned_date: form.planned_date,
        amount: Number(form.amount),
        direction: form.direction,
        status: form.status,
        kind: form.kind,
        property_id: form.property_id || null,
        client_id: null as string | null,
        counterparty_id: party.id,
        counterparty_name: party.name || form.counterparty_name,
        account: form.account,
        comment: form.comment,
        paid_at: form.paid_at || null,
        paid_amount: form.paid_amount === "" ? null : Number(form.paid_amount),
        accrual_date: form.otherAccrual ? form.accrual_date || null : null,
        obligation_id: payment?.obligation_id ?? null,
      };
      let repeatOpts = null as
        | { interval: PaymentRepeatInterval; count?: number; untilDate?: string }
        | null;
      if (!payment && form.repeat) {
        if (form.repeatEndMode === "until") {
          if (!form.repeatUntil) throw new Error("Укажите дату окончания повтора");
          if (form.repeatUntil < form.planned_date) {
            throw new Error("Дата окончания не раньше первой операции");
          }
          repeatOpts = { interval: form.repeatInterval, untilDate: form.repeatUntil };
        } else {
          const count = Number(form.repeatCount);
          if (!Number.isFinite(count) || count < 1) {
            throw new Error("Укажите число повторов (от 1)");
          }
          if (count > 36) throw new Error("Не больше 36 операций в серии");
          repeatOpts = { interval: form.repeatInterval, count };
        }
      }
      const id = await savePaymentSeries(payment?.id ?? null, input, repeatOpts);
      if (form.countInObligations && party.id && !payment?.obligation_id) {
        const obligationId = await saveObligation(null, {
          counterparty_id: party.id,
          planned_date: form.planned_date,
          amount: Number(form.amount),
          direction: form.direction === "out" ? "receivable" : "payable",
          description: form.comment || (form.direction === "out" ? "Расход" : "Приход"),
          property_id: form.property_id || null,
        });
        await savePayment(id, { ...input, obligation_id: obligationId });
      }
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success(
        payment
          ? "Операция обновлена"
          : form.repeat && seriesDates.length > 1
            ? `Добавлено операций: ${seriesDates.length}`
            : "Операция добавлена",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка сохранения"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!payment) throw new Error("Нет операции");
      return deletePayment(payment.id);
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success("Операция удалена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  const setKind = (kind: PaymentKind) => {
    setForm((prev) => ({
      ...prev,
      kind,
      direction: defaultDirectionForKind(kind) === prev.direction ? prev.direction : prev.direction,
    }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto border-l border-[#e8edf2] bg-[#f7f8fa] p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-[#e8edf2] bg-white px-6 py-4 text-left">
          <SheetTitle className="text-[22px] font-semibold tracking-tight text-slate-900">
            {payment ? (
              "Изменить операцию"
            ) : (
              <>
                Добавить операцию{" "}
                <span className="underline decoration-slate-900 decoration-2 underline-offset-4">
                  {form.direction === "out" ? "расхода" : "прихода"}
                </span>
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-px border-b border-[#e8edf2] bg-[#e8edf2]">
          <Field label="Сумма" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0,00"
              className="h-9 border-0 px-0 text-base shadow-none focus-visible:ring-0"
            />
          </Field>
          <Field label="Счёт" required>
            <Select
              value={form.account}
              onValueChange={(v) => setForm((p) => ({ ...p, account: v }))}
            >
              <SelectTrigger className="h-9 border-0 px-0 shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_ACCOUNTS.map((account) => (
                  <SelectItem key={account} value={account}>
                    {account}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Статья">
            <Select value={form.kind} onValueChange={(v) => setKind(v as PaymentKind)}>
              <SelectTrigger className="h-9 border-0 px-0 shadow-none focus:ring-0">
                <SelectValue placeholder="Выберите статью…" />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Дата">
            <Input
              type="date"
              value={form.planned_date}
              onChange={(e) => setForm((p) => ({ ...p, planned_date: e.target.value }))}
              className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </Field>
          <Field label="Проект или направление">
            <Select
              value={form.property_id || "__none__"}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, property_id: v === "__none__" ? "" : v }))
              }
            >
              <SelectTrigger className="h-9 border-0 px-0 shadow-none focus:ring-0">
                <SelectValue placeholder="Выберите проект…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без проекта</SelectItem>
                {propertyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Контрагент">
            <Select
              value={form.counterparty_id || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  setForm((p) => ({ ...p, counterparty_id: "" }));
                  return;
                }
                const found = counterparties.find((c) => c.id === v);
                setForm((p) => ({
                  ...p,
                  counterparty_id: v,
                  counterparty_name: found?.name ?? p.counterparty_name,
                }));
              }}
            >
              <SelectTrigger className="h-9 border-0 px-0 shadow-none focus:ring-0">
                <SelectValue placeholder="Выберите контрагента…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Новый / без карточки</SelectItem>
                {counterparties.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2 bg-white px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              Описание
            </p>
            <Textarea
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              rows={3}
              className="min-h-[72px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
              placeholder=""
            />
            {!form.counterparty_id && (
              <Input
                className="mt-2 border-[#e8edf2]"
                placeholder="Имя контрагента, если нет в списке"
                value={form.counterparty_name}
                onChange={(e) => setForm((p) => ({ ...p, counterparty_name: e.target.value }))}
              />
            )}
          </div>
        </div>

        <div className="space-y-3.5 bg-[#f7f8fa] px-6 py-5">
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <Checkbox
              checked={form.countInObligations}
              onCheckedChange={(v) =>
                setForm((p) => ({ ...p, countInObligations: v === true }))
              }
            />
            <span>Учитывать в обязательствах</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <Checkbox
              checked={form.otherAccrual}
              onCheckedChange={(v) => setForm((p) => ({ ...p, otherAccrual: v === true }))}
            />
            <span>Начислить на другую дату</span>
          </label>
          {form.otherAccrual && (
            <Input
              type="date"
              className="border-[#e8edf2] bg-white"
              value={form.accrual_date}
              onChange={(e) => setForm((p) => ({ ...p, accrual_date: e.target.value }))}
            />
          )}
          {!payment && (
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <Checkbox
                  checked={form.repeat}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, repeat: v === true }))}
                />
                <span>Повторять операцию</span>
              </label>
              {form.repeat && (
                <div className="space-y-3 rounded-lg border border-[#e8edf2] bg-white p-3">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      Период
                    </p>
                    <Select
                      value={form.repeatInterval}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, repeatInterval: v as PaymentRepeatInterval }))
                      }
                    >
                      <SelectTrigger className="h-9 border-[#e8edf2]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">Каждый месяц</SelectItem>
                        <SelectItem value="week">Каждую неделю</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      Срок жизни
                    </p>
                    <Select
                      value={form.repeatEndMode}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, repeatEndMode: v as RepeatEndMode }))
                      }
                    >
                      <SelectTrigger className="h-9 border-[#e8edf2]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Количество раз</SelectItem>
                        <SelectItem value="until">До даты</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.repeatEndMode === "count" ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        Сколько операций
                      </p>
                      <Input
                        type="number"
                        min={1}
                        max={36}
                        className="h-9 border-[#e8edf2]"
                        value={form.repeatCount}
                        onChange={(e) => setForm((p) => ({ ...p, repeatCount: e.target.value }))}
                      />
                      <p className="text-xs text-slate-400">
                        Включая первую. Для аренды обычно 12 месяцев.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        Повторять до
                      </p>
                      <Input
                        type="date"
                        className="h-9 border-[#e8edf2]"
                        value={form.repeatUntil}
                        min={form.planned_date}
                        onChange={(e) => setForm((p) => ({ ...p, repeatUntil: e.target.value }))}
                      />
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Будет создано <span className="font-semibold text-slate-700">{seriesDates.length}</span>{" "}
                    {seriesDates.length === 1 ? "операция" : "операций"}
                    {seriesDates.length > 1
                      ? ` · до ${seriesDates[seriesDates.length - 1]}`
                      : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            className="mt-1 h-11 w-full bg-[#7c5cff] text-base hover:bg-[#6b4cf0]"
            disabled={
              !form.planned_date ||
              form.amount === "" ||
              saveMutation.isPending ||
              (!!form.repeat &&
                !payment &&
                form.repeatEndMode === "until" &&
                !form.repeatUntil)
            }
            onClick={() => saveMutation.mutate()}
          >
            {payment
              ? "Сохранить"
              : form.repeat && seriesDates.length > 1
                ? `Добавить ${seriesDates.length} операций`
                : "Добавить операцию"}
          </Button>

          {payment && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("Удалить операцию?")) deleteMutation.mutate();
              }}
            >
              Удалить
            </Button>
          )}

          <div
            className={cn(
              "rounded-lg border border-dashed border-[#cfd8e3] bg-white px-4 py-10 text-center text-sm text-slate-400",
            )}
          >
            Перетащите сюда документы или выберите файлы
            <span className="mt-1 block text-xs">
              (файлы пока не храним — без банка)
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </p>
      {children}
    </div>
  );
}
