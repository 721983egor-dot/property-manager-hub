import { createHash } from "node:crypto";
import { diskShareUrl, MAX_IMPORT_BYTES, MAX_SOURCE_PHOTOS, MAX_PHOTO_BYTES } from "./model.ts";

type Resource = {
  type: string;
  name: string;
  path: string;
  size?: number;
  md5?: string;
  modified?: string;
  mime_type?: string;
  _embedded?: { items: Resource[]; total: number };
};
export type DiskPhoto = { name: string; path: string; size: number; md5: string; modified: string };
type Fetcher = typeof fetch;
const API = "https://cloud-api.yandex.net/v1/disk/public/resources";

async function metadata(
  url: string,
  path: string,
  offset: number,
  request: Fetcher,
): Promise<Resource> {
  const query = new URLSearchParams({
    public_key: url,
    path,
    offset: String(offset),
    limit: "100",
    sort: "name",
  });
  const response = await request(`${API}?${query}`, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      `Яндекс Диск недоступен (${response.status}). Проверьте общий доступ и разрешение скачивания.`,
    );
  return response.json() as Promise<Resource>;
}

/** Read-only inspection: never downloads archives or follows user-supplied download URLs. */
export async function inspectDiskPhotos(value: string, request: Fetcher = fetch) {
  const diskUrl = diskShareUrl(value);
  const files: DiskPhoto[] = [];
  let ignored = 0,
    visited = 0,
    bytes = 0;
  async function walk(path: string, depth: number) {
    if (depth > 4) throw new Error("Слишком много вложенных папок. Соберите фото в одну папку.");
    for (let offset = 0; ; offset += 100) {
      const resource = await metadata(diskUrl, path, offset, request);
      const items = resource.type === "file" ? [resource] : resource._embedded?.items;
      if (!Array.isArray(items)) throw new Error("Яндекс Диск не вернул список файлов");
      for (const item of items) {
        if (++visited > 1000)
          throw new Error("В папке слишком много файлов. Создайте отдельную папку с фото объекта.");
        if (item.type === "dir") {
          await walk(item.path, depth + 1);
          continue;
        }
        if (
          !/\.(jpe?g|png|webp)$/i.test(item.name) ||
          !/^image\/(jpeg|png|webp)$/.test(item.mime_type ?? "")
        ) {
          ignored++;
          continue;
        }
        if (!Number.isSafeInteger(item.size) || item.size! <= 0 || item.size! > MAX_PHOTO_BYTES)
          throw new Error(`Фото «${item.name}» должно быть не больше 10 МБ`);
        bytes += item.size!;
        if (bytes > MAX_IMPORT_BYTES) throw new Error("Общий размер фотографий больше 2 ГБ");
        files.push({
          name: item.name,
          path: item.path,
          size: item.size!,
          md5: item.md5 ?? "",
          modified: item.modified ?? "",
        });
        if (files.length > MAX_SOURCE_PHOTOS)
          throw new Error(
            `Для автоматического просмотра поддерживается до ${MAX_SOURCE_PHOTOS} фото в папке объекта.`,
          );
      }
      if (resource.type === "file" || offset + items.length >= (resource._embedded?.total ?? 0))
        break;
      if (!items.length) throw new Error("Не удалось прочитать всю папку Яндекс Диска");
    }
  }
  await walk("/", 0);
  if (!files.length)
    throw new Error("В папке нет фотографий JPG, PNG или WebP. HEIC нужно сохранить как JPG.");
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fingerprint = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return { diskUrl, files, fingerprint, ignored };
}

export function assertDiskDownloadUrl(value: string) {
  const url = new URL(value);
  const h = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["disk.yandex.ru", "disk.yandex.com", "disk.yandex.net", "storage.yandex.net"].some(
      (suffix) => h === suffix || h.endsWith("." + suffix),
    )
  )
    throw new Error("Яндекс Диск вернул недопустимый адрес скачивания");
  return url.href;
}

export async function downloadDiskPhoto(
  diskUrl: string,
  file: DiskPhoto,
  request: Fetcher = fetch,
): Promise<Buffer> {
  const query = new URLSearchParams({ public_key: diskShareUrl(diskUrl), path: file.path });
  const response = await request(`${API}/download?${query}`, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`Не удалось получить фото «${file.name}». Проверьте разрешение скачивания.`);
  let url = assertDiskDownloadUrl(
    String(((await response.json()) as { href?: string }).href ?? ""),
  );
  for (let hops = 0; hops < 5; hops++) {
    const photo = await request(url, { signal: AbortSignal.timeout(30000), redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(photo.status)) {
      await photo.body?.cancel();
      url = assertDiskDownloadUrl(new URL(photo.headers.get("location") ?? "", url).href);
      continue;
    }
    if (!photo.ok || !photo.body) throw new Error(`Не удалось скачать фото «${file.name}»`);
    const reader = photo.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_PHOTO_BYTES) throw new Error(`Фото «${file.name}» больше 10 МБ`);
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks);
    if (
      length !== file.size ||
      (file.md5 && createHash("md5").update(bytes).digest("hex") !== file.md5)
    )
      throw new Error(
        "Фотографии изменились. Отправьте ссылку повторно и подтвердите новый состав.",
      );
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp =
      bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp)
      throw new Error(`Файл «${file.name}» не является фотографией JPG, PNG или WebP`);
    return bytes;
  }
  throw new Error("Слишком много перенаправлений при скачивании фото");
}
