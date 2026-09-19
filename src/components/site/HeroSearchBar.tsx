import { formatPriceDigits, priceDigits, RENT_SEARCH_DEFAULTS } from "@/lib/rent-search";
import { PROPERTY_TYPES, roomsLabel } from "@/lib/properties";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function HeroSearchBar({ roomCounts }: { roomCounts: number[] }) {
  const navigate = useNavigate();
  const [type, setType] = useState("");
  const [rooms, setRooms] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");

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
      },
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-9 w-full max-w-5xl overflow-hidden rounded-2xl bg-white/95 shadow-[0_24px_60px_-28px_rgba(8,16,32,0.55)] backdrop-blur"
    >
      <div className="grid grid-cols-1 divide-y divide-site-line sm:grid-cols-2 lg:grid-cols-[1.05fr_0.85fr_1.55fr_auto] lg:divide-x lg:divide-y-0">
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
            options={roomCounts.map((item) => ({
              value: String(item),
              label: roomsLabel(item),
            }))}
          />
        </Field>
        <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-site-muted">
            Цена в месяц
          </span>
          <div className="flex min-w-0 items-stretch gap-0">
            <PriceBox
              prefix="от"
              value={priceFrom}
              onChange={setPriceFrom}
              ariaLabel="Цена от"
            />
            <span className="mx-2 w-px shrink-0 self-stretch bg-site-line" aria-hidden />
            <PriceBox
              prefix="до"
              value={priceTo}
              onChange={setPriceTo}
              ariaLabel="Цена до"
            />
          </div>
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

function PriceBox({
  prefix,
  value,
  onChange,
  ariaLabel,
}: {
  prefix: string;
  value: string;
  onChange: (digits: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-[13px] text-site-muted">{prefix}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatPriceDigits(value)}
        onChange={(e) => onChange(priceDigits(e.target.value))}
        placeholder="0 ₽"
        aria-label={ariaLabel}
        className="h-8 w-full min-w-0 bg-transparent text-[15px] font-medium text-site-navy outline-none placeholder:text-site-muted/70"
      />
    </div>
  );
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
