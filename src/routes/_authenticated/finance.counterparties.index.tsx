import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import {
  fetchCounterparties,
  saveCounterparty,
  type FinanceCounterparty,
} from "@/lib/finance-counterparties";
import { fetchCounterpartyClassifications } from "@/lib/finance-classifications";
import { fetchPayments, formatAdeskMoney } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/counterparties/")({
  head: () => ({
    meta: [
      { title: "Финансы — контрагенты — RM OS" },
      {
        name: "description",
        content: "Контрагенты: арендаторы, собственники, подрядчики, сотрудники, депозиты.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FinanceCounterpartiesPage />
    </AdminOnly>
  ),
});

type KindFilter = string;

export function FinanceCounterpartiesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [kind, setKind] = useState<KindFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKind, setNewKind] = useState("__none__");

  const { data: classifications = [], error: classificationError } = useQuery({
    queryKey: ["finance-counterparty-classes"],
    queryFn: fetchCounterpartyClassifications,
  });
  const { data: counterparties = [], isLoading } = useQuery({
    queryKey: ["finance-counterparties"],
    queryFn: () => fetchCounterparties(),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "all-for-counterparties"],
    queryFn: () => fetchPayments({}),
  });

  const filtered = useMemo(
    () =>
      counterparties.filter(
        (item) => kind === "all" || (item.classification_id ?? "__none__") === kind,
      ),
    [counterparties, kind],
  );

  const openById = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.counterparty_id) continue;
      if (payment.status === "paid") continue;
      map.set(
        payment.counterparty_id,
        (map.get(payment.counterparty_id) ?? 0) +
          Math.max(0, payment.amount - (payment.paid_amount ?? 0)),
      );
    }
    return map;
  }, [payments]);

  const createMutation = useMutation({
    mutationFn: () =>
      saveCounterparty(null, {
        name,
        kind: "other",
        classification_id: newKind === "__none__" ? null : newKind,
      }),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: ["finance-counterparties"] });
      setCreateOpen(false);
      setName("");
      toast.success("Контрагент создан");
      void navigate({ to: "/finance/counterparties/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  return (
    <div className="finance-ui">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Контрагенты</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Движение денег, обязательства и ваши классификации.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Контрагент
        </Button>
      </header>

      <FinanceTabs active="counterparties" />

      <div className="mt-5 flex flex-wrap gap-1.5">
        <FilterChip active={kind === "all"} onClick={() => setKind("all")}>
          Все
        </FilterChip>
        {classifications.map((item) => (
          <FilterChip key={item.id} active={kind === item.id} onClick={() => setKind(item.id)}>
            {item.name}
          </FilterChip>
        ))}
        <FilterChip active={kind === "__none__"} onClick={() => setKind("__none__")}>
          Без классификации
        </FilterChip>
      </div>

      {classificationError && <p role="alert">Не удалось загрузить классификации.</p>}
      <Link to="/finance/settings" className="mt-3 inline-block text-sm text-blue-600">
        Настроить классификации
      </Link>
      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-white">
        <div className="hidden grid-cols-[1fr_10rem_8rem] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Контрагент</span>
          <span>Классификация</span>
          <span className="text-right">Открыто</span>
        </div>
        {isLoading && <p className="px-4 py-8 text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Нет контрагентов. Добавьте карточку или создайте операцию в календаре.
          </p>
        )}
        {filtered.map((item) => (
          <CounterpartyRow
            key={item.id}
            item={item}
            classificationName={
              classifications.find((c) => c.id === item.classification_id)?.name ??
              "Без классификации"
            }
            openAmount={openById.get(item.id) ?? 0}
          />
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="finance-dialog">
          <DialogHeader>
            <DialogTitle>Новый контрагент</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Имя</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Классификация</Label>
              <Select value={newKind} onValueChange={(v) => setNewKind(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без классификации</SelectItem>
                  {classifications.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm",
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-border bg-white text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CounterpartyRow({
  item,
  openAmount,
  classificationName,
}: {
  item: FinanceCounterparty;
  classificationName: string;
  openAmount: number;
}) {
  return (
    <Link
      to="/finance/counterparties/$id"
      params={{ id: item.id }}
      className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/30 sm:grid-cols-[1fr_10rem_8rem] sm:items-center sm:gap-3"
    >
      <p className="font-medium">{item.name}</p>
      <p className="text-sm">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {classificationName}
        </span>
      </p>
      <p
        className={
          "text-sm font-semibold tabular-nums sm:text-right " +
          (openAmount > 0 ? "text-red-700" : "text-muted-foreground")
        }
      >
        {formatAdeskMoney(openAmount)}
      </p>
    </Link>
  );
}
