import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INFRASTRUCTURE_OPTIONS, type Complex, type ComplexInput } from "@/lib/complexes";
import { signedUrls, uploadPhoto, type PropertyPhoto } from "@/lib/properties";

type Props = {
  initial?: Complex;
  onSubmit: (input: ComplexInput) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
  compact?: boolean;
};

export function ComplexForm({ initial, onSubmit, onCancel, submitting, compact }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [photos, setPhotos] = useState<PropertyPhoto[]>(initial?.photos ?? []);
  const [mainPhoto, setMainPhoto] = useState<string | null>(initial?.main_photo ?? null);
  const [infrastructure, setInfrastructure] = useState<string[]>(initial?.infrastructure ?? []);
  const [uploading, setUploading] = useState(false);

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

  const remove = (index: number) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed && removed.path === mainPhoto) setMainPhoto(null);
      return prev.filter((_, i) => i !== index);
    });
  };

  const toggle = (value: string) =>
    setInfrastructure((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Укажите название комплекса");
      return;
    }
    await onSubmit({
      name: name.trim(),
      description,
      photos,
      main_photo: mainPhoto ?? photos[0]?.path ?? null,
      infrastructure,
    });
  };

  const box = compact ? "" : "rounded-xl border border-border bg-card p-6";

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className={box}>
        {compact ? null : <h2 className="text-base font-semibold">Основная информация</h2>}
        <div className={compact ? "space-y-5" : "mt-5 space-y-5"}>
          <div>
            <Label className="mb-2 block text-sm font-medium">Название комплекса</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ЖК Метрополь"
            />
          </div>
          <div>
            <Label className="mb-2 block text-sm font-medium">Описание</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={compact ? 4 : 6}
              className="resize-y"
              placeholder="Современный жилой комплекс бизнес-класса рядом с парком Дендрарий..."
            />
          </div>
        </div>
      </section>

      <section className={box}>
        <h2 className="text-base font-semibold">Инфраструктура</h2>
        <div className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {INFRASTRUCTURE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={infrastructure.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              {o.label}
            </label>
          ))}
        </div>
      </section>

      <section className={box}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Фотографии</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Отметьте главное фото — оно показывается в списке и на странице объекта.
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
          <div className="mt-5 rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Фотографии ещё не загружены
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {photos.map((photo, index) => {
              const isMain = (mainPhoto ?? photos[0]?.path) === photo.path;
              return (
                <div key={photo.path} className="overflow-hidden rounded-lg border border-border">
                  <div className="relative aspect-[4/3] bg-muted">
                    {urls[photo.path] ? (
                      <img
                        src={urls[photo.path]}
                        alt={`Фото ${index + 1}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                    {isMain ? (
                      <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        Главное
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Влево"
                        onClick={() => move(index, -1)}
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Вправо"
                        onClick={() => move(index, 1)}
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Сделать главным"
                        onClick={() => setMainPhoto(photo.path)}
                      >
                        <Star className="size-4" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-center justify-end gap-3 pb-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" size="lg" disabled={submitting || uploading}>
          {submitting ? "Сохранение..." : "Сохранить комплекс"}
        </Button>
      </div>
    </form>
  );
}
