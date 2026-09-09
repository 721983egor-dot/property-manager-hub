import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { closeDealAsWon, type Deal } from "@/lib/deals";
import { internalTitle, type Property } from "@/lib/properties";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  stageId: string;
  properties: Property[];
  onClosed?: () => void;
};

/** Окно закрытия успешной сделки: объект, даты и финансовые условия аренды. */
export function DealWonDialog({ open, onOpenChange, deal, stageId, properties, onClosed }: Props) {
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priceMonth, setPriceMonth] = useState("");
  const [deposit, setDeposit] = useState("");
  const [commission, setCommission] = useState("");
  const [paymentDay, setPaymentDay] = useState("1");

  const property = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );
  const hasCommission = property?.commission != null && Number(property.commission) > 0;

  useEffect(() => {
    if (!open) return;
    setPropertyId(deal.closed_property_id ?? deal.property_id ?? "");
    setStartDate(deal.start_date ?? "");
    setEndDate(deal.end_date ?? "");
    setPriceMonth(deal.price_month != null ? String(deal.price_month) : "");
    setDeposit(deal.deposit != null ? String(deal.deposit) : "");
    setCommission(deal.commission != null ? String(deal.commission) : "");
    setPaymentDay(deal.payment_day != null ? String(deal.payment_day) : "1");
  }, [open, deal]);

  useEffect(() => {
    if (!property) return;
    setPriceMonth((prev) => (prev ? prev : property.price_month != null ? String(property.price_month) : ""));
    setDeposit((prev) => (prev ? prev : property.deposit != null ? String(property.deposit) : ""));
    setCommission((prev) => (prev ? prev : property.commission != null ? String(property.commission) : ""));
  }, [property]);

  const save = useMutation({
    mutationFn: async () => {
      if (!propertyId) throw new Error("Выберите объект аренды");
      if (!startDate || !endDate) throw new Error("Укажите даты заезда и выезда");
      if (endDate <= startDate) throw new Error("Дата выезда должна быть позже заезда");
      if (!priceMonth.trim()) throw new Error("Укажите цену в месяц");
      if (!deposit.trim()) throw new Error("Укажите депозит");
      if (hasCommission && !commission.trim()) throw new Error("Укажите комиссию");
      const day = Number(paymentDay);
      if (!day || day < 1 || day > 31) throw new Error("Укажите день ежемесячной оплаты (1–31)");
      if (!deal.client_id) throw new Error("Сначала выберите клиента в сделке");

      return closeDealAsWon(
        deal.id,
        stageId,
        {
          property_id: propertyId,
          start_date: startDate,
          end_date: endDate,
          price_month: Number(priceMonth),
          deposit: Number(deposit),
          commission: hasCommission ? Number(commission) : null,
          payment_day: day,
        },
        {
          client_id: deal.client_id,
          service_type: property?.service_type ?? "management",
          source: deal.source,
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal-history", deal.id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Сделка закрыта успешно");
      onClosed?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось закрыть сделку"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Успешное закрытие сделки</DialogTitle>
          <DialogDescription>
            {property?.service_type === "commission_only"
              ? "Объект получит статус «Сдан», бронирование в календарь не добавляется."
              : "Даты закроются в календаре, объект получит статус «Сдан»."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Арендованный объект</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue placeholder="Выберите объект" /></SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {internalTitle(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Дата заезда</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Дата выезда</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Цена в месяц, ₽</Label>
              <Input
                inputMode="numeric"
                value={priceMonth}
                onChange={(e) => setPriceMonth(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Депозит, ₽</Label>
              <Input
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
            {hasCommission && (
              <div className="grid gap-1.5">
                <Label>Комиссия, %</Label>
                <Input
                  inputMode="numeric"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value.replace(/[^\d]/g, ""))}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Число ежемесячной оплаты</Label>
              <Input
                inputMode="numeric"
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Закрыть сделку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
