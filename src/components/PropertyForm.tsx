import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComplexForm } from "@/components/ComplexForm";
import { createComplex, fetchComplexes, infrastructureLabel } from "@/lib/complexes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPLIANCE_OPTIONS,
  BATHROOM_FEATURE_OPTIONS,
  BATHROOM_OPTIONS,
  DEFAULT_RENT_TERMS,
  EXTRA_FEATURE_OPTIONS,
  extraFeatureLabel,
  OUTDOOR_OPTIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  ROOM_OPTIONS,
  SUMMER_SEASON_LABEL,
  roomsLabel,


  signedUrls,
  uploadPhoto,
  type Property,
  type PropertyInput,
  type PropertyPhoto,
  type PropertyStatus,
  type PropertyType,
} from "@/lib/properties";

const NO_COMPLEX = "__none__";

const RENT_TERMS_ROWS = 5;

/** Приводит сохранённый текст условий к 5 строкам формы (по умолчанию — базовый текст). */
function toRentTermsLines(value?: string | null): string[] {
  const saved = (value ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const base = saved.length > 0 ? saved : DEFAULT_RENT_TERMS.split("\n");
  return Array.from({ length: Math.max(RENT_TERMS_ROWS, base.length) }, (_, i) => base[i] ?? "");
}


type Props = {
  initial?: Property;
  onSubmit: (input: PropertyInput) => Promise<void>;
  submitting?: boolean;
};

export function PropertyForm({ initial, onSubmit, submitting }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [internalName, setInternalName] = useState(initial?.internal_name ?? "");
  const [type, setType] = useState<PropertyType>(initial?.type ?? "apartment");
  const [complexId, setComplexId] = useState<string | null>(initial?.complex_id ?? null);
  const [complexDialog, setComplexDialog] = useState(false);
  const [address, setAddress] = useState(initial?.address ?? "");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { lat: initial.latitude, lon: initial.longitude }
      : null,
  );
  const [floor, setFloor] = useState(initial?.floor != null ? String(initial.floor) : "");
  const [totalFloors, setTotalFloors] = useState(
    initial?.total_floors != null ? String(initial.total_floors) : "",
  );
  const [rooms, setRooms] = useState(String(initial?.rooms ?? 1));
  const [bathrooms, setBathrooms] = useState(String(initial?.bathrooms ?? 1));
  const [status, setStatus] = useState<PropertyStatus>(initial?.status ?? "free");
  const [published, setPublished] = useState(Boolean(initial?.published));
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
  const [area, setArea] = useState(initial?.area != null ? String(initial.area) : "");
  const [utilities, setUtilities] = useState(
    initial?.utilities_month != null ? String(initial.utilities_month) : "",
  );
  const [outdoor, setOutdoor] = useState<string[]>(initial?.outdoor_spaces ?? []);
  const [appliances, setAppliances] = useState<string[]>(initial?.appliances ?? []);
  const [bathFeatures, setBathFeatures] = useState<string[]>(initial?.bathroom_features ?? []);
  const [extraFeatures, setExtraFeatures] = useState<string[]>(initial?.extra_features ?? []);
  const [customFeature, setCustomFeature] = useState("");
  const [locationDescription] = useState(initial?.location_description ?? "");
  const [rentTermsLines, setRentTermsLines] = useState<string[]>(() =>
    toRentTermsLines(initial?.rent_terms),
  );
  const [cardHighlights, setCardHighlights] = useState<string[]>(
    initial?.card_highlights ?? [],
  );
  const toggleHighlight = (value: string) =>
    setCardHighlights((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : prev.length >= 3
          ? prev
          : [...prev, value],
    );
  const addCustomFeature = () => {
    const value = customFeature.trim();
    if (!value || extraFeatures.includes(value)) {
      setCustomFeature("");
      return;
    }
    setExtraFeatures([...extraFeatures, value]);
    setCustomFeature("");
  };
  const toggle = (
    value: string,
    list: string[],
    setList: (v: string[]) => void,
  ) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
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

  const queryClient = useQueryClient();
  const { data: complexes = [] } = useQuery({
    queryKey: ["complexes"],
    queryFn: fetchComplexes,
  });
  const [creatingComplex, setCreatingComplex] = useState(false);
  const selectedComplex = complexes.find((c) => c.id === complexId) ?? null;

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
      internal_name: internalName.trim(),
      type,
      complex_id: complexId,
      complex_name: complexes.find((c) => c.id === complexId)?.name ?? "",
      address: address.trim(),
      floor: floor === "" ? null : Number(floor),
      total_floors: totalFloors === "" ? null : Number(totalFloors),
      rooms: Number(rooms),
      bathrooms: Number(bathrooms),
      status,
      description,
      photos,
      published,
      price_month: toNum(priceMonth),
      seasonal_pricing: seasonal,
      summer_price_month: seasonal ? toNum(summerPrice) : null,
      deposit: toNum(deposit),
      commission: toNum(commission),
      area: toNum(area),
      utilities_month: toNum(utilities),
      outdoor_spaces: outdoor,
      appliances,
      bathroom_features: bathFeatures,
      extra_features: extraFeatures,
      location_description: locationDescription,
      rent_terms: rentTermsLines.map((l) => l.trim()).filter(Boolean).join("\n"),
      card_highlights: cardHighlights,
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

          <Field
            label="Внутреннее название (только в RM OS)"
            className="md:col-span-2"
          >
            <Input
              value={internalName}
              onChange={(e) => setInternalName(e.target.value)}
              placeholder="Кислород 12-45, 2к"
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
            <div className="flex gap-2">
              <Select
                value={complexId ?? NO_COMPLEX}
                onValueChange={(v) => setComplexId(v === NO_COMPLEX ? null : v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите комплекс" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COMPLEX}>Без комплекса</SelectItem>
                  {complexes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setComplexDialog(true)}
                aria-label="Добавить комплекс"
              >
                <Plus className="size-4" />
                Комплекс
              </Button>
            </div>
          </Field>

          <Field label="Адрес объекта" className="md:col-span-2">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Сочи, ул. Северная, 12"
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

          <Field label="Площадь, м²">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="65"
            />
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

        <div className="flex items-start gap-3 md:col-span-2">
          <input
            type="checkbox"
            id="published"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="mt-1 size-5 accent-[hsl(var(--primary))]"
          />
          <label htmlFor="published" className="cursor-pointer text-sm">
            <span className="block font-medium">Опубликовать на сайте Residence More</span>
            <span className="mt-0.5 block text-muted-foreground">
              Объект появится на публичной странице со списком аренды.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Стоимость</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Field label={seasonal ? "Цена в месяц (не сезон)" : "Цена в месяц"}>
            <Input
              type="number"
              min={0}
              step={1000}
              value={priceMonth}
              onChange={(e) => setPriceMonth(e.target.value)}
              placeholder="100000"
            />
          </Field>
          <Field label="Страховой депозит">
            <Input
              type="number"
              min={0}
              step={1000}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="100000"
            />
          </Field>
          <Field label="Комиссия">
            <Input
              type="number"
              min={0}
              step={1000}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="50000"
            />
          </Field>
          <Field label="Коммунальные платежи в месяц (примерно)">
            <Input
              type="number"
              min={0}
              step={500}
              value={utilities}
              onChange={(e) => setUtilities(e.target.value)}
              placeholder="7000"
            />
          </Field>
        </div>

        <div className="mt-6 rounded-lg border border-border p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={seasonal}
              onChange={(e) => setSeasonal(e.target.checked)}
              className="mt-1 size-4 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="block text-sm font-medium">
                Повышение цены на лето ({SUMMER_SEASON_LABEL})
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                В остальные месяцы действует базовая цена.
              </span>
            </span>
          </label>

          {seasonal ? (
            <div className="mt-4 max-w-xs">
              <Field label="Цена в месяц летом">
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={summerPrice}
                  onChange={(e) => setSummerPrice(e.target.value)}
                  placeholder="150000"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Характеристики</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <CheckGroup
            title="Балкон / терраса / лоджия"
            options={OUTDOOR_OPTIONS}
            selected={outdoor}
            onToggle={(v) => toggle(v, outdoor, setOutdoor)}
          />
          <CheckGroup
            title="Техника"
            options={APPLIANCE_OPTIONS}
            selected={appliances}
            onToggle={(v) => toggle(v, appliances, setAppliances)}
          />
          <CheckGroup
            title="Ванна / душевая / джакузи"
            options={BATHROOM_FEATURE_OPTIONS}
            selected={bathFeatures}
            onToggle={(v) => toggle(v, bathFeatures, setBathFeatures)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Дополнительные характеристики</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Отмеченные значения показываются в блоке «Дополнительно» на странице объекта.
        </p>
        <div className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {EXTRA_FEATURE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={extraFeatures.includes(o.value)}
                onChange={() => toggle(o.value, extraFeatures, setExtraFeatures)}
                className="size-4 accent-[var(--primary)]"
              />
              {o.label}
            </label>
          ))}
        </div>

        {extraFeatures.filter((v) => !EXTRA_FEATURE_OPTIONS.some((o) => o.value === v)).length >
        0 ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {extraFeatures
              .filter((v) => !EXTRA_FEATURE_OPTIONS.some((o) => o.value === v))
              .map((v) => (
                <li
                  key={v}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-sm"
                >
                  {extraFeatureLabel(v)}
                  <button
                    type="button"
                    aria-label={`Удалить ${v}`}
                    onClick={() => toggle(v, extraFeatures, setExtraFeatures)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        ) : null}

        <div className="mt-5 flex max-w-md gap-2">
          <Input
            value={customFeature}
            onChange={(e) => setCustomFeature(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomFeature();
              }
            }}
            placeholder="Своя характеристика"
          />
          <Button type="button" variant="outline" onClick={addCustomFeature}>
            Добавить
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Характеристики для карточки на сайте</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Выберите до 3 характеристик комплекса — они показываются в карточке объекта в списке
          на сайте.
        </p>
        {selectedComplex ? (
          selectedComplex.infrastructure.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedComplex.infrastructure.map((value) => {
                const active = cardHighlights.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleHighlight(value)}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {infrastructureLabel(value)}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              У выбранного комплекса не указана инфраструктура.
            </p>
          )
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Выберите комплекс, чтобы отметить его характеристики.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Локация</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {complexId
            ? "Описание локации берётся из карточки выбранного комплекса — измените его в разделе «Комплексы»."
            : "Комплекс не выбран: в блоке «Локация» на странице объекта будет использован адрес объекта."}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Условия аренды</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRentTermsLines(toRentTermsLines(null))}
          >
            Базовый текст
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Каждая строка выводится отдельным пунктом на странице объекта. Пустые строки не
          показываются.
        </p>
        <div className="mt-4 space-y-3">
          {rentTermsLines.map((line, i) => (
            <Input
              key={i}
              value={line}
              onChange={(e) =>
                setRentTermsLines((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))
              }
              placeholder={`Условие ${i + 1}`}
            />
          ))}
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

      <Dialog open={complexDialog} onOpenChange={setComplexDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Новый комплекс</DialogTitle>
          </DialogHeader>
          <ComplexForm
            compact
            submitting={creatingComplex}
            onCancel={() => setComplexDialog(false)}
            onSubmit={async (input) => {
              setCreatingComplex(true);
              try {
                const created = await createComplex(input);
                await queryClient.invalidateQueries({ queryKey: ["complexes"] });
                setComplexId(created.id);
                setComplexDialog(false);
                toast.success("Комплекс создан");
              } catch {
                toast.error("Не удалось создать комплекс");
              } finally {
                setCreatingComplex(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>

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

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 space-y-2.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            {o.label}
          </label>
        ))}
      </div>
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
