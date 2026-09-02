import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  type Booking,
  type BookingPricePeriod,
  type BookingPriceType,
  type BookingSource,
  type BookingStatus,
  createClient,
  deleteBooking,
  fetchClients,
  markPropertyRented,
  normalizePhone,
  priceOn,
  saveBooking,
  sourceLabel,
  statusLabel,
} from "@/lib/bookings";
import { formatDateRu, toISODate } from "@/lib/rentals";
import { fetchProperties, formatMoney, internalTitle } from "@/lib/properties";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: Booking | null;
  defaultPropertyId?: string;
  defaultClientId?: string;
};


type FormState = {
  property_id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  price_type: BookingPriceType;
  price_month: string;
  payment_day: string;
  deposit: string;
  source: BookingSource | "";
  status: BookingStatus;
  comment: string;
  periods: BookingPricePeriod[];
};

function emptyForm(propertyId = "", clientId = ""): FormState {
  return {
    property_id: propertyId,
    client_id: clientId,

    start_date: toISODate(new Date()),
    end_date: toISODate(new Date()),
    price_type: "fixed",
    price_month: "",
    payment_day: "1",
    deposit: "",
    source: "",
    status: "active",
    comment: "",
    periods: [],
  };
}

function fromBooking(b: Booking): FormState {
  return {
    property_id: b.property_id,
    client_id: b.client_id,
    start_date: b.start_date,
    end_date: b.end_date,
    price_type: b.price_type,
    price_month: b.price_month == null ? "" : String(b.price_month),
    payment_day: String(b.payment_day),
    deposit: b.deposit == null ? "" : String(b.deposit),
    source: b.source ?? "",
    status: b.status,
    comment: b.comment,
    periods: b.periods.map((p) => ({ ...p })),
  };
}

