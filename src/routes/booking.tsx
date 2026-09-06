import { createFileRoute, redirect } from "@tanstack/react-router";

/** Старый адрес страницы «Посуточно» — переадресуем на главную. */
export const Route = createFileRoute("/booking")({
  beforeLoad: () => {
    throw redirect({ to: "/", statusCode: 301 });
  },
});
