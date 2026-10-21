import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
export function OwnerPayoutTerms({
  mode,
  day,
  onMode,
  onDay,
}: {
  mode: "scheduled" | "on_request";
  day: string;
  onMode: (mode: "scheduled" | "on_request") => void;
  onDay: (day: string) => void;
}) {
  return (
    <>
      <Label>Как выплачиваем собственнику</Label>
      <Select value={mode} onValueChange={(v) => onMode(v as "scheduled" | "on_request")}>
        <SelectTrigger aria-label="Режим выплаты собственнику">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="scheduled">В определённое число месяца</SelectItem>
          <SelectItem value="on_request">По запросу — деньги хранятся у нас</SelectItem>
        </SelectContent>
      </Select>
      {mode === "on_request" ? (
        <p className="text-xs text-muted-foreground">
          Доля собственника накапливается за вычетом расходов. Это резерв, не свободные деньги
          компании. Дата, просрочка и задача на выплату не создаются. Фактическую выдачу можно
          записать частично или полностью в карточке собственника.
        </p>
      ) : (
        <>
          <Label htmlFor="booking-owner-payout">День выплаты собственнику</Label>
          <Input
            id="booking-owner-payout"
            aria-label="День выплаты собственнику"
            type="number"
            min={1}
            max={31}
            step={1}
            value={day}
            placeholder="Например, 24"
            onChange={(e) => onDay(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Конкретное число каждого месяца. Для 29–31-го в коротком месяце — последний день.
            Изменение обновит будущий прогноз; проведённые выплаты сохранятся.
          </p>
        </>
      )}
    </>
  );
}
