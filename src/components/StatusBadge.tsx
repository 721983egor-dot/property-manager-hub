import { cn } from "@/lib/utils";
import { statusLabel, type PropertyStatus } from "@/lib/properties";

const styles: Record<PropertyStatus, string> = {
  free: "bg-status-free-soft text-status-free",
  soon_free: "bg-status-soon-soft text-status-soon",
  rented: "bg-status-rented-soft text-status-rented",
  booked: "bg-status-booked-soft text-status-booked",
  archived: "bg-status-archived-soft text-status-archived",
};

export function StatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
