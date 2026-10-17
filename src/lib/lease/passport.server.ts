import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blankIdentity, type Identity } from "./model";
export function parsePassportText(text: string): Partial<Identity> {
  const p: Partial<Identity> = {};
  const clean = text.replace(/[\u00a0]/g, " ");
  const date = (s: string) =>
    s
      .split(/[.\-/]/)
      .reverse()
      .join("-");
  const get = (label: string) =>
    clean.match(new RegExp(label + "[ :\\t]*([^\\n]+)", "i"))?.[1]?.trim();
  const series =
    clean.match(/\b(\d{2})[ \t]+(\d{2})[ \t]+(\d{6})\b/) ??
    clean.match(/\b(\d{2})(\d{2})[ \t]+(\d{6})\b/);
  if (series) {
    p.series = series[1]! + series[2]!;
    p.number = series[3]!;
  }
  const code = clean.match(/\b(\d{3})[- ](\d{3})\b/);
  if (code) p.department_code = code[1] + "-" + code[2];
  const dates = clean.match(/\b\d{2}[.\-/]\d{2}[.\-/]\d{4}\b/g) ?? [];
  const birth = get("Дата рождения")?.match(/\d{2}[.\-/]\d{2}[.\-/]\d{4}/);
  if (birth) p.birth_date = date(birth[0]);
  const issued = get("Дата выдачи")?.match(/\d{2}[.\-/]\d{2}[.\-/]\d{4}/);
  if (issued) p.issued_date = date(issued[0]);
  else if (dates.length === 1 && !birth) p.issued_date = date(dates[0]!);
  const surname = get("Фамилия"),
    name = get("Имя"),
    patronymic = get("Отчество");
  if (surname && name) p.full_name = [surname, name, patronymic].filter(Boolean).join(" ");
  const issuedBy = get("Кем выдан");
  if (issuedBy) p.issued_by = issuedBy;
  const place = get("Место рождения");
  if (place) p.birth_place = place;
  const registration = get("Адрес регистрации") || get("Место жительства");
  if (registration) p.registration = registration;
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
}
let occupied = false;
export async function recognizePassport(bytes: Buffer, mime: string) {
  if (occupied) throw new Error("Распознавание занято. Повторите через минуту");
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Фото должно быть не больше 10 МБ");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Отправьте фото паспорта JPG или PNG, по одной странице");
  occupied = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "rm-passport-"));
    const input = join(dir, "input");
    await writeFile(input, bytes, { mode: 0o600 });
    const image = await promisify(execFile)(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=width,height", "-of", "json", input],
      { timeout: 10000, maxBuffer: 65536 },
    );
    const size = JSON.parse(image.stdout).streams?.[0];
    if (!size || !size.width || !size.height || size.width * size.height > 24000000)
      throw new Error("Слишком большое изображение");
    const { stdout } = await promisify(execFile)(
      "tesseract",
      [input, "stdout", "-l", "rus+eng", "--psm", "3"],
      { timeout: 60000, maxBuffer: 1024 * 1024, env: { ...process.env, OMP_THREAD_LIMIT: "2" } },
    );
    return { identity: { ...blankIdentity(), ...parsePassportText(stdout) }, text: stdout };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("Распознавание на сервере не установлено. Паспорт можно заполнить вручную");
    throw new Error(
      "Не удалось распознать фото. Попробуйте чёткое фото без бликов или заполните поля вручную",
    );
  } finally {
    occupied = false;
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
