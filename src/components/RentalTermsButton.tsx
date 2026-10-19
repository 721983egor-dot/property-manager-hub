import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBooking } from "@/lib/bookings";
import { BookingDialog } from "./BookingDialog";
export function RentalTermsButton({
  bookingId,
  onSaved,
}: {
  bookingId: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const booking = useQuery({
    queryKey: ["rental-booking-editor", bookingId],
    queryFn: () => fetchBooking(bookingId),
    enabled: open,
  });
  return (
    <>
      <button type="button" className="fa-button" onClick={() => setOpen(true)}>
        Изменить цену и комиссию
      </button>
      {open && booking.isPending && (
        <p role="status" className="fa-note">
          Загрузка условий…
        </p>
      )}
      {open && booking.error && (
        <p role="alert" className="fa-error">
          Не удалось загрузить бронь.{" "}
          <button type="button" onClick={() => void booking.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {booking.data && (
        <BookingDialog
          open={open}
          onOpenChange={setOpen}
          booking={booking.data}
          initialMode="edit"
          onSaved={onSaved}
        />
      )}
    </>
  );
}
