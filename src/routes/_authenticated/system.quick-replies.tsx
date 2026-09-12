import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteQuickReply,
  fetchQuickReplies,
  saveQuickReply,
  type ChatQuickReply,
} from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/system/quick-replies")({
  head: () => ({
    meta: [
      { title: "Быстрые ответы — RM OS" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <QuickRepliesPage />
    </AdminOnly>
  ),
});

function QuickRepliesPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(fetchQuickReplies);
  const save = useServerFn(saveQuickReply);
  const remove = useServerFn(deleteQuickReply);

  const [editing, setEditing] = useState<ChatQuickReply | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["chat-quick-replies"],
    queryFn: () => load({ data: undefined }),
  });
  const replies = data?.replies ?? [];

  const saveMutation = useMutation({
    mutationFn: (input: { id?: string | null; title: string; body: string; position: number }) =>
      save({ data: input }),
    onSuccess: () => {
      toast.success("Сохранено");
      setEditing(null);
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["chat-quick-replies"] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось сохранить"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Удалено");
      queryClient.invalidateQueries({ queryKey: ["chat-quick-replies"] });
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось удалить"),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Быстрые ответы</h1>
          <p className="text-sm text-muted-foreground">
            Шаблоны для раздела «Чаты»: выбираете ответ и сразу отправляете клиенту.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : replies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Zap className="size-5" />
            Пока нет шаблонов. Добавьте первый быстрый ответ.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {replies.map((reply) => (
            <Card key={reply.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <CardTitle className="text-base">{reply.title}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(reply)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(reply.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{reply.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReplyEditor
        open={creating || Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        initial={editing}
        nextPosition={replies.length}
        saving={saveMutation.isPending}
        onSave={(values) =>
          saveMutation.mutate({
            id: editing?.id ?? null,
            title: values.title,
            body: values.body,
            position: values.position,
          })
        }
      />
    </div>
  );
}

function ReplyEditor({
  open,
  onOpenChange,
  initial,
  nextPosition,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ChatQuickReply | null;
  nextPosition: number;
  saving: boolean;
  onSave: (values: { title: string; body: string; position: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [position, setPosition] = useState("0");

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setBody(initial?.body ?? "");
    setPosition(String(initial?.position ?? nextPosition));
  }, [open, initial, nextPosition]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Редактировать ответ" : "Новый быстрый ответ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Приветствие"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Текст ответа</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Текст, который подставится в чат"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Порядок</Label>
            <Input
              inputMode="numeric"
              value={position}
              onChange={(e) => setPosition(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            disabled={saving || !title.trim() || !body.trim()}
            onClick={() =>
              onSave({
                title: title.trim(),
                body: body.trim(),
                position: Number(position) || 0,
              })
            }
          >
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
