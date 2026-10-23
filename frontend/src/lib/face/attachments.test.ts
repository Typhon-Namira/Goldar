import { describe, it, expect } from "vitest";
import { attachmentPlan } from "./attachments";
import type { FaceData } from "./types";
const left = { x: -0.5, y: 0, z: 0 },
  right = { x: 0.5, y: 0, z: 0 },
  chin = { x: 0, y: -0.5, z: 0 };
const face = {
  attachmentPoints: {
    leftLobe: { position: left },
    rightLobe: { position: right },
    chin: { position: chin },
  },
  leftLobeFound: true,
  rightLobeFound: true,
} as FaceData;
describe("face attachment visibility", () => {
  it("attaches independent copies to both visible lobes", () =>
    expect(attachmentPlan(face, "earring", "both")).toEqual({ left, right }));
  it("hides only the ear that was lost", () =>
    expect(
      attachmentPlan({ ...face, leftLobeFound: false }, "earring", "both"),
    ).toEqual({ left: undefined, right }));
  it("honours single-ear products", () =>
    expect(attachmentPlan(face, "earring", "left")).toEqual({
      left,
      right: undefined,
    }));
  it("does not substitute the wrong ear for a missing lobe", () =>
    expect(
      attachmentPlan({ ...face, attachmentPoints: {} }, "earring", "both"),
    ).toEqual({ left: undefined, right: undefined }));
  it("uses the chin for the approximate necklace attachment", () =>
    expect(attachmentPlan(face, "necklace", "both")).toEqual({ left: chin }));
  it("rejects nonfinite anchor coordinates", () =>
    expect(
      attachmentPlan(
        {
          ...face,
          attachmentPoints: { chin: { position: { x: NaN, y: 0, z: 0 } } },
        },
        "necklace",
        "both",
      ),
    ).toEqual({ left: undefined }));
});
describe("automatic ear attachment", () => {
  const fallback = {
    ...face,
    leftLobeFound: false,
    rightLobeFound: false,
    attachmentPoints: {
      leftEar: { position: left },
      rightEar: { position: right },
    },
  };
  it("uses labelled SDK face-ear estimates when lobes cannot be resolved", () =>
    expect(attachmentPlan(fallback, "earring", "both")).toEqual({
      left,
      right,
      estimated: true,
    }));
  it("lets merchants require precise lobes instead", () =>
    expect(attachmentPlan(fallback, "earring", "both", "lobe")).toEqual({
      left: undefined,
      right: undefined,
    }));
});
