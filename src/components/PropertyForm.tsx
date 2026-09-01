import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BATHROOM_OPTIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  roomsLabel,
  signedUrls,
  uploadPhoto,
  type Property,
  type PropertyInput,
  type PropertyPhoto,
  type PropertyStatus,
  type PropertyType,
} from "@/lib/properties";

type Props = {
  initial?: Property;
  onSubmit: (input: PropertyInput) => Promise<void>;
  submitting?: boolean;
};

export function PropertyForm({ initial, onSubmit, submitting }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<PropertyType>(initial?.type ?? "apartment");
  const [complexName, setComplexName] = useState(initial?.complex_name ?? "");
  const [floor, setFloor] = useState(initial?.floor != null ? String(initial.floor) : "");
  const [totalFloors, setTotalFloors] = useState(
    initial?.total_floors != null ? String(initial.total_floors) : "",
  );
  const [rooms, setRooms] = useState(String(initial?.rooms ?? 1));
  const [bathrooms, setBathrooms] = useState(String(initial?.bathrooms ?? 1));
  const [status, setStatus] = useState<PropertyStatus>(initial?.status ?? "free");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState<PropertyPhoto[]>(initial?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [priceMonth, setPriceMonth] = useState(
    initial?.price_month != null ? String(initial.price_month) : "",
  );
  const [seasonal, setSeasonal] = useState(Boolean(initial?.seasonal_pricing));
  const [summerPrice, setSummerPrice] = useState(
    initial?.summer_price_month != null ? String(initial.summer_price_month) : "",
  );
  const [deposit, setDeposit] = useState(initial?.deposit != null ? String(initial.deposit) : "");
  const [commission, setCommission] = useState(
    initial?.commission != null ? String(initial.commission) : "",
  );
  const toNum = (v: string) => (v.trim() === "" ? null : Number(v));


  useEffect(() => {
    if (!initial) return;
    setPhotos(initial.photos);
  }, [initial?.id]);

  const paths = photos.map((p) => p.path);
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map(uploadPhoto));
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch {
      toast.error("Не удалось загрузить фотографии");
    } finally {
      setUploading(false);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const makeMain = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (item) next.unshift(item);
      return next;
    });
  };

  const remove = (index: number) => setPhotos((prev) => prev.filter((_, i) => i !== index));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Укажите название объекта");
      return;
    }
    await onSubmit({
      title: title.trim(),
      type,
      complex_name: complexName.trim(),
      floor: floor === "" ? null : Number(floor),
      total_floors: totalFloors === "" ? null : Number(totalFloors),
      rooms: Number(rooms),
      bathrooms: Number(bathrooms),
      status,
      description,
      photos,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Основная информация</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <Field label="Название объекта" className="md:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Квартира в ЖК Кислород"
            />
          </Field>

          <Field label="Тип объекта">
            <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Комплекс">
            <Input
              value={complexName}
              onChange={(e) => setComplexName(e.target.value)}
              placeholder="ЖК Кислород"
              list="complex-options"
            />
          </Field>

          <Field label="Этаж объекта">
            <Input
              type="number"
              min={-5}
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="7"
            />
          </Field>

          <Field label="Количество этажей">
            <Input
              type="number"
              min={1}
              value={totalFloors}
              onChange={(e) => setTotalFloors(e.target.value)}
              placeholder="18"
            />
          </Field>

          <Field label="Планировка">
            <Select value={rooms} onValueChange={setRooms}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {roomsLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Санузлы">
            <Select value={bathrooms} onValueChange={setBathrooms}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATHROOM_OPTIONS.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Статус">
            <Select value={status} onValueChange={(v) => setStatus(v as PropertyStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Описание</h2>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="mt-4 resize-y"
          placeholder="Опишите объект, его особенности и условия аренды"
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Фотографии</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Первая фотография используется как главная в списке объектов.
            </p>
          </div>
          <Button type="button" variant="outline" asChild disabled={uploading}>
            <label className="cursor-pointer">
              <ImagePlus className="size-4" />
              {uploading ? "Загрузка..." : "Загрузить фото"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
        </div>

        {photos.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Фотографии ещё не загружены
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {photos.map((photo, index) => (
              <div
                key={photo.path}
                className="group overflow-hidden rounded-lg border border-border"
              >
                <div className="relative aspect-[4/3] bg-muted">
                  {urls[photo.path] ? (
                    <img
                      src={urls[photo.path]}
                      alt={`Фото ${index + 1}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                  {index === 0 ? (
                    <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      Главное
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <div className="flex gap-0.5">
                    <IconBtn label="Влево" onClick={() => move(index, -1)}>
                      <ArrowLeft className="size-4" />
                    </IconBtn>
                    <IconBtn label="Вправо" onClick={() => move(index, 1)}>
                      <ArrowRight className="size-4" />
                    </IconBtn>
                    <IconBtn label="Сделать главной" onClick={() => makeMain(index)}>
                      <Star className="size-4" />
                    </IconBtn>
                  </div>
                  <IconBtn label="Удалить" onClick={() => remove(index)}>
                    <Trash2 className="size-4 text-destructive" />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <datalist id="complex-options" />

      <div className="flex items-center justify-end gap-3 pb-4">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/" })}>
          Отмена
        </Button>
        <Button type="submit" size="lg" disabled={submitting || uploading}>
          {submitting ? "Сохранение..." : "Сохранить объект"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 block text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}
