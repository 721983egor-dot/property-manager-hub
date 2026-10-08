import assert from "node:assert/strict";
import { test } from "node:test";
import { approvedPhotos, validateAssessments, validatePhotoChoice } from "./selection-model.ts";
const photos = [0, 1, 2].map((id) => ({
  id,
  suitable: id !== 1,
  score: 90,
  scene: "кухня",
  reason: "свет",
}));
test("model must assess exactly every image, without unknown or duplicate IDs", () => {
  assert.deepEqual(validateAssessments([0, 1, 2], photos), photos);
  for (const bad of [
    photos.slice(1),
    [photos[0]!, photos[0]!, photos[2]!],
    [...photos.slice(0, 2), { ...photos[2]!, id: 8 }],
  ])
    assert.throws(() => validateAssessments([0, 1, 2], bad));
});
test("only suitable known distinct photo IDs can be selected in cover-first order", () => {
  assert.deepEqual(validatePhotoChoice(photos, [2, 0]), [2, 0]);
  for (const bad of [[], [1], [9], [0, 0], Array(21).fill(0)])
    assert.throws(() => validatePhotoChoice(photos, bad));
});
test("executor resolves exact confirmed paths, rejects absent, repeated or unbounded legacy gallery", () => {
  const files = [{ path: "/a.jpg" }, { path: "/b.jpg" }];
  assert.deepEqual(approvedPhotos(files, ["/b.jpg", "/a.jpg"]), [files[1], files[0]]);
  for (const paths of [[], ["/no.jpg"], ["/a.jpg", "/a.jpg"]])
    assert.throws(() => approvedPhotos(files, paths));
  assert.throws(() => approvedPhotos(Array.from({ length: 21 }, (_, i) => ({ path: `/${i}` }))));
});
