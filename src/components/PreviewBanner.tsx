/** Жёлтая полоска на тестовых доменах: рабочий сайт для клиентов не менялся. */
export function PreviewBanner() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  const isPreviewSite = host.startsWith("preview.");
  const isPreviewRmOs = host.startsWith("preview-rm-os.");
  if (!isPreviewSite && !isPreviewRmOs) return null;

  return (
    <div className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950">
      Это тестовая версия. Клиенты по-прежнему видят{" "}
      <a
        href={isPreviewRmOs ? "https://rm-os.residence-more.ru" : "https://residence-more.ru"}
        className="underline underline-offset-2"
      >
        {isPreviewRmOs ? "rm-os.residence-more.ru" : "residence-more.ru"}
      </a>
      . На рабочую систему попадёт только после «Обновить систему».
    </div>
  );
}
