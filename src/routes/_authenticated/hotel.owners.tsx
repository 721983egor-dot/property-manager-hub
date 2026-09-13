import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { HotelTabs } from "@/components/HotelTabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAccess } from "@/hooks/useAccess";
import {
  deleteOwner,
  grantOwnerAccess,
  listHotelCategories,
  listOwners,
  saveOwner,
} from "@/lib/hotel.functions";
import { fetchProperties, internalTitle } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/hotel/owners")({
  head: () => ({
    meta: [{ title: "Собственники N-11 — RM OS" }],
  }),
  component: HotelOwnersPage,
});

function HotelOwnersPage() {
  const { isAdmin } = useAccess();
  const qc = useQueryClient();
  const loadOwners = useServerFn(listOwners);
  const loadCategories = useServerFn(listHotelCategories);
  const persist = useServerFn(saveOwner);
  const remove = useServerFn(deleteOwner);
  const grant = useServerFn(grantOwnerAccess);

  const { data: owners = [] } = useQuery({
    queryKey: ["hotel-owners"],
    queryFn: () => loadOwners(undefined as never),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["hotel-categories"],
    queryFn: () => loadCategories(undefined as never),
  });

  const rooms = useMemo(
    () => properties.filter((p) => p.portfolio === "n11" && p.status !== "archived"),
    [properties],
  );

  const [open, setOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessOwnerId, setAccessOwnerId] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    comment: "",
    room_ids: [] as string[],
    shares: {} as Record<string, string>,
  });

  const save = useMutation({
    mutationFn: () =>
      persist({
        data: {
          id: editingId,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          comment: form.comment,
          room_ids: form.room_ids,
          shares: Object.fromEntries(
            Object.entries(form.shares).map(([id, value]) => [
              id,
              value ? Number(value) : null,
            ]),
          ),
        },
      }),
    onSuccess: async () => {
      toast.success("Собственник сохранён");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["hotel-owners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Собственники N-11</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            У номера может быть один собственник или несколько долей. Кабинет показывает только их
            категории и загрузку.
          </p>
        </div>
        {isAdmin ? (
          <Button
            onClick={() => {
              setEditingId(null);
              setForm({
                full_name: "",
                phone: "",
                email: "",
                comment: "",
                room_ids: [],
                shares: {},
              });
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            Добавить собственника
          </Button>
        ) : null}
      </header>
      <HotelTabs active="owners" />

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Собственник</th>
              <th className="px-4 py-3 font-medium">Контакты</th>
              <th className="px-4 py-3 font-medium">Номера</th>
              <th className="px-4 py-3 font-medium">Кабинет</th>
              {isAdmin ? <th className="px-4 py-3 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {owners.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                  Собственников пока нет.
                </td>
              </tr>
            ) : (
              owners.map((owner) => (
                <tr key={owner.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{owner.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[owner.phone, owner.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {owner.rooms
                      .map((link) => {
                        const room = rooms.find((r) => r.id === link.property_id);
                        const share = link.share_percent ? ` (${link.share_percent}%)` : "";
                        return `${room ? internalTitle(room) : "номер"}${share}`;
                      })
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {owner.user_id ? "доступ выдан" : "нет входа"}
                  </td>
                  {isAdmin ? (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Доступ в кабинет"
                        onClick={() => {
                          setAccessOwnerId(owner.id);
                          setAccessEmail(owner.email);
                          setAccessPassword("");
                          setAccessOpen(true);
                        }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingId(owner.id);
                          setForm({
                            full_name: owner.full_name,
                            phone: owner.phone,
                            email: owner.email,
                            comment: owner.comment,
                            room_ids: owner.rooms.map((r) => r.property_id),
                            shares: Object.fromEntries(
                              owner.rooms.map((r) => [
                                r.property_id,
                                r.share_percent == null ? "" : String(r.share_percent),
                              ]),
                            ),
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (!confirm(`Удалить ${owner.full_name}?`)) return;
                          void remove({ data: { id: owner.id } })
                            .then(async () => {
                              toast.success("Собственник удалён");
                              await qc.invalidateQueries({ queryKey: ["hotel-owners"] });
                            })
                            .catch((e: Error) => toast.error(e.message));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Собственник" : "Новый собственник"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>ФИО</Label>
              <Input
                className="mt-1.5"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Телефон</Label>
              <Input
                className="mt-1.5"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label>Почта</Label>
              <Input
                className="mt-1.5"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Комментарий</Label>
              <Textarea
                className="mt-1.5"
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Номера и доли</Label>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-border p-3">
              {rooms.map((room) => {
                const checked = form.room_ids.includes(room.id);
                const category = categories.find((c) => c.id === room.room_category_id);
                return (
                  <label key={room.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        setForm((f) => ({
                          ...f,
                          room_ids: value
                            ? [...f.room_ids, room.id]
                            : f.room_ids.filter((id) => id !== room.id),
                        }))
                      }
                    />
                    <span className="flex-1">
                      {internalTitle(room)}
                      {category ? (
                        <span className="text-muted-foreground"> · {category.name}</span>
                      ) : null}
                    </span>
                    <Input
                      className="h-8 w-20"
                      placeholder="%"
                      disabled={!checked}
                      value={form.shares[room.id] ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          shares: { ...f.shares, [room.id]: e.target.value },
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Доступ в кабинет собственника</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Почта для входа</Label>
              <Input
                className="mt-1.5"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Пароль</Label>
              <Input
                className="mt-1.5"
                type="password"
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                void grant({
                  data: { ownerId: accessOwnerId, email: accessEmail, password: accessPassword },
                })
                  .then(async () => {
                    toast.success("Доступ выдан");
                    setAccessOpen(false);
                    await qc.invalidateQueries({ queryKey: ["hotel-owners"] });
                  })
                  .catch((e: Error) => toast.error(e.message));
              }}
            >
              Сохранить доступ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
