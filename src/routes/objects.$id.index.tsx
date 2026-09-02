import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ImageIcon, MapPin, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  APPLIANCE_OPTIONS,
  BATHROOM_FEATURE_OPTIONS,
  OUTDOOR_OPTIONS,
  SUMMER_SEASON_LABEL,
  fetchProperty,
  floorLabel,
  formatArea,
  formatMoney,
  labelsFor,
  roomsLabel,
  signedUrls,
  typeLabel,
  yandexMapsUrl,
} from "@/lib/properties";

export const Route = createFileRoute("/objects/$id/")({
  head: () => ({
    meta: [
      { title: "Карточка объекта — RM OS" },
      { name: "description", content: "Полная информация об объекте аренды: параметры, стоимость, адрес и фотографии." },
      { property: "og:title", content: "Карточка объекта — RM OS" },
      {
        property: "og:description",
        content: "Полная информация об объекте аренды: параметры, стоимость, адрес и фотографии.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObjectViewPage,
});

function ObjectViewPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["properties", id],
    queryFn: () => fetchProperty(id),
  });

  const paths = (data?.photos ?? []).map((p) => p.path);
  const { data: urls = {} } = useQuery({
    queryKey: ["photo-urls", paths.slice().sort().join("|")],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10 lg:py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Объекты
      </Link>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Загрузка...</p>
      ) : error || !data ? (
        <p className="mt-6 text-sm text-muted-foreground">Объект не найден</p>
      ) : (
        <>
          <header className="mt-3 flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
              <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                <span>ID: {data.ref_id}</span>
                <StatusBadge status={data.status} />
              </div>
            </div>
            <Button asChild size="lg">
              <Link to="/objects/$id/edit" params={{ id: data.id }}>
                <Pencil className="size-4" />
                Редактировать
              </Link>
            </Button>
          </header>

          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Адрес</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm">{data.address || "Адрес не указан"}</p>
              {data.address ? (
                <Button asChild variant="outline">
                  <a
                    href={yandexMapsUrl(data.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="size-4" />
                    Открыть в Яндекс.Картах
                  </a>
                </Button>
              ) : null}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Основная информация</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
              <Item label="Тип" value={typeLabel(data.type)} />
              <Item label="Комплекс" value={data.complex_name || "—"} />
              <Item label="Этаж" value={floorLabel(data)} />
              <Item label="Планировка" value={roomsLabel(data.rooms)} />
              <Item label="Санузлы" value={String(data.bathrooms)} />
              <Item label="Площадь" value={formatArea(data.area)} />
            </dl>
          </section>

          {(() => {
            const outdoor = labelsFor(OUTDOOR_OPTIONS, data.outdoor_spaces);
            const appliances = labelsFor(APPLIANCE_OPTIONS, data.appliances);
            const bath = labelsFor(BATHROOM_FEATURE_OPTIONS, data.bathroom_features);
            if (outdoor.length + appliances.length + bath.length === 0) return null;
            return (
              <section className="mt-6 rounded-xl border border-border bg-card p-6">
                <h2 className="text-base font-semibold">Характеристики</h2>
                <div className="mt-4 grid gap-6 sm:grid-cols-3">
                  <Chips title="Балкон / терраса / лоджия" items={outdoor} />
                  <Chips title="Техника" items={appliances} />
                  <Chips title="Ванна / душевая / джакузи" items={bath} />
                </div>
              </section>
            );
          })()}


          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Стоимость</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3">
              <Item
                label={data.seasonal_pricing ? "Цена в месяц (не сезон)" : "Цена в месяц"}
                value={formatMoney(data.price_month)}
              />
              {data.seasonal_pricing ? (
                <Item
                  label={`Лето (${SUMMER_SEASON_LABEL})`}
                  value={formatMoney(data.summer_price_month)}
                />
              ) : null}
              <Item label="Страховой депозит" value={formatMoney(data.deposit)} />
              <Item label="Комиссия" value={formatMoney(data.commission)} />
              <Item label="Коммунальные в месяц" value={formatMoney(data.utilities_month)} />
            </dl>
          </section>

          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Описание</h2>
            <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
              {data.description || "Описание не заполнено"}
            </p>
          </section>

          <section className="mt-6 rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Фотографии</h2>
            {data.photos.length === 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border py-12 text-sm text-muted-foreground justify-center">
                <ImageIcon className="size-4" />
                Фотографии не загружены
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                {data.photos.map((photo, i) => (
                  <div
                    key={photo.path}
                    className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    {urls[photo.path] ? (
                      <img
                        src={urls[photo.path]}
                        alt={`${data.title} — фото ${i + 1}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => (
          <li
            key={i}
            className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm text-foreground"
          >
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
