import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  fetchCounterparties,
  saveObligation,
  type FinanceObligation,
} from "@/lib/finance-counterparties";
import "./finance-obligation.css";
export function FinanceObjectObligationDialog({
  propertyId,
  propertyName,
  obligation,
  onClose,
}: {
  propertyId: string;
  propertyName: string;
  obligation: FinanceObligation | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"receivable" | "payable">(
    obligation?.direction ?? "receivable",
  );
  const [amount, setAmount] = useState(obligation ? String(obligation.amount) : "");
  const [party, setParty] = useState(obligation?.counterparty_id ?? "");
  const [legal, setLegal] = useState(obligation?.legal_entity ?? "");
  const [date, setDate] = useState(
    obligation?.planned_date ?? new Date().toLocaleDateString("en-CA"),
  );
  const [description, setDescription] = useState(obligation?.description ?? "");
  const [status, setStatus] = useState<"open" | "closed">(obligation?.status ?? "open");
  const parties = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
  });
  const save = useMutation({
    mutationFn: () =>
      saveObligation(obligation?.id ?? null, {
        counterparty_id: party,
        property_id: propertyId,
        amount: Number(amount),
        direction,
        planned_date: date,
        legal_entity: legal,
        description,
        status,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["finance-obligations"] });
      toast.success("Обязательство сохранено");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="finance-obligation-sheet"
        overlayClassName="finance-obligation-overlay"
      >
        <SheetHeader className="obligation-heading">
          <SheetTitle>
            {obligation ? "Изменить обязательство" : "Зафиксировать исполнение обязательства"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Финансовое обязательство по объекту {propertyName}
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="obligation-directions">
            {(["receivable", "payable"] as const).map((d) => (
              <button
                type="button"
                key={d}
                className={`obligation-direction ${direction === d ? "is-selected" : ""}`}
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
              >
                <Package />
                <span>
                  <strong>{d === "receivable" ? "Мы передали" : "Нам передали"}</strong>
                  <small>
                    {d === "receivable"
                      ? "Мы исполнили обязательство перед контрагентом"
                      : "Контрагент исполнил обязательство перед нами"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="finance-object-obligation-fields">
            <label>
              СУММА *
              <input
                aria-label="Сумма обязательства"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              ВАЛЮТА
              <select aria-label="Валюта обязательства" value="RUB" onChange={() => {}}>
                <option value="RUB">Российский рубль (RUB)</option>
              </select>
            </label>
            <label>
              КОНТРАГЕНТ *
              <select
                aria-label="Контрагент обязательства"
                required
                value={party}
                onChange={(e) => setParty(e.target.value)}
              >
                <option value="">Выберите контрагента…</option>
                {parties.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ЮР. ЛИЦО *
              <input
                aria-label="Юридическое лицо обязательства"
                required
                value={legal}
                onChange={(e) => setLegal(e.target.value)}
              />
            </label>
            <label>
              ОБЪЕКТ
              <input aria-label="Объект обязательства" readOnly value={propertyName} />
            </label>
            <label>
              ДАТА *
              <input
                aria-label="Дата обязательства"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="finance-object-obligation-wide">
              ОПИСАНИЕ
              <textarea
                aria-label="Описание обязательства"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например, предоплата или оказание услуги"
              />
            </label>
            {obligation && (
              <label>
                СОСТОЯНИЕ
                <select
                  aria-label="Состояние обязательства"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "open" | "closed")}
                >
                  <option value="open">Открыто</option>
                  <option value="closed">Закрыто</option>
                </select>
              </label>
            )}
          </div>
          {parties.error && <p role="alert">Не удалось загрузить контрагентов.</p>}
          <button
            className="finance-object-obligation-submit"
            disabled={save.isPending || !party || !legal.trim() || !date || Number(amount) <= 0}
          >
            {obligation ? "Сохранить" : "Добавить"}
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
