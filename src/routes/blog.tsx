import { createFileRoute, redirect } from "@tanstack/react-router";

/** Публичный блог пока скрыт: пустой список не индексируем. Админка «Статьи» в RM OS остаётся. */
export const Route = createFileRoute("/blog")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true, statusCode: 302 });
  },
});
