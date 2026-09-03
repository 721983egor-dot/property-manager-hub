import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { suggestAddress, type AddressSuggestion } from "@/lib/geo.functions";
import { suggestInBrowser } from "@/lib/ymaps";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Вызывается при выборе адреса из списка подсказок. */
  onSelect: (value: string) => void;
  placeholder?: string;
};

export function AddressAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const skipNext = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const text = value.trim();
    if (text.length < 3) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      suggestAddress({ data: { text } })
        .catch(() => [] as AddressSuggestion[])
        .then(async (res) => (res.length > 0 ? res : await suggestInBrowser(text)))
        .then((res) => {
          if (cancelled) return;
          setItems(res);
          setOpen(res.length > 0);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (item: AddressSuggestion) => {
    skipNext.current = true;
    setOpen(false);
    setItems([]);
    onChange(item.value);
    onSelect(item.value);
  };

  return (
    <div ref={wrap} className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(items.length > 0)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && items.length > 0 ? (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {items.map((item, i) => (
            <li key={`${item.value}-${i}`}>
              <button
                type="button"
                onClick={() => pick(item)}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="block font-medium">{item.title}</span>
                {item.subtitle ? (
                  <span className="block text-xs text-muted-foreground">{item.subtitle}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
