/**
 * Thin native shell: WKWebView loads the hosted RM OS site.
 * Switch target with RM_OS_TARGET=preview|prod (default: prod).
 * @type {import('@capacitor/cli').CapacitorConfig}
 */
const target = process.env.RM_OS_TARGET === "preview" ? "preview" : "prod";

const SERVER_URLS = {
  prod: "https://rm-os.residence-more.ru",
  preview: "https://preview-rm-os.residence-more.ru",
};

const serverUrl = SERVER_URLS[target];

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "ru.residencemore.rmos",
  appName: "RM OS",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: [
      "https://rm-os.residence-more.ru/*",
      "https://preview-rm-os.residence-more.ru/*",
      "https://*.supabase.co/*",
      "https://*.residence-more.ru/*",
    ],
  },
  ios: {
    contentInset: "automatic",
    scheme: "RM OS",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
    },
  },
};

console.log(
  `[rm-os-mobile] Capacitor server.url → ${serverUrl} (RM_OS_TARGET=${target})`,
);

module.exports = config;
