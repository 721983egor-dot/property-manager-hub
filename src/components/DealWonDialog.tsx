import { fetchCrmClients } from "@/lib/clients";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { closeDealAsWon, DEAL_SOURCES, type Deal } from "@/lib/deals";
import { companyIncome } from "@/lib/crm-results-model";
import { internalTitle, type Property } from "@/lib/properties";
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deal: Deal;
  stageId: string;
  properties: Property[];
  onClosed?: () => void;
};
export function DealWonDialog({ open, onOpenChange, deal, stageId, properties, onClosed }: Props) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({
    queryKey: ["crm-clients"],
    queryFn: fetchCrmClients,
    enabled: open,
  });
  const [propertyId, setPropertyId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [day, setDay] = useState("1");
  const [source, setSource] = useState("");
  const [incomeType, setIncomeType] = useState<"percent" | "amount">("percent");
  const [income, setIncome] = useState("");
  const [booking, setBooking] = useState(true);
  const property = properties.find((p) => p.id === propertyId);
  const active = properties.filter((p) => p.status !== "archived" && p.portfolio === "rm");
  useEffect(() => {
    if (!open) return;
    setPropertyId(deal.closed_property_id ?? deal.property_id ?? "");
    setStart(deal.start_date ?? "");
    setEnd(deal.end_date ?? "");
    setRent(deal.price_month == null ? "" : String(deal.price_month));
    setDeposit(deal.deposit == null ? "" : String(deal.deposit));
    setDay(String(deal.payment_day ?? 1));
    setSource(deal.closing_source || deal.source || "");
    setIncomeType(deal.income_type ?? "percent");
    setIncome(deal.income_value == null ? "" : String(deal.income_value));
    setBooking(true);
  }, [
    open,
    deal.id,
    deal.closed_property_id,
    deal.property_id,
    deal.start_date,
    deal.end_date,
    deal.price_month,
    deal.deposit,
    deal.payment_day,
    deal.closing_source,
    deal.source,
    deal.income_type,
    deal.income_value,
  ]);
  const selectProperty = (id: string) => {
    setPropertyId(id);
    const p = properties.find((x) => x.id === id);
    setRent(p?.price_month == null ? "" : String(p.price_month));
    setDeposit(p?.deposit == null ? "" : String(p.deposit));
    setIncomeType(p?.management_fee_type ?? "percent");
    setIncome(p?.management_fee_value == null ? "" : String(p.management_fee_value));
  };
  useEffect(() => {
    if (open && property) {
      setRent((v) => v || String(property.price_month ?? ""));
      setDeposit((v) => v || String(property.deposit ?? ""));
      setIncome((v) => v || String(property.management_fee_value ?? ""));
      if (deal.income_type == null) setIncomeType(property.management_fee_type ?? "percent");
    }
  }, [open, propertyId, property, deal.income_type]);
  const fee = useMemo(() => {
    try {
      return income.trim() === "" ? null : companyIncome(Number(rent), incomeType, Number(income));
    } catch {
      return null;
    }
  }, [rent, incomeType, income]);
  const save = useMutation({
    mutationFn: async () => {
      if (
        !property ||
        !deal.client_id ||
        !start ||
        !end ||
        end <= start ||
        !rent.trim() ||
        !deposit.trim() ||
        !source ||
        !income.trim() ||
        fee == null
      )
        throw new Error(
          "Заполните объект, клиента, сроки, стоимость, депозит, площадку и доход компании",
        );
      return closeDealAsWon(
        deal.id,
        stageId,
        {
          property_id: propertyId,
          start_date: start,
          end_date: end,
          price_month: Number(rent),
          deposit: Number(deposit),
          commission: deal.commission,
          payment_day: Number(day),
          closing_source: source,
          income_type: incomeType,
          income_value: Number(income),
          create_booking: booking,
        },
        {
          client_id: deal.client_id,
          service_type: property.service_type ?? "management",
          source: deal.source,
        },
      );
    },
    onSuccess: () => {
      for (const key of [
        "deals",
        "deal-history",
        "properties",
        "bookings",
        "finance-rentals",
        "finance-object-properties",
      ])
        qc.invalidateQueries({ queryKey: [key] });
      toast.success(booking ? "Сделка закрыта, бронь создана" : "Сделка закрыта успешно");
      onClosed?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const field = (label: string, value: string, set: (s: string) => void, type = "text") => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        min={type === "number" ? 0 : undefined}
      />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Оформить аренду и бронь</DialogTitle>
          <DialogDescription>
            Условия сохранятся в сделке и карточке объекта. Деньги не отмечаются полученными.
          </DialogDescription>
        </DialogHeader>
        <section className="crm-section">
          <h3>01 · Объект и клиент</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Объект</Label>
              <Select value={propertyId} onValueChange={selectProperty}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите объект" />
                </SelectTrigger>
                <SelectContent>
                  {active.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {internalTitle(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Клиент</Label>
              <p className="mt-2 text-sm text-muted-foreground">
                {deal.client_id
                  ? clients.find((c) => c.id === deal.client_id)?.full_name ||
                    "Клиент из карточки сделки"
                  : "Сначала выберите клиента в сделке"}
              </p>
            </div>
          </div>
        </section>
        <section className="crm-section">
          <h3>02 · Сроки и условия аренды</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Начало аренды", start, setStart, "date")}
            {field("Окончание аренды", end, setEnd, "date")}
            {field("Аренда в месяц, ₽", rent, setRent, "number")}
            {field("Обеспечительный платёж, ₽", deposit, setDeposit, "number")}
            {field("День ежемесячной оплаты (1–31)", day, setDay, "number")}
            <div className="grid gap-1.5">
              <Label>Площадка успешной сделки</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите площадку" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...DEAL_SOURCES, ...(source ? [source] : [])])].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
        <section className="crm-section">
          <h3>03 · Доход компании</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Вознаграждение в месяц</Label>
              <Select
                value={incomeType}
                onValueChange={(v) => setIncomeType(v as "percent" | "amount")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Процент от аренды</SelectItem>
                  <SelectItem value="amount">Фиксированная сумма</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {field(
              incomeType === "percent" ? "Процент, %" : "Сумма в месяц, ₽",
              income,
              setIncome,
              "number",
            )}
          </div>
          <div className="crm-income mt-4">
            <div>
              <small>Доход компании / месяц</small>
              <strong>{fee == null ? "—" : fee.toLocaleString("ru-RU") + " ₽"}</strong>
            </div>
            <div>
              <small>Собственнику до расходов / месяц</small>
              <strong>
                {fee == null ? "—" : (Number(rent) - fee).toLocaleString("ru-RU") + " ₽"}
              </strong>
            </div>
          </div>
        </section>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={booking} onCheckedChange={(v) => setBooking(v === true)} />
          <span>
            Создать бронь в календаре объекта
            <span className="mt-1 block text-xs text-muted-foreground">
              Долгосрочная аренда. При занятых датах сделка не будет закрыта.
            </span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {save.isPending
              ? "Сохранение…"
              : booking
                ? "Закрыть успешно и создать бронь"
                : "Закрыть успешно"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
