import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
export type RepeatEndMode = "count" | "until" | "unlimited";
export function RepeatEndSelect({
  value,
  onChange,
}: {
  value: RepeatEndMode;
  onChange: (v: RepeatEndMode) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Срок повторения</p>
      <Select value={value} onValueChange={(v) => onChange(v as RepeatEndMode)}>
        <SelectTrigger aria-label="Срок повторения">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="count">Количество раз</SelectItem>
          <SelectItem value="until">До даты</SelectItem>
          <SelectItem value="unlimited">Без срока</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
export function RecurringEditScope({
  scope,
  onScopeChange,
  day,
  onDayChange,
  monthly,
  unlimited,
  error,
}: {
  scope: "single" | "following";
  onScopeChange: (v: "single" | "following") => void;
  day: string;
  onDayChange: (v: string) => void;
  monthly: boolean;
  unlimited: boolean;
  error: boolean;
}) {
  return (
    <div className="space-y-3 rounded border p-3">
      <p className="text-sm font-medium">Регулярная операция{unlimited ? " · без срока" : ""}</p>
      <label className="flex gap-2 text-sm">
        <input
          type="radio"
          name="series-edit-scope"
          checked={scope === "single"}
          onChange={() => onScopeChange("single")}
        />
        Только эту операцию
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="radio"
          name="series-edit-scope"
          checked={scope === "following"}
          onChange={() => onScopeChange("following")}
        />
        Эту и все последующие
      </label>
      {scope === "following" && (
        <>
          <p className="text-xs text-muted-foreground">
            Изменятся неоплаченные операции. Проведённые и частичные оплаты сохранят свои суммы и
            даты.
          </p>
          {monthly && (
            <label className="block text-sm">
              День регулярной оплаты
              <Input
                type="number"
                min={1}
                max={31}
                step={1}
                value={day}
                onChange={(e) => onDayChange(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить серию. Откройте операцию заново.
        </p>
      )}
    </div>
  );
}
