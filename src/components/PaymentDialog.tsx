import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchClients } from "@/lib/bookings";
import {
  PAYMENT_DIRECTIONS,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  defaultDirectionForKind,
  deletePayment,
  savePayment,
  type Payment,
  type PaymentDirection,
  type PaymentKind,
  type PaymentStatus,
} from "@/lib/finance";
import { fetchProperties, formatMoney, internalTitle } from "@/lib/properties";
import { toISODate } from "@/lib/rentals";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: Payment | null;
  defaultPropertyId?: string | undefined;
  defaultDate?: string | undefined;
};

type FormState = {
  planned_date: string;
  amount: string;
  direction: PaymentDirection;
  status: PaymentStatus;
  kind: PaymentKind;
  property_id: string;
  client_id: string;
  counterparty_name: string;
  comment: string;
  paid_at: string;
  paid_amount: string;
};

function emptyForm(propertyId = "", date = ""): FormState {
  return {
    planned_date: date || toISODate(new Date()),
    amount: "",
    direction: "in",
    status: "expected",
    kind: "rent_in",
    property_id: propertyId,
    client_id: "",
    counterparty_name: "",
    comment: "",
    paid_at: "",
    paid_amount: "",
  };
}

function fromPayment(payment: Payment): FormState {
  return {
    planned_date: payment.planned_date,
    amount: String(payment.amount),
    direction: payment.direction,
    status: payment.status === "overdue" ? "expected" : payment.status,
    kind: payment.kind,
    property_id: payment.property_id ?? "",
    client_id: payment.client_id ?? "",
    counterparty_name: payment.counterparty_name,
    comment: payment.comment,
    paid_at: payment.paid_at ?? "",
    paid_amount: payment.paid_amount == null ? "" : String(payment.paid_amount),
  };
}

export function PaymentDialog({
  open,
  onOpenChange,
  payment,
  defaultPropertyId,
  defaultDate,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultPropertyId, defaultDate));

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
    enabled: open,
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["booking-clients"],
    queryFn: fetchClients,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(payment ? fromPayment(payment) : emptyForm(defaultPropertyId, defaultDate));
  }, [open, payment, defaultPropertyId, defaultDate]);

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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      savePayment(payment?.id ?? null, {
        planned_date: form.planned_date,
        amount: Number(form.amount),
        direction: form.direction,
        status: form.status,
        kind: form.kind,
        property_id: form.property_id || null,
        client_id: form.client_id || null,
        counterparty_name: form.counterparty_name,
        comment: form.comment,
        paid_at: form.paid_at || null,
        paid_amount: form.paid_amount === "" ? null : Number(form.paid_amount),
      }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success(payment ? "Платёж обновлён" : "Платёж создан");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка сохранения"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!payment) throw new Error("Нет платежа");
      return deletePayment(payment.id);
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success("Платёж удалён");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  const setKind = (kind: PaymentKind) => {
    setForm((prev) => ({
      ...prev,
      kind,
      direction: defaultDirectionForKind(kind),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{payment ? "Изменить операцию" : "Добавить операцию"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Статья</Label>
            <Select value={form.kind} onValueChange={(v) => setKind(v as PaymentKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Направление</Label>
            <Select
              value={form.direction}
              onValueChange={(v) => setForm((p) => ({ ...p, direction: v as PaymentDirection }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_DIRECTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Статус</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((p) => ({ ...p, status: v as PaymentStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUSES.filter((s) => s.value !== "overdue").map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Просрочка считается по дате автоматически.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-date">Дата план</Label>
            <Input
              id="pay-date"
              type="date"
              value={form.planned_date}
              onChange={(e) => setForm((p) => ({ ...p, planned_date: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-amount">Сумма</Label>
            <Input
              id="pay-amount"
              type="number"
              min={0}
              step={1}
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Объект</Label>
            <Select
              value={form.property_id || "__none__"}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, property_id: v === "__none__" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Не выбран" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Не выбран</SelectItem>
                {propertyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Клиент CRM</Label>
            <Select
              value={form.client_id || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  setForm((p) => ({ ...p, client_id: "" }));
                  return;
                }
                const client = clients.find((c) => c.id === v);
                setForm((p) => ({
                  ...p,
                  client_id: v,
                  counterparty_name: p.counterparty_name || client?.full_name || "",
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Не выбран" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Не выбран</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pay-cp">Контрагент (если нет в CRM)</Label>
            <Input
              id="pay-cp"
              value={form.counterparty_name}
              onChange={(e) => setForm((p) => ({ ...p, counterparty_name: e.target.value }))}
              placeholder="ФИО или название"
            />
          </div>

          {(form.status === "paid" || form.status === "partial") && (
            <>
              <div className="space-y-2">
                <Label htmlFor="pay-paid-at">Дата факт</Label>
                <Input
                  id="pay-paid-at"
                  type="date"
                  value={form.paid_at}
                  onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-paid-amount">Сумма факт</Label>
                <Input
                  id="pay-paid-amount"
                  type="number"
                  min={0}
                  step={1}
                  value={form.paid_amount}
                  onChange={(e) => setForm((p) => ({ ...p, paid_amount: e.target.value }))}
                  placeholder={form.amount || "0"}
                />
              </div>
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pay-comment">Комментарий</Label>
            <Textarea
              id="pay-comment"
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        {form.amount && (
          <p className="text-sm text-muted-foreground">
            Сумма: {formatMoney(Number(form.amount) || 0)}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {payment && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Удалить платёж?")) deleteMutation.mutate();
                }}
              >
                Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!form.planned_date || form.amount === "" || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Сохранить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
