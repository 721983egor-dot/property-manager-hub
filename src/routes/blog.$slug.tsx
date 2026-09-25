import { createFileRoute, redirect } from "@tanstack/react-router";

/** Статьи с сайта временно убраны — slug тоже на главную, без индексации пустышки. */
export const Route = createFileRoute("/blog/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true, statusCode: 302 });
  },
});
