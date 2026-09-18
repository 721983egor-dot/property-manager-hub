import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ChatContactHints } from "@/components/ChatContactHints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { useAccess } from "@/hooks/useAccess";
import {
  formatTelegramHandle,
  PREFERRED_MESSENGERS,
  threadClientName,
} from "@/lib/chat-contact";
import {
  chatSourceToDealSource,
  createDealFromThread,
  type ChatMessage,
  type ChatThread,
} from "@/lib/chat.functions";
import { listStaff } from "@/lib/staff.functions";

const NONE = "__none__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: ChatThread;
  messages: ChatMessage[];
  onCreated?: (dealId: string) => void;
};

/** Создание сделки из чата: источник уже заполнен, имя/телефон, Telegram и комментарий — вручную. */
export function CreateDealFromChatDialog({ open, onOpenChange, thread, messages, onCreated }: Props) {
  const createDeal = useServerFn(createDealFromThread);
  const loadStaff = useServerFn(listStaff);
  const { profile, isAdmin } = useAccess();
  const { data: staffData } = useQuery({
    queryKey: ["staff"],
    queryFn: () => loadStaff(undefined as never),
    enabled: isAdmin && open,
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegram, setTelegram] = useState("");
  const [messenger, setMessenger] = useState("");
  const [comment, setComment] = useState("");
  const [budget, setBudget] = useState("");
  const [responsibleId, setResponsibleId] = useState("");

  useEffect(() => {
    if (!open) return;
    const clientName = threadClientName(thread.name);
    setName(clientName === "Клиент" ? "" : thread.name.trim());
    setPhone(thread.phone.trim());
    setTelegram("");
    setMessenger("");
    setComment("");
    setBudget("");
    setResponsibleId(profile?.id ?? "");
  }, [open, thread.id, thread.name, thread.phone, profile?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      createDeal({
        data: {
          threadId: thread.id,
          name: name.trim(),
          phone: phone.trim(),
          telegram: telegram.trim(),
          preferredMessenger: messenger,
          comment: comment.trim(),
          budget: budget.trim() === "" ? null : Number(budget),
          propertyId: thread.property_id,
          responsibleId: responsibleId || profile?.id || null,
        },
      }),
    onSuccess: (result) => {
      toast.success("Сделка создана");
      onOpenChange(false);
      onCreated?.(result.dealId);
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось создать сделку"),
  });

  const canSubmit =
    name.trim() &&
    (phone.trim().length >= 5 || telegram.trim().length >= 3) &&
    Boolean(responsibleId || profile?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Создать сделку</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ChatContactHints
            messages={messages}
            onPhone={setPhone}
            onTelegram={(handle) => setTelegram(formatTelegramHandle(handle))}
          />
          <div className="space-y-1.5">
            <Label>Источник</Label>
            <Input value={chatSourceToDealSource(thread.source)} disabled />
          </div>
          {thread.property_title ? (
            <div className="space-y-1.5">
              <Label>Объект</Label>
              <Input value={thread.property_title} disabled />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-name">Имя</Label>
            <Input
              id="chat-deal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как зовут клиента"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-phone">Телефон</Label>
            <Input
              id="chat-deal-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7… (можно без номера, если есть Telegram)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-telegram">Аккаунт в Telegram</Label>
            <Input
              id="chat-deal-telegram"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="@username"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Удобный мессенджер</Label>
            <Select value={messenger || NONE} onValueChange={(v) => setMessenger(v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Как удобнее писать клиенту" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не указан</SelectItem>
                {PREFERRED_MESSENGERS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Кто ведёт сделку</Label>
            <Select value={responsibleId || NONE} onValueChange={(v) => setResponsibleId(v === NONE ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Менеджер" />
              </SelectTrigger>
              <SelectContent>
                {(staffData?.staff?.length
                  ? staffData.staff
                  : profile
                    ? [{ id: profile.id, full_name: profile.full_name, email: profile.email, role: "admin" as const }]
                    : []
                ).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.email}
                    {"role" in s && s.role === "admin" ? " · админ" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-budget">Бюджет (необязательно)</Label>
            <Input
              id="chat-deal-budget"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="₽ в месяц"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chat-deal-comment">Комментарий</Label>
            <Textarea
              id="chat-deal-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Что нужно клиенту, сроки, пожелания…"
            />
            <p className="text-xs text-muted-foreground">
              Переписка из чата добавится в сделку автоматически.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button disabled={mutation.isPending || !canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Создаём…" : "Создать сделку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
