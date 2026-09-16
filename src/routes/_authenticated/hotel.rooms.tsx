import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { HotelTabs } from "@/components/HotelTabs";
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
import { useAccess } from "@/hooks/useAccess";
import {
  deleteHotelCategory,
  deleteHotelRoom,
  listHotelCategories,
  listOwners,
  saveHotelCategory,
  saveHotelRoom,
} from "@/lib/hotel.functions";
import { fetchProperties, internalTitle } from "@/lib/properties";

export const Route = createFileRoute("/_authenticated/hotel/rooms")({
  head: () => ({
    meta: [{ title: "Номера Н11 — RM OS" }],
  }),
  component: HotelRoomsPage,
});

function HotelRoomsPage() {
  const { isAdmin } = useAccess();
  const qc = useQueryClient();
  const loadCategories = useServerFn(listHotelCategories);
  const loadOwners = useServerFn(listOwners);
  const saveRoom = useServerFn(saveHotelRoom);
  const removeRoom = useServerFn(deleteHotelRoom);
  const saveCategory = useServerFn(saveHotelCategory);
  const removeCategory = useServerFn(deleteHotelCategory);

  const { data: properties = [] } = useQuery({
    queryKey: ["properties"],
    queryFn: fetchProperties,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["hotel-categories"],
    queryFn: () => loadCategories(undefined as never),
  });
  const { data: owners = [] } = useQuery({
    queryKey: ["hotel-owners"],
    queryFn: () => loadOwners(undefined as never),
  });

  const rooms = useMemo(
    () => properties.filter((p) => p.portfolio === "n11"),
    [properties],
  );
  const ownersByRoom = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const owner of owners) {
      for (const link of owner.rooms) {
        const list = map.get(link.property_id) ?? [];
        list.push(owner.full_name);
        map.set(link.property_id, list);
      }
    }
    return map;
  }, [owners]);

  const [roomOpen, setRoomOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    internal_name: "",
    room_category_id: "",
    bnovo_room_id: "",
    price_night: "",
    guests_max: "2",
    floor: "",
    area: "",
    status: "free",
    comment: "",
  });
  const emptyCategory = {
    id: "",
    code: "",
    name: "",
    description: "",
    guests: "2",
    area: "",
    price_night: "",
    sort_order: "10",
    bnovo_room_type_id: "",
  };
  const [catForm, setCatForm] = useState(emptyCategory);

  const roomMutation = useMutation({
    mutationFn: () =>
      saveRoom({
        data: {
          id: editingId,
          title: form.title,
          internal_name: form.internal_name,
          room_category_id: form.room_category_id || null,
          bnovo_room_id: form.bnovo_room_id,
          price_night: form.price_night ? Number(form.price_night) : null,
          guests_max: form.guests_max ? Number(form.guests_max) : null,
          floor: form.floor ? Number(form.floor) : null,
          area: form.area ? Number(form.area) : null,
          status: form.status,
          comment: form.comment,
        },
      }),
    onSuccess: async () => {
      toast.success(editingId ? "Номер обновлён" : "Номер добавлен");
      setRoomOpen(false);
      await qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const catMutation = useMutation({
    mutationFn: () =>
      saveCategory({
        data: {
          id: catForm.id || null,
          code: catForm.code,
          name: catForm.name,
          description: catForm.description,
          guests: Number(catForm.guests) || 2,
          area: catForm.area ? Number(catForm.area) : null,
          price_night: catForm.price_night ? Number(catForm.price_night) : null,
          sort_order: Number(catForm.sort_order) || 0,
          bnovo_room_type_id: catForm.bnovo_room_type_id,
        },
      }),
    onSuccess: async () => {
      toast.success("Категория сохранена");
      setCategoryOpen(false);
      await qc.invalidateQueries({ queryKey: ["hotel-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Номера Н11</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Бронь из Bnovo приходит на категорию (Стандарт Плюс, Делюкс). Конкретный номер
            менеджер выбирает при заселении — ID комнаты в Bnovo не обязателен.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCatForm(emptyCategory);
                setCategoryOpen(true);
              }}
            >
              Категория
            </Button>
            <Button
              onClick={() => {
                setEditingId(null);
                setForm({
                  title: "",
                  internal_name: "",
                  room_category_id: categories[0]?.id ?? "",
                  bnovo_room_id: "",
                  price_night: "",
                  guests_max: "2",
                  floor: "",
                  area: "",
                  status: "free",
                  comment: "",
                });
                setRoomOpen(true);
              }}
            >
              <Plus className="size-4" />
              Добавить номер
            </Button>
          </div>
        ) : null}
      </header>
      <HotelTabs active="rooms" />

      <div className="mt-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
            onClick={() => {
              if (!isAdmin) return;
              setCatForm({
                id: c.id,
                code: c.code,
                name: c.name,
                description: c.description,
                guests: String(c.guests),
                area: c.area == null ? "" : String(c.area),
                price_night: c.price_night == null ? "" : String(c.price_night),
                sort_order: String(c.sort_order),
                bnovo_room_type_id: c.bnovo_room_type_id ?? "",
              });
              setCategoryOpen(true);
            }}
          >
            {c.name}
            {c.bnovo_room_type_id ? (
              <span className="ml-2 text-xs text-muted-foreground">Bnovo {c.bnovo_room_type_id}</span>
            ) : null}
            {isAdmin ? <Pencil className="ml-2 inline size-3.5 text-muted-foreground" /> : null}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Номер</th>
              <th className="px-4 py-3 font-medium">Категория</th>
              <th className="px-4 py-3 font-medium">ID номера Bnovo</th>
              <th className="px-4 py-3 font-medium">Собственники</th>
              <th className="px-4 py-3 font-medium">Цена/ночь</th>
              {isAdmin ? <th className="px-4 py-3 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                  Добавьте номера — они появятся сверху общего календаря.
                </td>
              </tr>
            ) : (
              rooms.map((room) => {
                const category = categories.find((c) => c.id === room.room_category_id);
                return (
                  <tr key={room.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{internalTitle(room)}</td>
                    <td className="px-4 py-3">{category?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {room.bnovo_room_id || "подтянется при заселении"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(ownersByRoom.get(room.id) ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {room.price_night != null ? `${room.price_night.toLocaleString("ru-RU")} ₽` : "—"}
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(room.id);
                            setForm({
                              title: room.title,
                              internal_name: room.internal_name,
                              room_category_id: room.room_category_id ?? "",
                              bnovo_room_id: room.bnovo_room_id ?? "",
                              price_night: room.price_night == null ? "" : String(room.price_night),
                              guests_max: room.guests_max == null ? "" : String(room.guests_max),
                              floor: room.floor == null ? "" : String(room.floor),
                              area: room.area == null ? "" : String(room.area),
                              status: room.status,
                              comment: room.availability_note,
                            });
                            setRoomOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (!confirm(`Удалить номер ${internalTitle(room)}?`)) return;
                            void removeRoom({ data: { id: room.id } })
                              .then(async () => {
                                toast.success("Номер удалён");
                                await qc.invalidateQueries({ queryKey: ["properties"] });
                              })
                              .catch((e: Error) => toast.error(e.message));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Номер" : "Новый номер Н11"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Номер (внутренний)">
              <Input
                value={form.internal_name}
                onChange={(e) => setForm((f) => ({ ...f, internal_name: e.target.value }))}
                placeholder="101"
              />
            </Field>
            <Field label="Название">
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Н11, 101"
              />
            </Field>
            <Field label="Категория">
              <Select
                value={form.room_category_id}
                onValueChange={(v) => setForm((f) => ({ ...f, room_category_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Категория" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ID номера в Bnovo (необязательно)">
              <Input
                value={form.bnovo_room_id}
                onChange={(e) => setForm((f) => ({ ...f, bnovo_room_id: e.target.value }))}
                placeholder="появится, когда гостя заселят в конкретный номер"
              />
            </Field>
            <Field label="Цена за ночь, ₽">
              <Input
                type="number"
                value={form.price_night}
                onChange={(e) => setForm((f) => ({ ...f, price_night: e.target.value }))}
              />
            </Field>
            <Field label="Гостей">
              <Input
                type="number"
                value={form.guests_max}
                onChange={(e) => setForm((f) => ({ ...f, guests_max: e.target.value }))}
              />
            </Field>
            <Field label="Этаж">
              <Input
                type="number"
                value={form.floor}
                onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
              />
            </Field>
            <Field label="Площадь, м²">
              <Input
                type="number"
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => roomMutation.mutate()} disabled={roomMutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catForm.id ? "Категория" : "Новая категория"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Код">
              <Input
                value={catForm.code}
                onChange={(e) => setCatForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="studio"
              />
            </Field>
            <Field label="Название">
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Гостей">
              <Input
                type="number"
                value={catForm.guests}
                onChange={(e) => setCatForm((f) => ({ ...f, guests: e.target.value }))}
              />
            </Field>
            <Field label="Порядок">
              <Input
                type="number"
                value={catForm.sort_order}
                onChange={(e) => setCatForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </Field>
            <Field label="ID категории Bnovo (room_type_id)">
              <Input
                value={catForm.bnovo_room_type_id}
                onChange={(e) => setCatForm((f) => ({ ...f, bnovo_room_type_id: e.target.value }))}
                placeholder="например 720995"
              />
            </Field>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Бронь в Bnovo садится на категорию. Если поле пустое, RM OS запомнит ID сама при
              первой выгрузке, где в названии есть номер 546 / 567 / 526 / 530.
            </p>
          </div>
          <DialogFooter className="sm:justify-between">
            {catForm.id ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!confirm("Удалить категорию?")) return;
                  void removeCategory({ data: { id: catForm.id } })
                    .then(async () => {
                      toast.success("Категория удалена");
                      setCategoryOpen(false);
                      await qc.invalidateQueries({ queryKey: ["hotel-categories"] });
                    })
                    .catch((e: Error) => toast.error(e.message));
                }}
              >
                Удалить
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={() => catMutation.mutate()} disabled={catMutation.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
