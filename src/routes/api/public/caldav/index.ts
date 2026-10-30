import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/caldav/")({
  server: {
    handlers: {
      ANY: async ({ request }) =>
        (await import("@/lib/apple-calendar/dav.server")).handleCalendarRequest(request),
    },
  },
});
