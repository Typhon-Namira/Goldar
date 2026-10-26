import { InstancedMesh, Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { chainPoint, type NeckSurface } from "./neck-surface";
const CAPACITY = 384;
/** Explicit rig for the original demo asset. Never infer a rig for merchant GLBs. */
export class NecklaceRig {
  readonly root: Object3D;
  private chain: InstancedMesh;
  private pendant: Object3D;
  private clasp: Object3D;
  private key = "";
  constructor(model: Object3D) {
    const source = model.getObjectByName("ChainLinks") as InstancedMesh;
    const pendant = model.getObjectByName("PendantAssembly");
    const clasp = model.getObjectByName("ClaspAssembly");
    if (!source?.isInstancedMesh || !pendant || !clasp)
      throw Error("The fitted necklace rig is incomplete.");
    this.root = model;
    this.root.scale.setScalar(1000);
    const mesh = new InstancedMesh(source.geometry, source.material, CAPACITY);
    mesh.name = source.name;
    mesh.frustumCulled = false;
    source.parent!.add(mesh);
    source.removeFromParent();
    this.chain = mesh;
    this.pendant = pendant;
    this.clasp = clasp;
  }
  update(surface: NeckSurface, detailScale = 1) {
    const key = JSON.stringify([
      surface.radius.toFixed(1),
      surface.height.toFixed(1),
      surface.drop.toFixed(1),
      detailScale.toFixed(3),
      surface.viewDirection?.map((v) => v.toFixed(3)),
    ]);
    if (key === this.key) return;
    this.key = key;
    const samples = 512,
      points: Vector3[] = [],
      lengths = [0];
    for (let i = 0; i <= samples; i++) {
      const p = new Vector3(...chainPoint(surface, i / samples));
      points.push(p);
      if (i) lengths.push(lengths[i - 1] + p.distanceTo(points[i - 1]));
    }
    const length = lengths[samples],
      count = Math.min(
        CAPACITY,
        Math.max(96, Math.round(length / (1.65 * detailScale))),
      );
    const matrix = new Matrix4(),
      q = new Quaternion(),
      roll = new Quaternion(),
      up = new Vector3(0, 1, 0),
      scale = new Vector3(detailScale, detailScale, detailScale);
    let segment = 1;
    for (let i = 0; i < count; i++) {
      const distance = (i / count) * length;
      while (segment < samples && lengths[segment] < distance) segment++;
      const f =
        (distance - lengths[segment - 1]) /
        (lengths[segment] - lengths[segment - 1]);
      const t = (segment - 1 + f) / samples;
      const position = new Vector3(...chainPoint(surface, t)).multiplyScalar(
        0.001,
      );
      const tangent = new Vector3(...chainPoint(surface, t + 0.0001))
        .sub(new Vector3(...chainPoint(surface, t - 0.0001)))
        .normalize();
      q.setFromUnitVectors(up, tangent);
      roll.setFromAxisAngle(up, i % 2 ? Math.PI * 0.32 : -Math.PI * 0.32);
      q.multiply(roll);
      matrix.compose(position, q, scale);
      this.chain.setMatrixAt(i, matrix);
    }
    this.chain.count = count;
    this.chain.instanceMatrix.needsUpdate = true;
    const front = new Vector3(...chainPoint(surface, 0.25)).multiplyScalar(
      0.001,
    );
    this.pendant.position.copy(front);
    const [vx, vz] = surface.viewDirection ?? [0, 1];
    const bearing = new Vector3(vx, 0, vz).normalize();
    this.pendant.position.addScaledVector(bearing, 0.0015);
    this.pendant.rotation.set(-Math.atan(0.32), Math.atan2(vx, vz), 0, "YXZ");
    this.pendant.scale.setScalar(detailScale);
    this.clasp.position.set(...chainPoint(surface, 0.75)).multiplyScalar(0.001);
    this.clasp.scale.setScalar(detailScale);
  }
}
