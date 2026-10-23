import { describe, it, expect } from "vitest";
import { attachmentPlan, EarLobeTracking } from "./attachments";
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
  it("never substitutes cheek-adjacent face landmarks for a piercing", () =>
    expect(attachmentPlan(fallback, "earring", "both")).toEqual({
      left: undefined,
      right: undefined,
    }));
  it("lets merchants require precise lobes instead", () =>
    expect(attachmentPlan(fallback, "earring", "both", "lobe")).toEqual({
      left: undefined,
      right: undefined,
    }));
});

describe("queued SDK ear visibility events", () => {
  const payload = {
    ...face,
    id: 1,
    leftLobeFound: undefined,
    rightLobeFound: undefined,
  };
  it("restores lobe visibility removed from the queued face event", () => {
    const tracking = new EarLobeTracking();
    tracking.setPoint(1, "leftLobe", true);
    expect(attachmentPlan(tracking.apply(payload), "earring", "both")).toEqual({
      left,
      right: undefined,
    });
    tracking.setPoint(1, "rightLobe", true);
    expect(attachmentPlan(tracking.apply(payload), "earring", "both")).toEqual({
      left,
      right,
    });
    tracking.setPoint(1, "leftLobe", false);
    expect(attachmentPlan(tracking.apply(payload), "earring", "both")).toEqual({
      left: undefined,
      right,
    });
  });
  it("does not transfer visibility between faces or after face loss", () => {
    const tracking = new EarLobeTracking();
    tracking.setPoint(1, "leftLobe", true);
    expect(tracking.apply({ ...payload, id: 2 }).leftLobeFound).toBe(false);
    tracking.clear(1);
    expect(tracking.apply(payload).leftLobeFound).toBe(false);
  });
  it("honours per-frame flags and tracks surface landmarks independently", () => {
    const tracking = new EarLobeTracking();
    tracking.setPoint(1, "leftHelix", true);
    expect(tracking.apply(payload).leftLobeFound).toBe(false);
    expect(tracking.apply(payload).leftHelixFound).toBe(true);
    tracking.setPoint(1, "leftLobe", true);
    expect(
      tracking.apply({ ...payload, leftLobeFound: false }).leftLobeFound,
    ).toBe(false);
  });
});
