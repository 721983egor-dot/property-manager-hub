import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { normalizePhone } from "@/lib/bookings";
import {
  fetchCrmClients,
  formatPhone,
  phoneDigits,
  saveClient,
  type CrmClient,
} from "@/lib/clients";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: CrmClient | null;
  /** Вызывается после сохранения — например, чтобы сразу подставить клиента в сделку. */
  onSaved?: (clientId: string) => void;
};

export function ClientDialog({ open, onOpenChange, client, onSaved }: Props) {

  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [blacklisted, setBlacklisted] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName(client?.full_name ?? "");
    setPhone(client?.phone ?? "");
    setComment(client?.comment ?? "");
    setBlacklisted(client?.blacklisted ?? false);
    setReason(client?.blacklist_reason ?? "");
  }, [open, client?.id]);

  const { data: clients = [] } = useQuery({ queryKey: ["crm-clients"], queryFn: fetchCrmClients });

  const duplicate = useMemo(() => {
    const digits = phoneDigits(phone);
    if (digits.length < 5) return null;
    return clients.find((c) => c.id !== client?.id && phoneDigits(c.phone) === digits) ?? null;
  }, [clients, phone, client?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error("Укажите ФИО клиента");
      return saveClient(client?.id ?? null, {
        full_name: fullName.trim(),
        phone: formatPhone(phone),
        comment: comment.trim(),
        blacklisted,
        blacklist_reason: blacklisted ? reason.trim() : "",
      });
    },
    onSuccess: async (id: string) => {
      await qc.invalidateQueries({ queryKey: ["crm-clients"] });
      await qc.invalidateQueries({ queryKey: ["crm-client"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(client ? "Клиент обновлён" : "Клиент добавлен");
      onSaved?.(id);
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? "Редактирование клиента" : "Новый клиент"}</DialogTitle>
          <DialogDescription>
            Статусы аренды рассчитываются автоматически по бронированиям.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>ФИО</Label>
              <Input
                className="mt-1.5"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div>
              <Label>Номер телефона</Label>
              <Input
                className="mt-1.5"
                value={phone}
                onChange={(e) => {
                  const digits = phoneDigits(e.target.value);
                  if (digits.length > 11) return;
                  setPhone(digits.length === 11 ? formatPhone(e.target.value) : e.target.value);
                }}
                placeholder="+7 900 000-00-00"
              />
            </div>
          </div>

          {duplicate ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Возможный дубль: клиент «{duplicate.full_name}» уже есть с таким номером.
            </p>
          ) : null}

          <div>
            <Label>Комментарий</Label>
            <Textarea
              className="mt-1.5"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold">Чёрный список</Label>
                <p className="text-xs text-muted-foreground">
                  Отдельная отметка, не заменяет статус аренды.
                </p>
              </div>
              <Switch checked={blacklisted} onCheckedChange={setBlacklisted} />
            </div>
            {blacklisted ? (
              <div className="mt-3">
                <Label>Причина добавления в чёрный список</Label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
