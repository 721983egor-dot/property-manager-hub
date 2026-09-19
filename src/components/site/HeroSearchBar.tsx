import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Search } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROPERTY_TYPES, roomsLabel, ROOM_OPTIONS } from "@/lib/properties";
import { RENT_SEARCH_DEFAULTS } from "@/lib/rent-search";
import { cn } from "@/lib/utils";

export function HeroSearchBar() {
  const navigate = useNavigate();
  const [type, setType] = useState("");
  const [rooms, setRooms] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [onMap, setOnMap] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void navigate({
      to: "/rent",
      search: {
        ...RENT_SEARCH_DEFAULTS,
        type,
        rooms,
        priceFrom,
        priceTo,
        view: onMap ? "map" : "",
      },
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-9 w-full max-w-5xl overflow-hidden rounded-2xl bg-white/95 shadow-[0_24px_60px_-28px_rgba(8,16,32,0.55)] backdrop-blur"
    >
      <div className="grid grid-cols-1 divide-y divide-site-line sm:grid-cols-2 lg:grid-cols-[1.15fr_0.9fr_1.2fr_auto_auto] lg:divide-x lg:divide-y-0">
        <Field label="Тип объекта">
          <HeroSelect
            value={type}
            onChange={setType}
            placeholder="Любой"
            options={PROPERTY_TYPES.map((item) => ({ value: item.value, label: item.label }))}
          />
        </Field>
        <Field label="Комнаты">
          <HeroSelect
            value={rooms}
            onChange={setRooms}
            placeholder="Любые"
            options={ROOM_OPTIONS.map((item) => ({
              value: String(item),
              label: roomsLabel(item),
            }))}
          />
        </Field>
        <Field label="Цена, ₽ / мес">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={priceFrom}
              onChange={(e) => setPriceFrom(digitsOnly(e.target.value))}
              placeholder="от"
              aria-label="Цена от"
              className="h-8 w-full min-w-0 bg-transparent text-[15px] font-medium text-site-navy outline-none placeholder:text-site-muted"
            />
            <span className="text-site-muted">—</span>
            <input
              type="text"
              inputMode="numeric"
              value={priceTo}
              onChange={(e) => setPriceTo(digitsOnly(e.target.value))}
              placeholder="до"
              aria-label="Цена до"
              className="h-8 w-full min-w-0 bg-transparent text-[15px] font-medium text-site-navy outline-none placeholder:text-site-muted"
            />
          </div>
        </Field>
        <div className="flex items-end px-4 py-3">
          <button
            type="button"
            aria-pressed={onMap}
            onClick={() => setOnMap((v) => !v)}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors",
              onMap
                ? "border-site-gold bg-site-gold/15 text-site-navy"
                : "border-site-line bg-white text-site-navy hover:border-site-gold",
            )}
          >
            <MapPin className="size-4 text-site-gold" />
            На карте
          </button>
        </div>
        <div className="flex items-end p-3 sm:col-span-2 lg:col-span-1">
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-site-gold px-7 text-sm font-semibold text-site-navy transition-colors hover:bg-site-gold/85"
          >
            <Search className="size-4" />
            Найти
          </button>
        </div>
      </div>
    </form>
  );
}

function digitsOnly(value: string) {
  return value.replace(/[^\d]/g, "");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-site-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function HeroSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>span]:text-[15px] [&>span]:font-medium [&>span]:text-site-navy">
        <SelectValue placeholder={placeholder}>
          {value ? (options.find((item) => item.value === value)?.label ?? value) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{placeholder}</SelectItem>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
