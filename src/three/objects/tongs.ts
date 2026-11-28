import * as THREE from 'three';
import { makeBrushed } from '../lib/textures';

/** Blacksmith-style scissor tongs, brushed steel, articulated jaws cupping the orb. Local origin = orb centre. */
export function createTongs() {
  const brushed = makeBrushed(256);
  brushed.repeat.set(1, 8);
  const steel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#8f959c'), metalness: 1, roughness: 0.3, roughnessMap: brushed,
    anisotropy: 0.75, anisotropyRotation: Math.PI / 2, envMapIntensity: 0.75, clearcoat: 0.0,
  });
  const jawMat = steel.clone();
  jawMat.color = new THREE.Color('#4a4d52');
  jawMat.emissive = new THREE.Color('#ff2a00');
  jawMat.emissiveIntensity = 0.06;
  jawMat.roughness = 0.5;
  jawMat.envMapIntensity = 0.5;

  const pivot = new THREE.Vector3(0, 10.5, 0);
  const root = new THREE.Group(); // oriented tongs
  const arms: THREE.Group[] = [];
  const capElev = (36 * Math.PI) / 180;
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.copy(pivot);
    const inner = new THREE.Group();
    inner.position.copy(pivot).negate();
    arm.add(inner);
    // jaw cup
    const dir = new THREE.Vector3(side * Math.cos(capElev), Math.sin(capElev), 0).normalize();
    const cupO = new THREE.Mesh(new THREE.SphereGeometry(3.32, 40, 14, 0, Math.PI * 2, 0, 0.62), jawMat);
    const cupI = new THREE.Mesh(new THREE.SphereGeometry(3.08, 40, 14, 0, Math.PI * 2, 0, 0.62), jawMat);
    (cupI.material as THREE.Material) = jawMat.clone();
    (cupI.material as THREE.MeshPhysicalMaterial).side = THREE.BackSide;
    (cupI.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25;
    const rimR = 3.2 * Math.sin(0.62);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.12, 10, 48), steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.2 * Math.cos(0.62);
    const cup = new THREE.Group();
    cup.add(cupO, cupI, rim);
    cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    inner.add(cup);
    // arm: straight forged bars (jaw stub -> pivot -> handle)
    const pole = dir.clone().multiplyScalar(3.3);
    const zOff = side * 0.42;
    const pts = [
      pole.clone(),
      pole.clone().add(dir.clone().multiplyScalar(1.1)),
      new THREE.Vector3(0, pivot.y, zOff),
      new THREE.Vector3(-side * 3.6, pivot.y + 52, zOff),
    ];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const len = a.distanceTo(b);
      const r = k === 2 ? 0.6 : 0.55;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18, 1, true), steel);
      cyl.position.copy(a).add(b).multiplyScalar(0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      cyl.castShadow = true;
      inner.add(cyl);
      if (k > 0) {
        const j = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), steel);
        j.position.copy(a);
        inner.add(j);
      }
    }
    cupO.castShadow = true;
    // flattened boss at the pivot
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.5, 32), steel);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(0, pivot.y, zOff);
    boss.castShadow = true;
    inner.add(boss);
    arm.userData.side = side;
    root.add(arm);
    arms.push(arm);
  }
  // rivet
  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 24), steel);
  rivet.rotation.x = Math.PI / 2;
  rivet.position.copy(pivot);
  root.add(rivet);
  // orientation: handles rise toward upper-right and away from camera
  root.rotation.set(-0.34, 0, -0.3);
  const group = new THREE.Group();
  group.add(root);
  const axis = new THREE.Vector3(0, 1, 0).applyEuler(root.rotation);
  return {
    group,
    update(pos: THREE.Vector3, jaw: number, lift: number, heat: number) {
      group.position.copy(pos).addScaledVector(axis, lift);
      for (const a of arms) a.rotation.z = a.userData.side * jaw * 0.2;
      jawMat.emissiveIntensity = 0.05 * heat;
      group.visible = lift < 69;
    },
  };
}
