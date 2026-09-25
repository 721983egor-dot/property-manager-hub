import { createFileRoute, redirect } from "@tanstack/react-router";

/** Индекс /blog скрыт, пока нет контента для публички. */
export const Route = createFileRoute("/blog/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true, statusCode: 302 });
  },
});
