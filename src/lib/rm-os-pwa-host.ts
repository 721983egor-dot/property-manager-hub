import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { hostnameFromRequestHeaders, isRmOsAppHost } from "@/lib/rm-os-pwa";

/** Hostname for the current request / browser tab. */
export const getAppHostname = createIsomorphicFn()
  .client(() => window.location.hostname.toLowerCase())
  .server(() => {
    try {
      const request = getRequest();
      return request ? hostnameFromRequestHeaders(request.headers) : "";
    } catch {
      return "";
    }
  });

export const getRmOsPwaEnabled = createIsomorphicFn()
  .client(() => isRmOsAppHost(window.location.hostname))
  .server(() => isRmOsAppHost(getAppHostname()));
