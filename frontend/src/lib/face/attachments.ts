import type { FaceData, Point } from "./types";
export function validPoint(p: unknown): p is Point {
  return (
    !!p &&
    typeof p === "object" &&
    ["x", "y", "z"].every((k) =>
      Number.isFinite((p as Record<string, number>)[k]),
    )
  );
}
export function attachmentPlan(
  face: FaceData,
  category: string,
  side: "both" | "left" | "right",
  _earAnchor: "auto" | "lobe" = "auto",
): { left?: Point; right?: Point; estimated?: boolean } {
  const points = face.attachmentPoints ?? {};
  const available = (key: string, found: boolean) =>
    found && validPoint(points[key]?.position)
      ? points[key].position
      : undefined;
  if (category !== "earring") return { left: available("chin", true) };
  const lobeLeft = available(
    "leftLobe",
    face.leftLobeFound === true && side !== "right",
  );
  const lobeRight = available(
    "rightLobe",
    face.rightLobeFound === true && side !== "left",
  );
  // leftEar/rightEar are face-mesh landmarks near the cheek, not piercings.
  // Legacy auto calibration must also wait for a tracked lobe.
  return { left: lobeLeft, right: lobeRight };
}

/** XR8 queues face events by reference, then removes the lobe-found flags.
 * Keep the independent earpointfound/earpointlost events per face instead. */
export class EarLobeTracking {
  private faces = new Map<
    number,
    { leftLobeFound?: boolean; rightLobeFound?: boolean }
  >();

  setPoint(id: number, point: string, found: boolean) {
    if (point !== "leftLobe" && point !== "rightLobe") return;
    const state = this.faces.get(id) ?? {};
    state[point === "leftLobe" ? "leftLobeFound" : "rightLobeFound"] = found;
    this.faces.set(id, state);
  }

  apply(face: FaceData): FaceData {
    const state = this.faces.get(face.id);
    return {
      ...face,
      leftLobeFound: face.leftLobeFound ?? state?.leftLobeFound ?? false,
      rightLobeFound: face.rightLobeFound ?? state?.rightLobeFound ?? false,
    };
  }

  clear(id?: number) {
    if (id === undefined) this.faces.clear();
    else this.faces.delete(id);
  }
}
