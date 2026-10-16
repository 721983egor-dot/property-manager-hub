import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fetchProperties, internalTitle } from "@/lib/properties";
import { crmDb } from "@/lib/crm-results";
import type { Deal } from "@/lib/deals";
export function IntakeWonDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const qc = useQueryClient();
  const [property, setProperty] = useState(deal.property_id ?? "__new__");
  const { data = [] } = useQuery({ queryKey: ["properties"], queryFn: fetchProperties });
  useEffect(() => setProperty(deal.property_id ?? "__new__"), [deal.id, deal.property_id]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await crmDb.rpc("crm_accept_intake", {
        p_deal: deal.id,
        p_property: property === "__new__" ? null : property,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект принят в работу");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Принять объект в работу</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {deal.title}. Свяжите с существующим объектом РМ ОС или создайте карточку из заполненных
          параметров.
        </p>
        <Select value={property} onValueChange={setProperty}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__">Создать объект из параметров сделки</SelectItem>
            {data
              .filter((p) => p.portfolio === "rm" && p.status !== "archived")
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {internalTitle(p)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Объект не публикуется на сайте автоматически.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            Принять в работу
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
