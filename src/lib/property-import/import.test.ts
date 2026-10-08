import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  diskShareUrl,
  matchingRentalObjects,
  rentalImportSchema,
  rentalImportSummary,
} from "./model.ts";
import { assertDiskDownloadUrl, downloadDiskPhoto, inspectDiskPhotos } from "./disk.server.ts";

const link = "https://disk.yandex.ru/d/example";
const input = {
  diskUrl: link,
  title: "Квартира",
  type: "apartment",
  address: "Сочи, ул. Примерная, 10, кв. 2",
  rooms: 2,
  area: 54,
  priceMonth: 80000,
};
const photoBytes = Buffer.from([0xff, 0xd8, 0xff]);
const file = {
  name: "01.jpg",
  type: "file",
  path: "/01.jpg",
  size: 3,
  mime_type: "image/jpeg",
  md5: createHash("md5").update(photoBytes).digest("hex"),
  modified: "2026-10-08",
};
const json = (value: unknown) => Response.json(value);

test("only public HTTPS Disk shares accepted, credentials and lookalikes rejected", () => {
  assert.equal(diskShareUrl(link + "?utm_source=test"), link);
  for (const url of [
    "http://disk.yandex.ru/d/test",
    "https://disk.yandex.ru.evil.org/d/test",
    "https://user:pass@disk.yandex.ru/d/test",
    "https://127.0.0.1/d/test",
    "https://disk.yandex.ru:8443/d/test",
    "file:///etc/passwd",
  ])
    assert.throws(() => diskShareUrl(url));
});
test("required monthly rental facts cannot be invented by missing/invalid values", () => {
  assert.equal(rentalImportSchema.parse(input).priceMonth, 80000);
  assert.equal(rentalImportSchema.parse({ ...input, rooms: 0 }).rooms, 0);
  for (const patch of [
    { priceMonth: 0 },
    { area: -1 },
    { rooms: 1.5 },
    { address: "" },
    { floor: 8, totalFloors: 5 },
    { priceMonth: undefined },
  ])
    assert.equal(rentalImportSchema.safeParse({ ...input, ...patch }).success, false);
});
test("duplicate check normalizes address punctuation, preserves apartments and room count", () => {
  const valid = rentalImportSchema.parse(input);
  const rows = [
    { address: "СОЧИ ул Примерная 10 кв 2", rooms: 2, area: 54.3 },
    { address: "Сочи ул Примерная 10 кв 3", rooms: 2, area: 54 },
    { address: input.address, rooms: 1, area: 54 },
  ];
  assert.deepEqual(matchingRentalObjects(valid, rows), [rows[0]]);
  const summary = rentalImportSummary(valid, [file], ["Похожая квартира"]);
  assert.match(summary, /Долгосрочная/);
  assert.match(summary, /₽\/мес/);
  assert.match(summary, /Возможные дубли/);
});
test("Disk inspection walks nested folders, skips videos and produces stable fingerprint", async () => {
  const fake: typeof fetch = async (url) => {
    const path = new URL(String(url)).searchParams.get("path");
    return json({
      type: "dir",
      _embedded: {
        total: path === "/" ? 2 : 1,
        items:
          path === "/"
            ? [
                { type: "dir", path: "/inside" },
                { ...file, name: "video.mp4", mime_type: "video/mp4" },
              ]
            : [{ ...file, path: "/inside/01.jpg" }],
      },
    });
  };
  const result = await inspectDiskPhotos(link, fake);
  assert.equal(result.files.length, 1);
  assert.equal(result.ignored, 1);
  assert.equal(result.fingerprint, (await inspectDiskPhotos(link, fake)).fingerprint);
});
test("Disk inspection paginates and sorts photo paths", async () => {
  const offsets: number[] = [];
  const result = await inspectDiskPhotos(link, async (url) => {
    const offset = Number(new URL(String(url)).searchParams.get("offset"));
    offsets.push(offset);
    return json({
      type: "dir",
      _embedded: {
        total: 101,
        items:
          offset === 0
            ? Array.from({ length: 100 }, (_, i) => ({
                ...file,
                name: `video${i}.mp4`,
                mime_type: "video/mp4",
              }))
            : [file],
      },
    });
  });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.files.length, 1);
});
test("empty, private, oversized and too many photos fail before mutation", async () => {
  await assert.rejects(
    inspectDiskPhotos(link, async () => new Response("", { status: 404 })),
    /общий доступ/,
  );
  for (const items of [
    [],
    [{ ...file, size: 11 * 1024 * 1024 }],
    Array.from({ length: 301 }, () => file),
  ]) {
    await assert.rejects(
      inspectDiskPhotos(link, async () =>
        json({ type: "dir", _embedded: { total: items.length, items } }),
      ),
    );
  }
});
test("single public photo supported and changed content changes approval fingerprint", async () => {
  const first = await inspectDiskPhotos(link, async () => json(file));
  const second = await inspectDiskPhotos(link, async () => json({ ...file, md5: "changed" }));
  assert.equal(first.files.length, 1);
  assert.notEqual(first.fingerprint, second.fingerprint);
});
test("download allows only Yandex storage HTTPS, checks redirected targets", async () => {
  for (const url of [
    "https://localhost/file",
    "http://downloader.disk.yandex.ru/file",
    "https://disk.yandex.ru.evil.org/file",
    "https://user@disk.yandex.ru/file",
  ])
    assert.throws(() => assertDiskDownloadUrl(url));
  const requests: string[] = [];
  await assert.rejects(
    downloadDiskPhoto(link, { ...file, modified: "" }, async (url) => {
      requests.push(String(url));
      return requests.length === 1
        ? json({ href: "https://downloader.disk.yandex.ru/file" })
        : new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
    }),
    /недопустимый/,
  );
  assert.equal(requests.length, 2);
});
test("download validates bytes against approved metadata", async () => {
  const fake: typeof fetch = async (url) =>
    String(url).startsWith("https://cloud-api")
      ? json({ href: "https://downloader.disk.yandex.ru/file" })
      : new Response(photoBytes);
  assert.deepEqual(await downloadDiskPhoto(link, { ...file, modified: "" }, fake), photoBytes);
  await assert.rejects(
    downloadDiskPhoto(link, { ...file, md5: "invalid", modified: "" }, fake),
    /изменились/,
  );
});

test("source folder may contain more than 20 photos for automatic selection", async () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ ...file, path: `/${i}.jpg` }));
  const result = await inspectDiskPhotos(link, async () =>
    json({ type: "dir", _embedded: { total: items.length, items } }),
  );
  assert.equal(result.files.length, 40);
});
