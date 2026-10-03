import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DateFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Поле даты: клик по всей области открывает нативный календарь (showPicker),
 * а не только крошечную иконку справа.
 */
export function DateField({
  value,
  onValueChange,
  className,
  onClick,
  onKeyDown,
  ...props
}: DateFieldProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = ref.current;
    if (!el || el.disabled) return;
    try {
      el.showPicker?.();
    } catch {
      el.focus();
    }
  };

  return (
    <Input
      {...props}
      ref={ref}
      type="date"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onClick={(e) => {
        onClick?.(e);
        openPicker();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
      className={cn("cursor-pointer", className)}
    />
  );
}
