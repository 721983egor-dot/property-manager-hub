/**
 * Массовая карта старых публичных URL (Tilda / ранний каталог) → канонические пути.
 *
 * Источники инвентаризации:
 * - Wayback CDX `residence-more.ru/rent*`
 * - `properties.source_url` (импорт с Tilda)
 * - текущий sitemap `/rent/jk/...` и карточки `/rent/...-{ref_id}`
 *
 * Редирект делается рано в `src/server.ts` (301), чтобы Яндекс не держал 404.
 * Если точного аналога нет — fallback на посадочную ЖК или `/rent`, не на 404.
 */

function normalizePath(pathname: string): string {
  const raw = pathname.trim() || "/";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(raw.startsWith("/") ? raw : `/${raw}`, "https://residence-more.ru");
    return (url.pathname.replace(/\/+$/, "") || "/").toLowerCase();
  } catch {
    return (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "").toLowerCase() || "/";
  }
}

/** Старый путь → новый путь (оба с ведущим `/`, без query). */
const LEGACY_PATH_REDIRECTS: Record<string, string> = {
  // --- ЖК / посадочные комплексов (Tilda: /rent/<alias> без /jk/) ---
  "/rent/lazurbereg1": "/rent/jk/lazurnyj-bereg-1",
  "/rent/lazurbereg2": "/rent/jk/lazurnyj-bereg-2",
  "/rent/grand-karat1": "/rent/jk/grand-karat",
  "/rent/grand-karat2": "/rent/jk/grand-karat",
  "/rent/grand-karat3": "/rent/jk/grand-karat",
  "/rent/redkv1": "/rent/jk/krasnaya-ploschad",
  // ЖК «Кислород» в каталоге нет — на общий листинг аренды
  "/rent/kislorod1": "/rent",

  // --- Карточки из source_url (импорт Tilda) → канонические slug ---
  "/rent/apartakter15": "/rent/apartamenty-c-2-spalnyami-i-terrasoj-1025",
  "/rent/apartidealhouse": "/rent/kvartira-s-terrasoj-i-vidom-na-more-1026",
  "/rent/balidom": "/rent/dom-bali-1027",
  "/rent/brevis1": "/rent/apartamenty-s-pryamym-vidom-1028",
  "/rent/domdliazhizni": "/rent/dom-dlya-zhizni-v-sochi-1029",
  "/rent/domhostabassein": "/rent/dom-v-hoste-s-bassejnom-1030",
  "/rent/domryadomsmorem": "/rent/dom-ryadom-s-plyazhem-1031",
  "/rent/domshaleahun": "/rent/dom-v-stile-shale-1032",
  "/rent/domusanatoriadagomis": "/rent/dom-u-sanatoriya-dagomys-1033",
  "/rent/domvcentresochi": "/rent/dom-v-tsentre-sochi-1034",
  "/rent/flagman1": "/rent/kvartira-s-2-spalnyami-v-tsentre-sochi-1035",
  "/rent/kpchereshnya": "/rent/dom-v-kp-chereshnya-1036",
  "/rent/lazurbereg1/bstudubasseina": "/rent/kvartira-studiya-u-bassejna-1037",
  "/rent/lazurbereg1/kvartirath": "/rent/kvartira-s-2-spalnyami-v-taun-hause-1038",
  "/rent/lazurbereg1/lbstilkvartirasvodom": "/rent/stilnaya-kvartira-s-vidom-1039",
  "/rent/lazurbereg1/stilkvartsdvspal": "/rent/stilnaya-kvartira-s-2-spalnyami-1040",
  "/rent/lazurbereg2/lbdvadveterracy": "/rent/kvartira-s-terrasoj-100m2-1041",
  "/rent/lazurbereg2/lbdvakvartirasbolterras": "/rent/kvartira-s-bolshoj-terrasoj-1042",
  "/rent/lazurbereg2/lbdvakvartirasdisreontom": "/rent/kvartira-s-dizajnerskim-remontom-1043",
  "/rent/lazurbereg2/lbdvakvartirasolnce": "/rent/kvartira-solntse-s-vidom-1044",
  "/rent/lazurbereg2/lbdvakvartirasvodom": "/rent/kvartira-s-vidom-na-more-1045",
  "/rent/lazurbereg2/lbdvastudiasterrasoi": "/rent/studiya-s-terrasoj-1046",
  "/rent/lazurbereg2/lbdvavipkv": "/rent/kvartira-v-vip-korpuse-1047",
  "/rent/metropol11": "/rent/kvartira-s-vidom-na-dendrarij-1048",
  "/rent/pentmagnolia": "/rent/penthaus-u-swissotel-kamelia-1049",
  "/rent/studmagnolia": "/rent/studiya-u-swissotel-kamelia-1050",
  "/rent/vidovoydom": "/rent/samyj-vidovoj-dom-1051",
  "/rent/villa1dachastalina": "/rent/villa-1-ryadom-s-dachej-stalina-1052",
  "/rent/villasantabarbara": "/rent/villa-santa-barbara-1053",
  "/rent/villavozduh": "/rent/villa-vozduh-1054",

  // --- Альтернативные Tilda-slug’и (Wayback), сопоставленные по title ---
  "/rent/studio-nearpool-lb1": "/rent/kvartira-studiya-u-bassejna-1037",
  "/rent/flat-2bedrooms-lb1": "/rent/stilnaya-kvartira-s-2-spalnyami-1040",
  "/rent/flat-2bedrooms-seaview-lb1": "/rent/stilnaya-kvartira-s-vidom-1039",
  "/rent/flat-2bedrooms-seaview-lb1-2": "/rent/stilnaya-kvartira-s-2-spalnyami-1040",
  "/rent/flat-seaview-lb1-2": "/rent/stilnaya-kvartira-s-vidom-1039",
  "/rent/flat-55m-seaview-lb1": "/rent/jk/lazurnyj-bereg-1",
  "/rent/thlazbereg1": "/rent/kvartira-s-2-spalnyami-v-taun-hause-1038",
  "/rent-townhouse-withpool-lb1": "/rent/kvartira-s-2-spalnyami-v-taun-hause-1038",
  "/rent/flat-terrace-lb2": "/rent/kvartira-s-bolshoj-terrasoj-1042",
  "/rent/flat-terrace-lb2-2": "/rent/kvartira-s-bolshoj-terrasoj-1042",
  "/rent/flat-vip-2bedrooms-lb2": "/rent/kvartira-v-vip-korpuse-1047",
  "/rentflat-1bedroom-seaview-lb2": "/rent/jk/lazurnyj-bereg-2",
  "/rent/flat-metropol-parkview": "/rent/kvartira-s-vidom-na-dendrarij-1048",
  "/rent/house-hosta-seaview": "/rent/dom-v-hoste-s-bassejnom-1030",
  "/rent/house-neardagomys200m": "/rent/dom-u-sanatoriya-dagomys-1033",
  "/rent-house-ballistyle": "/rent/dom-bali-1027",
  "/rent/villa-shale-withpool": "/rent/dom-v-stile-shale-1032",
  "/rent/domsvidomnagory": "/rent/samyj-vidovoj-dom-1051",

  // --- Снятые с публикации / без точного аналога → разумный fallback ---
  "/rent/flat-1bedroom-seasimphony": "/rent",
  "/rent/flat-sochicenter-seaview": "/rent/jk/grand-karat",
  "/rent/flat-sokol-38m": "/rent",
  "/rent/sokol-flat-test": "/rent",
  "/rent/2levelflat-terrace-meridian": "/rent",
  "/rent/domekzarho": "/rent",
  "/rent/villa2dachastalina": "/rent",
  "/rent/villa-bathkomplex-nearsea-500m-16sotok": "/rent",
  "/rent/villa-celinnaya": "/rent",
  "/rent/villa-seaview-400m-21sotka": "/rent",
  "/rent/house-redfield-7sotok": "/rent",
  "/rent/shale-redfield-200m-5sotok": "/rent",
  "/rent/house-seaview-400m-10sotok": "/rent",
  "/rent/house-nearresort-up": "/rent",
};

/**
 * Если сегмент после /rent/ — старый алиас комплекса, вернуть канонический slug ЖК.
 * Сохранено для совместимости с loader `/rent/$id`.
 */
export function legacyRentComplexSlug(segment: string): string | null {
  const key = segment.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!key || key.includes("/")) return null;
  const dest = LEGACY_PATH_REDIRECTS[`/rent/${key}`];
  if (!dest) return null;
  const m = dest.match(/^\/rent\/jk\/([^/]+)$/);
  return m?.[1] ?? null;
}

/** Полный pathname → канонический path для 301, либо null. */
export function legacyRedirectPath(pathname: string): string | null {
  const key = normalizePath(pathname);
  const dest = LEGACY_PATH_REDIRECTS[key];
  if (!dest) return null;
  const normalizedDest = normalizePath(dest);
  return normalizedDest === key ? null : normalizedDest;
}

/** Число записей в карте (для docs / отчётов). */
export function legacyRedirectCount(): number {
  return Object.keys(LEGACY_PATH_REDIRECTS).length;
}
