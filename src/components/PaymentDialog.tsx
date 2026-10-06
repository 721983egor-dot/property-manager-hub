import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  defaultDirectionForKind,
  deletePayment,
  savePayment,
  savePaymentSeries,
  type Payment,
  type PaymentDirection,
  type PaymentKind,
  type PaymentStatus,
} from "@/lib/finance";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";
import { cn } from "@/lib/utils";

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
    queryKey: ["properties"],
    queryFn: fetchProperties,
    enabled: open,
  });
  const { data: counterparties = [] } = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
    enabled: open,
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
    () =>
      properties
        .filter((p) => p.status !== "archived")
        .map((p) => ({
          id: p.id,
          label: `${internalTitle(p)}${p.ref_id != null ? ` · №${p.ref_id}` : ""}`,
        })),
    [properties],
  );

  const kinds = PAYMENT_KINDS.filter(
    (k) => k.value === "other" || k.direction === form.direction,
  );

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
      const id = await savePaymentSeries(
        payment?.id ?? null,
        input,
        !payment && form.repeat ? 11 : 0,
      );
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
      toast.success(payment ? "Операция обновлена" : "Операция добавлена");
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

  const title = payment
    ? "Изменить операцию"
    : form.direction === "out"
      ? "Добавить операцию расхода"
      : "Добавить операцию прихода";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-border px-6 py-4 text-left">
          <SheetTitle className="text-xl font-semibold">{title}</SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-px bg-border">
          <Field label="Сумма" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0,00"
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </Field>
          <Field label="Счёт" required>
            <Select
              value={form.account}
              onValueChange={(v) => setForm((p) => ({ ...p, account: v }))}
            >
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
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
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
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
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </Field>
          <Field label="Проект или направление">
            <Select
              value={form.property_id || "__none__"}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, property_id: v === "__none__" ? "" : v }))
              }
            >
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
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
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
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
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Описание
            </p>
            <Textarea
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              rows={3}
              className="border-0 px-0 shadow-none focus-visible:ring-0"
              placeholder=""
            />
            {!form.counterparty_id && (
              <Input
                className="mt-2"
                placeholder="Имя контрагента, если нет в списке"
                value={form.counterparty_name}
                onChange={(e) => setForm((p) => ({ ...p, counterparty_name: e.target.value }))}
              />
            )}
          </div>
        </div>

        <div className="space-y-3 px-6 py-4">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={form.countInObligations}
              onCheckedChange={(v) =>
                setForm((p) => ({ ...p, countInObligations: v === true }))
              }
            />
            <span>Учитывать в обязательствах</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={form.otherAccrual}
              onCheckedChange={(v) => setForm((p) => ({ ...p, otherAccrual: v === true }))}
            />
            <span>Начислить на другую дату</span>
          </label>
          {form.otherAccrual && (
            <Input
              type="date"
              value={form.accrual_date}
              onChange={(e) => setForm((p) => ({ ...p, accrual_date: e.target.value }))}
            />
          )}
          {!payment && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={form.repeat}
                onCheckedChange={(v) => setForm((p) => ({ ...p, repeat: v === true }))}
              />
              <span>Повторять операцию каждый месяц (12 мес.)</span>
            </label>
          )}

          <Button
            type="button"
            className="mt-2 bg-violet-600 hover:bg-violet-700"
            disabled={!form.planned_date || form.amount === "" || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {payment ? "Сохранить" : "Добавить операцию"}
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
              "rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground",
            )}
          >
            Файлы к операциям пока не храним — без банка и без загрузки документов.
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
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </p>
      {children}
    </div>
  );
}
