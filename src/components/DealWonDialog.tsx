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
import { fetchFinanceAccounts } from "@/lib/finance-accounts";
import { validateSeasons } from "@/lib/crm-commission-model";
import type { SeasonalRent } from "@/lib/crm-commission";
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
  const [serviceType, setServiceType] = useState<"management" | "commission_only">("management");
  const brokerage = serviceType === "commission_only";
  const [incomeType, setIncomeType] = useState<"percent" | "amount">("percent");
  const [income, setIncome] = useState("");
  const [booking, setBooking] = useState(true);
  const accounts = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: fetchFinanceAccounts,
    enabled: open,
  });
  const [account, setAccount] = useState("");
  const [oneTime, setOneTime] = useState("0");
  const [oneDate, setOneDate] = useState("");
  const [seasons, setSeasons] = useState<SeasonalRent[]>([]);
  const property = properties.find((p) => p.id === propertyId);
  const initialServiceType =
    deal.finance_terms?.service_type ??
    properties.find((p) => p.id === (deal.closed_property_id ?? deal.property_id))?.service_type ??
    "management";
  const active = properties.filter((p) => p.status !== "archived" && p.portfolio === "rm");
  useEffect(() => {
    if (!open) return;
    setServiceType(initialServiceType);
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
    setAccount(deal.finance_terms?.account_id ?? "");
    setOneTime(String(deal.finance_terms?.one_time ?? deal.commission ?? 0));
    setOneDate(deal.finance_terms?.one_time_date ?? deal.start_date ?? "");
    setSeasons(deal.finance_terms?.seasons ?? []);
  }, [
    open,
    deal.id,
    deal.closed_property_id,
    deal.property_id,
    deal.start_date,
    deal.end_date,
    deal.price_month,
    deal.deposit,
    deal.commission,
    deal.payment_day,
    deal.closing_source,
    deal.source,
    deal.income_type,
    deal.income_value,
    deal.finance_terms,
    initialServiceType,
  ]);
  const selectProperty = (id: string) => {
    setPropertyId(id);
    setServiceType(properties.find((p) => p.id === id)?.service_type ?? "management");
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
      return brokerage
        ? 0
        : income.trim() === ""
          ? null
          : companyIncome(Number(rent), incomeType, Number(income));
    } catch {
      return null;
    }
  }, [rent, incomeType, income, brokerage]);
  const save = useMutation({
    mutationFn: async () => {
      if (
        !property ||
        !deal.client_id ||
        !start ||
        !end ||
        end <= start ||
        !rent.trim() ||
        !Number.isFinite(Number(rent)) ||
        Number(rent) <= 0 ||
        !deposit.trim() ||
        !source ||
        (!brokerage && !income.trim()) ||
        fee == null
      )
        throw new Error(
          "Заполните объект, клиента, сроки, стоимость, депозит, площадку и доход компании",
        );
      validateSeasons(seasons, start, end);
      if (!account) throw new Error("Выберите счёт для дохода компании");
      if (
        !Number.isFinite(Number(oneTime)) ||
        Number(oneTime) < 0 ||
        (Number(oneTime) > 0 && !oneDate)
      )
        throw new Error("Укажите сумму и дату разовой комиссии");
      if (!brokerage)
        for (const period of seasons) companyIncome(period.price_month, incomeType, Number(income));
      return closeDealAsWon(
        deal.id,
        stageId,
        {
          service_type: serviceType,
          account_id: account,
          one_time: Number(oneTime),
          one_time_date: Number(oneTime) > 0 ? oneDate : null,
          seasons,
          property_id: propertyId,
          start_date: start,
          end_date: end,
          price_month: Number(rent),
          deposit: Number(deposit),
          commission: deal.commission,
          payment_day: Number(day),
          closing_source: source,
          income_type: brokerage ? "amount" : incomeType,
          income_value: brokerage ? 0 : Number(income),
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
        "payments",
        "crm-commission-payments",
        "deals",
        "deal-history",
        "properties",
        "bookings",
        "finance-rentals",
        "finance-object-properties",
      ])
        qc.invalidateQueries({ queryKey: [key] });
      toast.success(
        brokerage
          ? "Сделка закрыта. Разовая комиссия запланирована, срок аренды сохранён"
          : "Сделка закрыта. Доходы добавлены в финансовый календарь",
      );
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
        aria-label={label}
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
          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Сезонные цены аренды</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSeasons([...seasons, { start_date: "", end_date: "", price_month: 0 }])
                }
              >
                + Добавить период
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Вне этих периодов действует основная цена. Процент комиссии пересчитывается по цене на
              дату платежа.
            </p>
            {seasons.map((season, i) => {
              const update = (patch: Partial<SeasonalRent>) =>
                setSeasons(seasons.map((v, n) => (n === i ? { ...v, ...patch } : v)));
              return (
                <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-4">
                  <div>
                    <Label>С</Label>
                    <Input
                      type="date"
                      value={season.start_date}
                      onChange={(e) => update({ start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>По включительно</Label>
                    <Input
                      type="date"
                      value={season.end_date}
                      onChange={(e) => update({ end_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Аренда, ₽/мес.</Label>
                    <Input
                      type="number"
                      min="1"
                      value={season.price_month || ""}
                      onChange={(e) => update({ price_month: Number(e.target.value) })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    className="self-end"
                    onClick={() => setSeasons(seasons.filter((_, n) => n !== i))}
                  >
                    Убрать
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="crm-section">
          <h3>03 · Доход компании</h3>
          <div className="mb-4 grid gap-2">
            <Label>Как работаем по этой аренде</Label>
            <Select
              value={serviceType}
              onValueChange={(v) => setServiceType(v as "management" | "commission_only")}
            >
              <SelectTrigger aria-label="Формат работы">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="management">Управление · ежемесячное вознаграждение</SelectItem>
                <SelectItem value="commission_only">Только разовая комиссия</SelectItem>
              </SelectContent>
            </Select>
            {brokerage && (
              <p className="text-sm text-muted-foreground">
                Сохраняем клиента и срок аренды. Доход компании — только разовая комиссия; графики
                поступления аренды и выплат собственнику не создаются.
              </p>
            )}
          </div>
          {!brokerage && (
            <>
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
            </>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field("Разовая комиссия компании, ₽", oneTime, setOneTime, "number")}
            {Number(oneTime) > 0 && field("Дата разовой комиссии", oneDate, setOneDate, "date")}
            <div className="grid gap-1.5">
              <Label>Счёт получения дохода</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Карта, наличные или расчётный счёт" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? [])
                    .filter((a) => !a.archived)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {accounts.isError && (
                <p className="text-xs text-destructive">Не удалось загрузить счета.</p>
              )}
              {accounts.isSuccess && !accounts.data.some((a) => !a.archived) && (
                <p className="text-xs text-muted-foreground">
                  Добавьте счёт в настройках финансов.
                </p>
              )}
            </div>
          </div>
          {!brokerage && (
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
          )}
          {!brokerage && seasons.length > 0 && (
            <div className="mt-3 space-y-1 text-sm">
              {seasons.map((s, i) => (
                <p key={i}>
                  {s.start_date || "Дата"} — {s.end_date || "Дата"}: комиссия{" "}
                  {s.price_month > 0 && fee != null
                    ? (incomeType === "percent"
                        ? Math.round(s.price_month * Number(income)) / 100
                        : Number(income)
                      ).toLocaleString("ru-RU")
                    : "—"}{" "}
                  ₽/мес.
                </p>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {brokerage ? (
              "В финансовый календарь попадёт только разовая комиссия на выбранную дату. Получение денег отмечается отдельно. Срок аренды остаётся в CRM и календаре объекта."
            ) : (
              <>
                В финансовый календарь попадёт только доход компании: разовая комиссия и ежемесячное
                вознаграждение. Платежи запланированы на указанное число в пределах срока аренды
                (дата окончания не включается); если этого числа в месяце нет — на последний день.
                Получение денег отмечается отдельно.
              </>
            )}
          </p>
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
