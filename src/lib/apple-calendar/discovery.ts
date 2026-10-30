/** Public path only; no credentials, account data or server-only dependencies. */
export const CALDAV_BASE = "/api/public/caldav/";
export function calendarDiscoveryResponse() {
  return new Response(null, {
    status: 307,
    headers: {
      Location: CALDAV_BASE,
      "Cache-Control": "no-store",
    },
  });
}
