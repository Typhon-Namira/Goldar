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
  earAnchor: "auto" | "lobe" = "auto",
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
  const left =
    lobeLeft ??
    (earAnchor === "auto" ? available("leftEar", side !== "right") : undefined);
  const right =
    lobeRight ??
    (earAnchor === "auto" ? available("rightEar", side !== "left") : undefined);
  return {
    left,
    right,
    ...((left && !lobeLeft) || (right && !lobeRight)
      ? { estimated: true }
      : {}),
  };
}
