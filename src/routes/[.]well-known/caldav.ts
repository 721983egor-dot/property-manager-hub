import { createFileRoute } from "@tanstack/react-router";
import { calendarDiscoveryResponse } from "@/lib/apple-calendar/discovery";

/** iPhone discovers CalDAV at the origin, even when a full account URL was supplied.
 * Serve discovery in the application too: its release must not depend on proxy mounts.
 * 307 preserves PROPFIND and its body when the client follows the redirect.
 */
export const Route = createFileRoute("/.well-known/caldav")({
  server: { handlers: { ANY: async () => calendarDiscoveryResponse() } },
});
