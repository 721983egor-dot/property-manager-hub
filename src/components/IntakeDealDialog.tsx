import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListTodo } from "lucide-react";
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
import { ClientDialog } from "@/components/ClientDialog";
import { ClientContactButtons } from "@/components/ClientContactButtons";
import { DealTimeline } from "@/components/DealTimeline";
import { TaskDialog } from "@/components/TaskDialog";
import { useAccess } from "@/hooks/useAccess";
import { fetchCrmClients } from "@/lib/clients";
import { fetchComplexes } from "@/lib/complexes";
import {
  DEAL_SOURCES,
  deleteDeal,
  intakeDraftFromCustom,
  saveDeal,
  withIntakeDraft,
  type Deal,
  type DealField,
  type DealStage,
  type IntakePropertyDraft,
} from "@/lib/deals";
import { PROPERTY_TYPES, SERVICE_TYPES } from "@/lib/properties";
import { listStaff } from "@/lib/staff.functions";
import { formatTelegramHandle, PREFERRED_MESSENGERS } from "@/lib/chat-contact";

const NONE = "__none__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  stages: DealStage[];
  fields: DealField[];
  defaultStageId?: string;
};

/** Карточка «Новый объект»: собственник + черновик полей объекта (CRM, не сайт). */
export function IntakeDealDialog({ open, onOpenChange, deal, stages, fields, defaultStageId }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, profile } = useAccess();
  const loadStaff = useServerFn(listStaff);

  const { data: clients = [] } = useQuery({ queryKey: ["crm-clients"], queryFn: fetchCrmClients });
  const { data: complexes = [] } = useQuery({ queryKey: ["complexes"], queryFn: fetchComplexes });
  const { data: staffData } = useQuery({
    queryKey: ["staff"],
    queryFn: () => loadStaff(undefined as never),
    enabled: isAdmin,
  });

  const activeFields = useMemo(() => fields.filter((f) => !f.archived), [fields]);

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState("");
  const [clientId, setClientId] = useState<string>(NONE);
  const [responsibleId, setResponsibleId] = useState<string>(NONE);
  const [source, setSource] = useState("");
  const [comment, setComment] = useState("");
  const [telegram, setTelegram] = useState("");
  const [messenger, setMessenger] = useState("");
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState<IntakePropertyDraft>(intakeDraftFromCustom(null));
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(deal?.title ?? "");
    setStageId(deal?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setClientId(deal?.client_id ?? NONE);
    setResponsibleId(deal?.responsible_id ?? profile?.id ?? NONE);
    setSource(deal?.source ?? "");
    setComment(deal?.comment ?? "");
    setTelegram(deal?.telegram ?? "");
    setMessenger(deal?.preferred_messenger ?? "");
    setCustom(deal?.custom ?? {});
    setDraft(intakeDraftFromCustom(deal?.custom));
  }, [open, deal, defaultStageId, stages, profile?.id]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === (clientId === NONE ? null : clientId)) ?? null,
    [clients, clientId],
  );

  const resolveValue = useMemo(() => {
    return (field: string, value: unknown) => {
      if (value == null || value === "") return "—";
      if (field === "stage_id") return stages.find((s) => s.id === value)?.name ?? "—";
      if (field === "client_id") return clients.find((c) => c.id === value)?.full_name ?? "—";
      if (field === "responsible_id") {
        const s = (staffData?.staff ?? []).find((x) => x.id === value);
        return s ? s.full_name || s.email : "Сотрудник";
      }
      if (typeof value === "boolean") return value ? "Да" : "Нет";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    };
  }, [stages, clients, staffData]);

  const patchDraft = (patch: Partial<IntakePropertyDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const mutation = useMutation({
    mutationFn: () =>
      saveDeal(deal?.id ?? null, {
        title: title.trim() || draft.address.trim() || "Новый объект",
        stage_id: stageId,
        pipeline: "intake",
        client_id: clientId === NONE ? null : clientId,
        property_id: deal?.property_id ?? null,
        responsible_id: responsibleId === NONE ? null : responsibleId,
        source,
        budget: draft.price_month.trim() === "" ? null : Number(draft.price_month),
        adults: 0,
        children: 0,
        comment: comment || draft.description,
        telegram: formatTelegramHandle(telegram) || telegram.trim(),
        preferred_messenger: messenger,
        custom: withIntakeDraft(custom, draft),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(deal ? "Карточка обновлена" : "Новый объект создан");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  const remove = useMutation({
    mutationFn: () => deleteDeal(deal!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Карточка удалена");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось удалить"),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{deal ? "Новый объект" : "Приём объекта"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Название</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Квартира у моря / дом собственника"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Стадия</Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Стадия" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Собственник</Label>
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setNewClientOpen(true)}>
                    + Новый
                  </Button>
                </div>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Клиент" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не выбран</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                        {c.party_kind === "owner" ? " · собственник" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClient ? (
                  <ClientContactButtons phone={selectedClient.phone} />
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label>Ответственный</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Сотрудник" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не выбран</SelectItem>
                    {(staffData?.staff ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="mb-3 text-sm font-medium">Параметры объекта</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Тип</Label>
                  <Select
                    value={draft.property_type}
                    onValueChange={(v) => patchDraft({ property_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.filter((t) => t.value !== "aparts" && t.value !== "villa").map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Комплекс</Label>
                  <Select
                    value={draft.complex_id ?? NONE}
                    onValueChange={(v) => patchDraft({ complex_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Без комплекса" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Без комплекса</SelectItem>
                      {complexes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Адрес</Label>
                  <Input
                    value={draft.address}
                    onChange={(e) => patchDraft({ address: e.target.value })}
                    placeholder="Сочи, …"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Комнат</Label>
                  <Input value={draft.rooms} onChange={(e) => patchDraft({ rooms: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Санузлов</Label>
                  <Input
                    value={draft.bathrooms}
                    onChange={(e) => patchDraft({ bathrooms: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Этаж</Label>
                  <Input value={draft.floor} onChange={(e) => patchDraft({ floor: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Этажей в доме</Label>
                  <Input
                    value={draft.total_floors}
                    onChange={(e) => patchDraft({ total_floors: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Площадь, м²</Label>
                  <Input value={draft.area} onChange={(e) => patchDraft({ area: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Услуга</Label>
                  <Select
                    value={draft.service_type}
                    onValueChange={(v) => patchDraft({ service_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Цена, ₽/мес</Label>
                  <Input
                    type="number"
                    value={draft.price_month}
                    onChange={(e) => patchDraft({ price_month: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Депозит</Label>
                  <Input
                    type="number"
                    value={draft.deposit}
                    onChange={(e) => patchDraft({ deposit: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Комиссия</Label>
                  <Input
                    type="number"
                    value={draft.commission}
                    onChange={(e) => patchDraft({ commission: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Описание объекта</Label>
                  <Textarea
                    rows={3}
                    value={draft.description}
                    onChange={(e) => patchDraft({ description: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Источник</Label>
                <Select value={source || NONE} onValueChange={(v) => setSource(v === NONE ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Источник" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не указан</SelectItem>
                    {DEAL_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Мессенджер</Label>
                <Select
                  value={messenger || NONE}
                  onValueChange={(v) => setMessenger(v === NONE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Удобный канал" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Не указан</SelectItem>
                    {PREFERRED_MESSENGERS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Telegram</Label>
                <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@owner" />
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
                          <SelectTrigger>
                            <SelectValue placeholder="Не выбрано" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Не выбрано</SelectItem>
                            {f.options.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : f.field_type === "checkbox" ? (
                        <div className="flex h-10 items-center">
                          <Checkbox checked={Boolean(value)} onCheckedChange={(v) => set(Boolean(v))} />
                        </div>
                      ) : (
                        <Input
                          type={
                            f.field_type === "date" ? "date" : f.field_type === "number" ? "number" : "text"
                          }
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
              <Label>Комментарий CRM</Label>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>

            {deal ? <DealTimeline dealId={deal.id} resolve={resolveValue} propertyLabel={() => "—"} /> : null}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {deal ? (
              <Button type="button" variant="outline" onClick={() => setTaskOpen(true)}>
                <ListTodo className="mr-1.5 size-4" /> Задача
              </Button>
            ) : null}
            {deal && isAdmin ? (
              <Button
                type="button"
                variant="destructive"
                disabled={removing || remove.isPending}
                onClick={() => {
                  setRemoving(true);
                  remove.mutate();
                }}
              >
                Удалить
              </Button>
            ) : null}
            <Button onClick={() => mutation.mutate()} disabled={!stageId || mutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>

          <ClientDialog
            open={newClientOpen}
            onOpenChange={setNewClientOpen}
            defaultPartyKind="owner"
            onSaved={(id) => setClientId(id)}
          />
        </DialogContent>
      </Dialog>

      {deal ? (
        <TaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          task={null}
          defaultDealId={deal.id}
        />
      ) : null}
    </>
  );
}
