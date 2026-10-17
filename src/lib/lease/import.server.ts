import { unzipSync } from "fflate";
const limit = 2 * 1024 * 1024;
function entities(text: string) {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[a-f0-9]+);/gi, (_, key: string) => {
    const basic: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (key.startsWith("#")) {
      const n =
        key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return basic[key.toLowerCase()] || "";
  });
}
export function importLeaseTemplate(bytes: Uint8Array) {
  if (bytes.length > limit) throw new Error("Шаблон Word должен быть не больше 2 МБ");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name !== "word/document.xml") return false;
        if (file.originalSize > limit) throw new Error("Развёрнутый шаблон слишком большой");
        return true;
      },
    });
  } catch {
    throw new Error("Не удалось прочитать DOCX или документ слишком большой");
  }
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("В файле нет основного текста Word");
  const source = new TextDecoder().decode(xml);
  const paragraphs = source.split(/<\/w:p>/);
  const text = paragraphs
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => entities(m[1] || ""))
        .join(""),
    )
    .join("\n")
    .trim();
  if (!text || text.length > 80000)
    throw new Error("Шаблон пустой или содержит больше 80 000 символов");
  return text;
}
