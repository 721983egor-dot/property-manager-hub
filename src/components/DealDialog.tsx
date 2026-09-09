import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAccess } from "@/hooks/useAccess";
import { listStaff } from "@/lib/staff.functions";
import { fetchCrmClients } from "@/lib/clients";
import { ClientContactButtons } from "@/components/ClientContactButtons";
import { ClientDialog } from "@/components/ClientDialog";
import { DealTimeline } from "@/components/DealTimeline";
import { DealShowings } from "@/components/DealShowings";
import { DealWonDialog } from "@/components/DealWonDialog";

import { fetchProperties, internalTitle } from "@/lib/properties";
import { DEAL_SOURCES, saveDeal, type Deal, type DealField, type DealStage } from "@/lib/deals";

const NONE = "__none__";


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  stages: DealStage[];
  fields: DealField[];
  defaultStageId?: string;
};

/** Карточка сделки: клиент, объект, бюджет, гости и дополнительные поля. */
export function DealDialog({ open, onOpenChange, deal, stages, fields, defaultStageId }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAccess();
  const loadStaff = useServerFn(listStaff);

  const { data: clients = [] } = useQuery({ queryKey: ["crm-clients"], queryFn: fetchCrmClients });
  const { data: properties = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });
  const { data: staffData } = useQuery({
    queryKey: ["staff"],
    queryFn: () => loadStaff(undefined as never),
    enabled: isAdmin,
  });

  const activeFields = useMemo(() => fields.filter((f) => !f.archived), [fields]);

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState("");
  const [clientId, setClientId] = useState<string>(NONE);
  const [propertyId, setPropertyId] = useState<string>(NONE);
  const [responsibleId, setResponsibleId] = useState<string>(NONE);
  const [source, setSource] = useState("");
  const [budget, setBudget] = useState("");
  const [adults, setAdults] = useState("0");
  const [children, setChildren] = useState("0");
  const [comment, setComment] = useState("");
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [savedDealId, setSavedDealId] = useState<string | null>(null);



  useEffect(() => {
    if (!open) return;
    setTitle(deal?.title ?? "");
    setStageId(deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setClientId(deal?.client_id ?? NONE);
    setPropertyId(deal?.property_id ?? NONE);
    setResponsibleId(deal?.responsible_id ?? profile?.id ?? NONE);
    setSource(deal?.source ?? "");
    setBudget(deal?.budget != null ? String(deal.budget) : "");
    setAdults(String(deal?.adults ?? 0));
    setChildren(String(deal?.children ?? 0));
    setComment(deal?.comment ?? "");
    setCustom(deal?.custom ?? {});
  }, [open, deal, defaultStageId, stages, profile?.id]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === (clientId === NONE ? null : clientId)) ?? null,
    [clients, clientId],
  );

  /** Понятные подписи значений в истории изменений. */
  const resolveValue = useMemo(() => {
    return (field: string, value: unknown) => {
      if (value == null || value === "") return "—";
      if (field === "stage_id") return stages.find((s) => s.id === value)?.name ?? "—";
      if (field === "client_id") return clients.find((c) => c.id === value)?.full_name ?? "—";
      if (field === "property_id") {
        const p = properties.find((x) => x.id === value);
        return p ? `${p.ref_id} — ${internalTitle(p)}` : "—";
      }
      if (field === "responsible_id") {
        const s = (staffData?.staff ?? []).find((x) => x.id === value);
        return s ? s.full_name || s.email : "Сотрудник";
      }
      if (field === "budget") return `${Number(value).toLocaleString("ru-RU")} ₽`;
      if (typeof value === "boolean") return value ? "Да" : "Нет";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };
  }, [stages, clients, properties, staffData]);

  const propertyLabel = useMemo(
    () => (id: string) => {
      const p = properties.find((x) => x.id === id);
      return p ? `${p.ref_id} — ${internalTitle(p)}` : "объект";
    },
    [properties],
  );

  const openStages = useMemo(() => stages.filter((s) => s.kind === "open"), [stages]);
  const wonStage = stages.find((s) => s.kind === "won") ?? null;
  const lostStage = stages.find((s) => s.kind === "lost") ?? null;
  const [pendingClose, setPendingClose] = useState<"won" | "lost" | null>(null);

  const mutation = useMutation({
    mutationFn: (overrideStageId?: string) =>
      saveDeal(deal?.id ?? null, {
        title: title.trim() || "Без названия",
        stage_id: overrideStageId ?? stageId,
        client_id: clientId === NONE ? null : clientId,
        property_id: propertyId === NONE ? null : propertyId,
        responsible_id: responsibleId === NONE ? null : responsibleId,
        source,
        budget: budget.trim() === "" ? null : Number(budget),
        adults: Number(adults) || 0,
        children: Number(children) || 0,
        comment,
        custom,
      }),
    onSuccess: (id: string) => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      if (pendingClose === "won") {
        setPendingClose(null);
        setSavedDealId(id);
        setWonOpen(true);
        onOpenChange(false);
        return;
      }
      if (pendingClose === "lost") {
        setPendingClose(null);
        toast.success("Сделка помечена как отказ");
        onOpenChange(false);
        return;
      }
      toast.success(deal ? "Сделка обновлена" : "Сделка создана");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  const wonDeal: Deal | null = savedDealId
    ? {
        ...(deal ?? {
          id: savedDealId,
          title,
          stage_id: stageId,
          lead_id: null,
          position: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          custom,
          closed_property_id: null,
          start_date: null,
          end_date: null,
          price_month: null,
          deposit: null,
          commission: null,
          payment_day: null,
          adults: 0,
          children: 0,
          budget: null,
          responsible_id: null,
          comment: "",
          source: "",
          client_id: null,
          property_id: null,
        }),
        id: savedDealId,
        client_id: clientId === NONE ? null : clientId,
        property_id: propertyId === NONE ? null : propertyId,
        source,
      } as Deal
    : null;



  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal ? "Сделка" : "Новая сделка"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="grid content-start gap-4">

          <div className="grid gap-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Аренда, семья на сезон" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Стадия</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Стадия" /></SelectTrigger>
                <SelectContent>
                  {(openStages.some((s) => s.id === stageId)
                    ? openStages
                    : stages.filter((s) => s.kind === "open" || s.id === stageId)
                  ).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Клиент</Label>
              <div className="flex gap-2">
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Клиент" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не выбран</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} {c.phone ? `· ${c.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setNewClientOpen(true)}>
                  + Новый
                </Button>
              </div>
              {selectedClient?.phone ? (
                <ClientContactButtons phone={selectedClient.phone} variant="row" className="mt-1" />
              ) : null}
            </div>


            <div className="grid gap-1.5">
              <Label>Объект</Label>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger><SelectValue placeholder="Объект" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не выбран</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.ref_id} — {internalTitle(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Источник</Label>
              <Select value={source || NONE} onValueChange={(v) => setSource(v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Источник" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не указан</SelectItem>
                  {DEAL_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Бюджет клиента, ₽/мес</Label>
              <Input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>

            {isAdmin && (
              <div className="grid gap-1.5">
                <Label>Ответственный</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger><SelectValue placeholder="Ответственный" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не назначен</SelectItem>
                    {(staffData?.staff ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Взрослых</Label>
              <Input
                inputMode="numeric"
                value={adults}
                onChange={(e) => setAdults(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Детей</Label>
              <Input
                inputMode="numeric"
                value={children}
                onChange={(e) => setChildren(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>

          {activeFields.length > 0 && (
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {activeFields.map((f) => {
                const value = custom[f.key];
                const set = (v: unknown) => setCustom((prev) => ({ ...prev, [f.key]: v }));
                return (
                  <div key={f.id} className="grid gap-1.5">
                    <Label>{f.label}</Label>
                    {f.field_type === "select" ? (
                      <Select
                        value={(value as string) || NONE}
                        onValueChange={(v) => set(v === NONE ? "" : v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Не выбрано" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Не выбрано</SelectItem>
                          {f.options.map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.field_type === "checkbox" ? (
                      <div className="flex h-10 items-center">
                        <Checkbox
                          checked={Boolean(value)}
                          onCheckedChange={(v) => set(Boolean(v))}
                        />
                      </div>
                    ) : (
                      <Input
                        type={f.field_type === "date" ? "date" : f.field_type === "number" ? "number" : "text"}
                        value={value == null ? "" : String(value)}
                        onChange={(e) => set(e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Описание</Label>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>

          {deal ? <DealShowings dealId={deal.id} properties={properties} /> : null}
          </div>

          {deal ? (
            <DealTimeline dealId={deal.id} resolve={resolveValue} propertyLabel={propertyLabel} />
          ) : (
            <div className="hidden rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground lg:block">
              Комментарии и история изменений появятся после сохранения сделки.
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {lostStage ? (
            <Button
              variant="outline"
              className="text-destructive sm:mr-auto"
              disabled={mutation.isPending}
              onClick={() => {
                setPendingClose("lost");
                mutation.mutate(lostStage.id);
              }}
            >
              Отказ
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            variant="outline"
            disabled={!wonStage || mutation.isPending}
            onClick={() => {
              setPendingClose("won");
              mutation.mutate(stageId);
            }}
          >
            Успешно
          </Button>
          <Button
            onClick={() => {
              setPendingClose(null);
              mutation.mutate(undefined);
            }}
            disabled={!stageId || mutation.isPending}
          >
            Сохранить
          </Button>
        </DialogFooter>

        <ClientDialog
          open={newClientOpen}
          onOpenChange={setNewClientOpen}
          onSaved={(id) => setClientId(id)}
        />
      </DialogContent>
    </Dialog>

    {wonDeal && wonStage ? (
      <DealWonDialog
        open={wonOpen}
        onOpenChange={(v) => {
          setWonOpen(v);
          if (!v) setSavedDealId(null);
        }}
        deal={wonDeal}
        stageId={wonStage.id}
        properties={properties}
        onClosed={() => setSavedDealId(null)}
      />
    ) : null}
    </>
  );
}

