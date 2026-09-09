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

  const mutation = useMutation({
    mutationFn: () =>
      saveDeal(deal?.id ?? null, {
        title: title.trim() || "Без названия",
        stage_id: stageId,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast.success(deal ? "Сделка обновлена" : "Сделка создана");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось сохранить"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deal ? "Сделка" : "Новая сделка"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
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
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Клиент</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Клиент" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не выбран</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} {c.phone ? `· ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Label>Комментарий</Label>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => mutation.mutate()} disabled={!stageId || mutation.isPending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
