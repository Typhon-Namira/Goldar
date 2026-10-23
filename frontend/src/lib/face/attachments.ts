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
    Partial<
      Record<
        | "leftLobeFound"
        | "rightLobeFound"
        | "leftCanalFound"
        | "rightCanalFound"
        | "leftHelixFound"
        | "rightHelixFound",
        boolean
      >
    >
  >();

  setPoint(id: number, point: string, found: boolean) {
    if (
      ![
        "leftLobe",
        "rightLobe",
        "leftCanal",
        "rightCanal",
        "leftHelix",
        "rightHelix",
      ].includes(point)
    )
      return;
    const state = this.faces.get(id) ?? {};
    state[`${point}Found` as keyof typeof state] = found;
    this.faces.set(id, state);
  }

  apply(face: FaceData): FaceData {
    const state = this.faces.get(face.id);
    return {
      ...face,
      leftCanalFound: face.leftCanalFound ?? state?.leftCanalFound ?? false,
      rightCanalFound: face.rightCanalFound ?? state?.rightCanalFound ?? false,
      leftHelixFound: face.leftHelixFound ?? state?.leftHelixFound ?? false,
      rightHelixFound: face.rightHelixFound ?? state?.rightHelixFound ?? false,
      leftLobeFound: face.leftLobeFound ?? state?.leftLobeFound ?? false,
      rightLobeFound: face.rightLobeFound ?? state?.rightLobeFound ?? false,
    };
  }

  clear(id?: number) {
    if (id === undefined) this.faces.clear();
    else this.faces.delete(id);
  }
}
