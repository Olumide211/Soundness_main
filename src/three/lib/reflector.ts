import * as THREE from 'three';

/** Planar reflection render target (horizontal plane y = planeY). Mirrors the camera, renders at reduced res with mipmaps for roughness blur. */
export class PlanarReflector {
  rt: THREE.WebGLRenderTarget;
  textureMatrix = new THREE.Matrix4();
  mirrorCam = new THREE.PerspectiveCamera();
  planeY: number;
  private clip: THREE.Plane;
  private v = new THREE.Vector3();
  private t = new THREE.Vector3();
  private n = new THREE.Vector3(0, 1, 0);
  private rot = new THREE.Matrix4();
  private look = new THREE.Vector3(0, 0, -1);
  constructor(w: number, h: number, planeY: number) {
    this.planeY = planeY;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 0,
    });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY + 0.02);
  }
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, hide: THREE.Object3D[]) {
    const mirrorWorldPosition = new THREE.Vector3(0, this.planeY, 0);
    const cameraWorldPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    this.rot.extractRotation(camera.matrixWorld);
    const view = mirrorWorldPosition.clone().sub(cameraWorldPosition);
    view.reflect(this.n).negate();
    view.add(mirrorWorldPosition);
    this.look.set(0, 0, -1).applyMatrix4(this.rot).add(cameraWorldPosition);
    const target = mirrorWorldPosition.clone().sub(this.look);
    target.reflect(this.n).negate();
    target.add(mirrorWorldPosition);
    const mc = this.mirrorCam;
    mc.position.copy(view);
    mc.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.n);
    mc.lookAt(target);
    mc.far = camera.far; mc.near = camera.near;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);
    mc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix);
    this.textureMatrix.multiply(mc.matrixWorldInverse);

    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevRT = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.clippingPlanes = [this.clip];
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevRT);
    renderer.clippingPlanes = prevClip;
    renderer.shadowMap.autoUpdate = prevShadow;
    hide.forEach((o, i) => (o.visible = vis[i]));
  }
}

/** Inject planar reflection sampling into a MeshStandard/Physical material. */
export function addReflection(mat: THREE.MeshStandardMaterial, refl: PlanarReflector, strength: number, lod: number) {
  const uniforms = {
    uReflTex: { value: refl.rt.texture },
    uReflMat: { value: refl.textureMatrix },
    uReflStrength: { value: strength },
    uReflLod: { value: lod },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflMat;\nvarying vec4 vReflCoord;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvReflCoord = uReflMat * (modelMatrix * vec4(transformed, 1.0));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uReflTex; uniform float uReflStrength; uniform float uReflLod; varying vec4 vReflCoord;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 ruv = vReflCoord.xy / vReflCoord.w;
          ruv += normal.xz * 0.004;
          vec3 rc = textureLod(uReflTex, ruv, uReflLod).rgb * 0.5 + textureLod(uReflTex, ruv, uReflLod + 1.5).rgb * 0.5;
          float fres = 0.04 + 0.96 * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0);
          outgoingLight += rc * uReflStrength * (0.3 + 0.7 * fres);
        }
        #include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => 'refl' + lod;
  return uniforms;
}