export function BookingDialog({
  open,
  onOpenChange,
  booking,
  defaultPropertyId,
  defaultClientId,
}: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit">(booking ? "view" : "edit");
  const [form, setForm] = useState<FormState>(() =>
    booking ? fromBooking(booking) : emptyForm(defaultPropertyId, defaultClientId),
  );
  const [newClient, setNewClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(booking ? "view" : "edit");
    setForm(booking ? fromBooking(booking) : emptyForm(defaultPropertyId, defaultClientId));
    setNewClient(false);
    setClientName("");
    setClientPhone("");
    setClientSearch("");
  }, [open, booking?.id, defaultPropertyId, defaultClientId]);


  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.full_name.toLowerCase().includes(q) || normalizePhone(c.phone).includes(normalizePhone(q)),
    );
  }, [clients, clientSearch]);

  const duplicate = useMemo(() => {
    const digits = normalizePhone(clientPhone);
    if (digits.length < 5) return null;
    return clients.find((c) => normalizePhone(c.phone) === digits) ?? null;
  }, [clients, clientPhone]);

  const save = useMutation({
    mutationFn: async () => {
      let clientId = form.client_id;
      if (newClient) {
        if (!clientName.trim()) throw new Error("Укажите ФИО клиента");
        const created = await createClient({
          full_name: clientName.trim(),
          phone: clientPhone.trim(),
        });
        clientId = created.id;
      }
      if (!form.property_id) throw new Error("Выберите объект");
      if (!clientId) throw new Error("Выберите клиента");
      if (form.end_date < form.start_date) throw new Error("Дата окончания раньше даты начала");

      const bookingId = await saveBooking(booking?.id ?? null, {
        property_id: form.property_id,
        client_id: clientId,
        start_date: form.start_date,
        end_date: form.end_date,
        price_type: form.price_type,
        price_month: form.price_month === "" ? null : Number(form.price_month),
        payment_day: Math.min(31, Math.max(1, Number(form.payment_day) || 1)),
        deposit: form.deposit === "" ? null : Number(form.deposit),
        source: form.source === "" ? null : form.source,
        status: form.status,
        comment: form.comment,
        periods: form.periods.filter((p) => p.start_date && p.end_date),
      });
      if (form.status === "active") {
        await markPropertyRented(form.property_id);
      }
      return bookingId;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["current-booking"] });
      await qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success(booking ? "Бронирование обновлено" : "Бронирование создано");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!booking) return;
      await deleteBooking(booking.id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["current-booking"] });
      toast.success("Бронирование удалено, данные клиента сохранены");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    },
  });

  const property = properties.find((p) => p.id === (booking?.property_id ?? form.property_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "view" ? "Бронирование" : booking ? "Редактирование брони" : "Новое бронирование"}
          </DialogTitle>
          <DialogDescription>
            {property ? internalTitle(property) : "Выберите объект и клиента"}
          </DialogDescription>
        </DialogHeader>

        {mode === "view" && booking ? (
          <div className="space-y-4">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label="Объект" value={property ? internalTitle(property) : "—"} />
              <Field label="Статус" value={statusLabel(booking.status)} />
              <Field label="ФИО" value={booking.client?.full_name ?? "—"} />
              <Field label="Телефон" value={booking.client?.phone || "—"} />
              <Field
                label="Даты аренды"
                value={`${formatDateRu(booking.start_date)} — ${formatDateRu(booking.end_date)}`}
              />
              <Field
                label="Стоимость в месяц"
                value={formatMoney(priceOn(booking, toISODate(new Date())))}
              />
              <Field label="День оплаты" value={`${booking.payment_day} число`} />
              <Field label="Страховой депозит" value={formatMoney(booking.deposit)} />
              <Field label="Источник" value={sourceLabel(booking.source)} />
              <Field label="Комментарий" value={booking.comment || "—"} />
            </dl>

            {booking.price_type === "periodic" && booking.periods.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Периоды стоимости
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {booking.periods.map((p, i) => (
                    <li key={p.id ?? i}>
                      {formatDateRu(p.start_date)} — {formatDateRu(p.end_date)}:{" "}
                      {formatMoney(p.price_month)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="destructive"
                onClick={() => {
                  if (window.confirm("Удалить бронирование? Данные клиента сохранятся.")) {
                    remove.mutate();
                  }
                }}
                disabled={remove.isPending}
              >
                {remove.isPending ? "Удаление..." : "Удалить"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Закрыть
                </Button>
                <Button onClick={() => setMode("edit")}>Редактировать</Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Объект</Label>
                <Select
                  value={form.property_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, property_id: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Выберите объект" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {internalTitle(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Статус</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as BookingStatus }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Дата начала аренды</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Дата окончания аренды</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm font-semibold">Клиент</Label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={newClient}
                    onCheckedChange={(v) => setNewClient(Boolean(v))}
                  />
                  Новый клиент
                </label>
              </div>

              {newClient ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>ФИО</Label>
                    <Input
                      className="mt-1.5"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Иванов Иван Иванович"
                    />
                  </div>
                  <div>
                    <Label>Номер телефона</Label>
                    <Input
                      className="mt-1.5"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+7 900 000-00-00"
                    />
                  </div>
                  {duplicate ? (
                    <p className="sm:col-span-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Возможный дубль: клиент «{duplicate.full_name}» уже есть с таким номером.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder="Поиск по ФИО или телефону"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <Select
                    value={form.client_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите клиента" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-4">
              <Label className="text-sm font-semibold">Стоимость аренды</Label>
              <Select
                value={form.price_type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, price_type: v as BookingPriceType }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Одинаковая круглый год</SelectItem>
                  <SelectItem value="periodic">Меняется по периодам</SelectItem>
                </SelectContent>
              </Select>

              {form.price_type === "fixed" ? (
                <div className="mt-3">
                  <Label>Стоимость в месяц, ₽</Label>
                  <Input
                    type="number"
                    className="mt-1.5"
                    value={form.price_month}
                    onChange={(e) => setForm((f) => ({ ...f, price_month: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {form.periods.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label className="text-xs">С</Label>
                        <Input
                          type="date"
                          className="mt-1 w-[150px]"
                          value={p.start_date}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              periods: f.periods.map((x, xi) =>
                                xi === i ? { ...x, start_date: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">По</Label>
                        <Input
                          type="date"
                          className="mt-1 w-[150px]"
                          value={p.end_date}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              periods: f.periods.map((x, xi) =>
                                xi === i ? { ...x, end_date: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Стоимость в месяц, ₽</Label>
                        <Input
                          type="number"
                          className="mt-1 w-[170px]"
                          value={String(p.price_month ?? "")}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              periods: f.periods.map((x, xi) =>
                                xi === i ? { ...x, price_month: Number(e.target.value) } : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            periods: f.periods.filter((_, xi) => xi !== i),
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        periods: [
                          ...f.periods,
                          { start_date: f.start_date, end_date: f.end_date, price_month: 0 },
                        ],
                      }))
                    }
                  >
                    <Plus className="size-4" />
                    Добавить период
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>День ежемесячной оплаты</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  className="mt-1.5"
                  value={form.payment_day}
                  onChange={(e) => setForm((f) => ({ ...f, payment_day: e.target.value }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Если числа нет в месяце — оплата в последний день месяца.
                </p>
              </div>
              <div>
                <Label>Страховой депозит, ₽</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.deposit}
                  onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
                />
              </div>
              <div>
                <Label>Источник</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm((f) => ({ ...f, source: v as BookingSource }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Не указан" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_SOURCES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Комментарий</Label>
              <Textarea
                className="mt-1.5"
                rows={3}
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
