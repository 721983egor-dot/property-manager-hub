import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Settings2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmTabs } from "@/components/CrmTabs";
import { DealDialog } from "@/components/DealDialog";
import { DealSettingsDialog } from "@/components/DealSettingsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAccess } from "@/hooks/useAccess";
import { fetchCrmClients } from "@/lib/clients";
import { createDefaultDealStages } from "@/lib/deals.functions";
import { fetchProperties, internalTitle } from "@/lib/properties";
import {
  customValueLabel,

  deleteDeal,
  fetchDealFields,
  fetchDealStages,
  fetchDeals,
  formatBudget,
  guestsLabel,
  moveDeal,
  type Deal,
} from "@/lib/deals";

export const Route = createFileRoute("/_authenticated/crm/deals/")({
  head: () => ({
    meta: [
      { title: "Сделки — CRM RM OS" },
      {
        name: "description",
        content:
          "Канбан сделок RM OS: стадии, клиенты, объекты, бюджет, состав гостей и настраиваемые поля.",
      },
      { property: "og:title", content: "Сделки — CRM RM OS" },
      {
        property: "og:description",
        content: "Канбан сделок долгосрочной аренды: стадии, клиенты, бюджет и свои поля.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DealsPage,
});

function DealsPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAccess();
  const initializeStages = useServerFn(createDefaultDealStages);

  const { data: stages = [] } = useQuery({ queryKey: ["deal-stages"], queryFn: fetchDealStages });
  const { data: fields = [] } = useQuery({ queryKey: ["deal-fields"], queryFn: fetchDealFields });
  const { data: deals = [], isLoading } = useQuery({ queryKey: ["deals"], queryFn: fetchDeals });
  const { data: clients = [] } = useQuery({ queryKey: ["crm-clients"], queryFn: fetchCrmClients });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [defaultStage, setDefaultStage] = useState<string | undefined>(undefined);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [closedView, setClosedView] = useState<"won" | "lost" | null>(null);

  const boardStages = useMemo(() => stages.filter((s) => s.kind === "open"), [stages]);
  const wonStageIds = useMemo(
    () => new Set(stages.filter((s) => s.kind === "won").map((s) => s.id)),
    [stages],
  );
  const lostStageIds = useMemo(
    () => new Set(stages.filter((s) => s.kind === "lost").map((s) => s.id)),
    [stages],
  );
  const wonDeals = useMemo(() => deals.filter((d) => wonStageIds.has(d.stage_id)), [deals, wonStageIds]);
  const lostDeals = useMemo(() => deals.filter((d) => lostStageIds.has(d.stage_id)), [deals, lostStageIds]);

  const clientName = useMemo(
    () => new Map(clients.map((c) => [c.id, c.full_name])),
    [clients],
  );
  const propertyName = useMemo(
    () => new Map(properties.map((p) => [p.id, `${internalTitle(p)}`])),
    [properties],
  );

  const cardFields = useMemo(
    () => fields.filter((f) => !f.archived && f.show_in_card),
    [fields],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) =>
      [d.title, d.source, d.comment, clientName.get(d.client_id ?? "") ?? "", propertyName.get(d.property_id ?? "") ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [deals, search, clientName, propertyName]);

  const moveMutation = useMutation({
    mutationFn: ({ id, stageId, position }: { id: string; stageId: string; position: number }) =>
      moveDeal(id, stageId, position),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось перенести"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setDeleteId(null);
      toast.success("Сделка удалена");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  const stagesInit = useMutation({
    mutationFn: () => initializeStages(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-stages"] });
      toast.success("Стадии восстановлены");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось создать стадии"),
  });


  const openNew = (stageId?: string) => {
    setEditing(null);
    setDefaultStage(stageId);
    setDialogOpen(true);
  };

  const openDeal = (deal: Deal) => {
    setEditing(deal);
    setDefaultStage(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Сделки</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1.5 size-4" /> Настройка
            </Button>
          )}
          <Button onClick={() => openNew(boardStages[0]?.id)}>
            <Plus className="mr-1.5 size-4" /> Сделка
          </Button>
        </div>
      </div>

      <CrmTabs active="deals" />

      <div className="relative mt-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Поиск по сделкам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          className={
            closedView === "won"
              ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "border-emerald-600/40 text-emerald-700 hover:bg-emerald-50"
          }
          onClick={() => setClosedView(closedView === "won" ? null : "won")}
        >
          Успешные сделки ({wonDeals.length})
        </Button>
        <Button
          variant="outline"
          className={
            closedView === "lost"
              ? "border-destructive bg-destructive text-white hover:bg-destructive/90 hover:text-white"
              : "border-destructive/40 text-destructive hover:bg-destructive/10"
          }
          onClick={() => setClosedView(closedView === "lost" ? null : "lost")}
        >
          Отказы ({lostDeals.length})
        </Button>
      </div>

      {closedView ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(closedView === "won" ? wonDeals : lostDeals).map((deal) => (
            <button
              key={deal.id}
              type="button"
              onClick={() => openDeal(deal)}
              className="rounded-md border border-border bg-background p-3 text-left shadow-sm hover:shadow-md"
            >
              <p className="text-sm font-medium">{deal.title || "Без названия"}</p>
              {deal.client_id && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {clientName.get(deal.client_id) ?? "Клиент"}
                </p>
              )}
              {deal.closed_property_id && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {propertyName.get(deal.closed_property_id)}
                </p>
              )}
              {deal.start_date && deal.end_date && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(deal.start_date).toLocaleDateString("ru-RU")} —{" "}
                  {new Date(deal.end_date).toLocaleDateString("ru-RU")}
                </p>
              )}
            </button>
          ))}
          {(closedView === "won" ? wonDeals : lostDeals).length === 0 && (
            <p className="text-sm text-muted-foreground">Пока пусто.</p>
          )}
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Загружаем сделки…</p>
      ) : boardStages.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Стадии сделок не найдены. Создайте стандартный набор — потом их можно переименовать.
          </p>
          {isAdmin && (
            <Button className="mt-4" disabled={stagesInit.isPending} onClick={() => stagesInit.mutate()}>
              Создать стандартные стадии
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4">

          {boardStages.map((stage) => {
            const items = visible.filter((d) => d.stage_id === stage.id);
            const total = items.reduce((sum, d) => sum + (d.budget ?? 0), 0);
            return (
              <div
                key={stage.id}
                className="flex w-[280px] shrink-0 flex-col rounded-lg bg-muted/40 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) moveMutation.mutate({ id: dragId, stageId: stage.id, position: items.length });
                  setDragId(null);
                }}
              >
                <div className="flex items-center gap-2 px-2 py-2">
                  <span className="size-2.5 rounded-full" style={{ background: stage.color }} />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
                </div>
                {total > 0 && (
                  <p className="px-2 pb-2 text-xs text-muted-foreground">{formatBudget(total)}</p>
                )}

                <div className="flex flex-col gap-2">
                  {items.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      draggable
                      onDragStart={() => setDragId(deal.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => openDeal(deal)}
                      className="rounded-md border border-border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                    >
                      <p className="text-sm font-medium">{deal.title || "Без названия"}</p>
                      {deal.client_id && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {clientName.get(deal.client_id) ?? "Клиент"}
                        </p>
                      )}
                      {deal.property_id && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {propertyName.get(deal.property_id)}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold">{formatBudget(deal.budget)}</span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Users className="size-3" />
                          {guestsLabel(deal.adults, deal.children)}
                        </span>
                        {deal.source && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {deal.source}
                          </span>
                        )}
                      </div>
                      {cardFields.map((f) =>
                        deal.custom[f.key] == null || deal.custom[f.key] === "" ? null : (
                          <p key={f.id} className="mt-1 text-xs text-muted-foreground">
                            {f.label}: {customValueLabel(f, deal.custom[f.key])}
                          </p>
                        ),
                      )}
                      {isAdmin && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(deal.id);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && setDeleteId(deal.id)}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" /> Удалить
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => openNew(stage.id)}
                  className="mt-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-background"
                >
                  + Добавить сделку
                </button>
              </div>
            );
          })}
          {stages.length === 0 && (
            <p className="text-muted-foreground">Стадии не настроены — добавьте их в «Настройке».</p>
          )}
        </div>
      )}

      <DealDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        deal={editing}
        stages={stages}
        fields={fields}
        {...(defaultStage ? { defaultStageId: defaultStage } : {})}
      />
      {isAdmin && (
        <DealSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          stages={stages}
          fields={fields}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сделку?</AlertDialogTitle>
            <AlertDialogDescription>Восстановить сделку будет нельзя.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
