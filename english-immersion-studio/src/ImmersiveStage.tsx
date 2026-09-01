import { useEffect, useRef, useState } from "react";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AvatarSource } from "./avatar";
import type { PerformanceState } from "./data";
import {
  bakeFaceIdentityTexture,
  type FaceIdentityShape,
  type FaceIdentityTexture
} from "./face-identity";

export type ViewMode = "first" | "third";
export type AvatarRenderState = "loading" | "ready" | "error";

type ImmersiveStageProps = {
  sceneImage: string;
  actorName: string;
  performance: PerformanceState;
  speaking: boolean;
  viewMode: ViewMode;
  avatarModelUrl: string;
  identityImageUrl?: string;
  avatarSource: AvatarSource;
  outfitId: string;
  onRenderState?: (state: AvatarRenderState) => void;
};

type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "leftUpperArm"
  | "leftLowerArm"
  | "leftHand"
  | "rightShoulder"
  | "rightUpperArm"
  | "rightLowerArm"
  | "rightHand";

const genericBoneNames: Record<BoneName, string[]> = {
  hips: ["Hips", "hips"],
  spine: ["Spine", "spine"],
  chest: ["Spine1", "Chest", "chest"],
  upperChest: ["Spine2", "UpperChest", "upperChest"],
  neck: ["Neck", "neck"],
  head: ["Head", "head"],
  leftShoulder: ["LeftShoulder", "leftShoulder"],
  leftUpperArm: ["LeftArm", "LeftUpperArm", "leftUpperArm"],
  leftLowerArm: ["LeftForeArm", "LeftLowerArm", "leftLowerArm"],
  leftHand: ["LeftHand", "leftHand"],
  rightShoulder: ["RightShoulder", "rightShoulder"],
  rightUpperArm: ["RightArm", "RightUpperArm", "rightUpperArm"],
  rightLowerArm: ["RightForeArm", "RightLowerArm", "rightLowerArm"],
  rightHand: ["RightHand", "rightHand"]
};

type Pose = {
  lean: number;
  turn: number;
  headTilt: number;
  leftArm: [number, number, number];
  rightArm: [number, number, number];
};

const poses: Record<PerformanceState, Pose> = {
  inviting: {
    lean: 0.025,
    turn: -0.04,
    headTilt: 0.025,
    leftArm: [0.08, 0.05, 1.38],
    rightArm: [0.03, -0.08, -1.18]
  },
  listening: {
    lean: 0.055,
    turn: 0.035,
    headTilt: -0.045,
    leftArm: [0.04, 0.03, 1.43],
    rightArm: [0.04, -0.02, -1.4]
  },
  thinking: {
    lean: 0.015,
    turn: -0.075,
    headTilt: -0.075,
    leftArm: [0.04, 0.02, 1.42],
    rightArm: [-0.42, -0.12, -0.88]
  },
  explaining: {
    lean: 0.04,
    turn: 0.045,
    headTilt: 0.018,
    leftArm: [-0.2, 0.08, 1.08],
    rightArm: [-0.32, -0.12, -0.82]
  },
  encouraging: {
    lean: 0.045,
    turn: -0.02,
    headTilt: 0.055,
    leftArm: [-0.08, 0.02, 1.32],
    rightArm: [-0.12, -0.04, -1.22]
  }
};

const wardrobeColors: Record<string, { primary: number; secondary: number; accent: number }> = {
  executive: { primary: 0x25282a, secondary: 0xe7dfcf, accent: 0xb99559 },
  doctor: { primary: 0xe8ece8, secondary: 0x769d91, accent: 0x273b39 },
  nurse: { primary: 0x193a50, secondary: 0xe8eeee, accent: 0x79a9b4 },
  cabin: { primary: 0x722c3b, secondary: 0xeadcc8, accent: 0xc49b58 },
  hanfu: { primary: 0x9bb9a7, secondary: 0xe6d7c7, accent: 0xb79b64 },
  teacher: { primary: 0x655542, secondary: 0xd9c8af, accent: 0x9a7a50 },
  academy: { primary: 0x26364a, secondary: 0xe5ded1, accent: 0x8f3140 },
  turtleneck: { primary: 0x20211f, secondary: 0x5a5b55, accent: 0xd2b279 },
  editorial: { primary: 0x171719, secondary: 0x4f3f49, accent: 0xc0a1ad },
  anime: { primary: 0xe8e6df, secondary: 0x383b43, accent: 0xb74750 }
};

function createWardrobeAccessories(
  outfitId: string,
  bounds: THREE.Box3
) {
  const palette = wardrobeColors[outfitId] ?? wardrobeColors.executive;
  const group = new THREE.Group();
  group.name = `wardrobe-${outfitId}`;
  const height = Math.max(bounds.max.y - bounds.min.y, 0.1);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  const makeMaterial = (color: number, roughness = 0.72) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
  const addMesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1]
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (outfitId === "doctor") {
    const stethoscope = addMesh(
      new THREE.TorusGeometry(height * 0.07, height * 0.008, 8, 28, Math.PI * 1.65),
      makeMaterial(palette.accent, 0.4),
      [centerX, bounds.min.y + height * 0.63, centerZ + height * 0.145]
    );
    stethoscope.rotation.z = 0.55;
  }

  if (outfitId === "cabin" || outfitId === "academy") {
    const neckAccent = addMesh(
      new THREE.TorusGeometry(height * 0.055, height * 0.012, 10, 28),
      makeMaterial(palette.accent, 0.45),
      [centerX, bounds.min.y + height * 0.72, centerZ + height * 0.14]
    );
    neckAccent.rotation.x = Math.PI / 2;
  }

  if (outfitId === "executive" || outfitId === "teacher") {
    const leftLapel = addMesh(
      new THREE.BoxGeometry(height * 0.018, height * 0.17, height * 0.012),
      makeMaterial(palette.accent, 0.5),
      [centerX - height * 0.055, bounds.min.y + height * 0.63, centerZ + height * 0.145]
    );
    const rightLapel = addMesh(
      new THREE.BoxGeometry(height * 0.018, height * 0.17, height * 0.012),
      makeMaterial(palette.accent, 0.5),
      [centerX + height * 0.055, bounds.min.y + height * 0.63, centerZ + height * 0.145]
    );
    leftLapel.rotation.z = -0.28;
    rightLapel.rotation.z = 0.28;
  }

  if (outfitId === "turtleneck") {
    addMesh(
      new THREE.CylinderGeometry(height * 0.052, height * 0.064, height * 0.055, 24),
      makeMaterial(palette.primary),
      [centerX, bounds.min.y + height * 0.745, centerZ]
    );
  }

  if (outfitId === "nurse") {
    addMesh(
      new THREE.BoxGeometry(height * 0.18, height * 0.035, height * 0.08),
      makeMaterial(palette.secondary),
      [centerX, bounds.min.y + height * 0.94, centerZ]
    );
  }

  if (outfitId === "hanfu" || outfitId === "anime") {
    const belt = addMesh(
      new THREE.TorusGeometry(height * 0.135, height * 0.009, 8, 32),
      makeMaterial(palette.accent, 0.35),
      [centerX, bounds.min.y + height * 0.45, centerZ]
    );
    belt.rotation.x = Math.PI / 2;
  }

  if (outfitId === "editorial") {
    const necklace = addMesh(
      new THREE.TorusGeometry(height * 0.045, height * 0.006, 8, 24, Math.PI * 1.3),
      makeMaterial(palette.accent, 0.3),
      [centerX, bounds.min.y + height * 0.715, centerZ + height * 0.145]
    );
    necklace.rotation.z = 0.95;
  }

  return group;
}

function attachWardrobeShell(
  vrm: VRM | undefined,
  root: THREE.Object3D,
  outfitId: string,
  bounds: THREE.Box3
) {
  const shell = createWardrobeAccessories(outfitId, bounds);
  const hips = vrm?.humanoid?.getNormalizedBoneNode("hips");
  if (!hips) {
    root.add(shell);
    return;
  }
  const hipsWorld = hips.getWorldPosition(new THREE.Vector3());
  const inverseRoot = root.matrixWorld.clone().invert();
  shell.position.copy(hipsWorld.applyMatrix4(inverseRoot)).multiplyScalar(-1);
  hips.add(shell);
}

type LoadedAvatar = {
  root: THREE.Object3D;
  vrm?: VRM;
  animations: THREE.AnimationClip[];
};

function loadAvatar(url: string) {
  const loader = new GLTFLoader();
  loader.crossOrigin = "anonymous";
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return new Promise<LoadedAvatar>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        resolve({
          root: vrm?.scene ?? gltf.scene,
          vrm,
          animations: gltf.animations
        });
      },
      undefined,
      reject
    );
  });
}

function loadTexture(url: string) {
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  return new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function setExpression(vrm: VRM, name: string, value: number) {
  if (vrm.expressionManager?.getExpression(name)) {
    vrm.expressionManager.setValue(name, THREE.MathUtils.clamp(value, 0, 1));
  }
}

function setGenericMorph(root: THREE.Object3D, names: string[], value: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    names.forEach((name) => {
      const index = mesh.morphTargetDictionary?.[name];
      if (index !== undefined && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
      }
    });
  });
}

function getGenericMorphNames(root: THREE.Object3D) {
  const names = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    Object.keys(mesh.morphTargetDictionary ?? {}).forEach((name) =>
      names.add(name)
    );
  });
  return names;
}

function applyFaceIdentityShape(
  mesh: THREE.Mesh,
  shape: FaceIdentityShape
) {
  const skinnedMesh = mesh as THREE.SkinnedMesh;
  if (!skinnedMesh.isSkinnedMesh || !skinnedMesh.skeleton) return;
  const geometry = mesh.geometry.clone();
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  const skinIndices = geometry.getAttribute("skinIndex");
  const skinWeights = geometry.getAttribute("skinWeight");
  const headIndex = skinnedMesh.skeleton.bones.findIndex((bone) =>
    /^head$/i.test(bone.name)
  );
  if (
    !positions ||
    !uvs ||
    !skinIndices ||
    !skinWeights ||
    headIndex < 0 ||
    positions.count !== uvs.count
  ) {
    return;
  }

  const faceVertices: Array<{ index: number; falloff: number }> = [];
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  for (let index = 0; index < uvs.count; index += 1) {
    const normalizedX = (uvs.getX(index) - 0.285) / 0.22;
    const normalizedY = ((1 - uvs.getY(index)) - 0.315) / 0.25;
    const radiusSquared =
      normalizedX * normalizedX + normalizedY * normalizedY;
    let headWeight = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      if (skinIndices.getComponent(index, channel) === headIndex) {
        headWeight += skinWeights.getComponent(index, channel);
      }
    }
    if (radiusSquared > 1.1 || headWeight < 0.5) continue;
    faceVertices.push({
      index,
      falloff:
        (1 - THREE.MathUtils.smoothstep(radiusSquared, 0.45, 1.1)) *
        headWeight
    });
    bounds.expandByPoint(vertex.fromBufferAttribute(positions, index));
  }
  if (faceVertices.length < 100 || bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
  faceVertices.forEach(({ index, falloff }) => {
    vertex.fromBufferAttribute(positions, index);
    const vertical = THREE.MathUtils.clamp(
      (vertex.y - bounds.min.y) / height,
      0,
      1
    );
    const jawBlend = 1 - THREE.MathUtils.smoothstep(vertical, 0.2, 0.72);
    const widthScale = THREE.MathUtils.lerp(
      shape.widthScale,
      shape.jawScale,
      jawBlend
    );
    const weightedWidthScale = THREE.MathUtils.lerp(
      1,
      widthScale,
      falloff
    );
    const weightedHeightScale = THREE.MathUtils.lerp(
      1,
      shape.heightScale,
      falloff
    );
    positions.setXYZ(
      index,
      center.x + (vertex.x - center.x) * weightedWidthScale,
      center.y + (vertex.y - center.y) * weightedHeightScale,
      vertex.z
    );
  });
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
}

export default function ImmersiveStage({
  sceneImage,
  actorName,
  performance,
  speaking,
  viewMode,
  avatarModelUrl,
  identityImageUrl,
  avatarSource,
  outfitId,
  onRenderState
}: ImmersiveStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const performanceRef = useRef(performance);
  const speakingRef = useRef(speaking);
  const viewModeRef = useRef(viewMode);
  const onRenderStateRef = useRef(onRenderState);
  const [renderState, setRenderState] = useState<AvatarRenderState>("loading");

  performanceRef.current = performance;
  speakingRef.current = speaking;
  viewModeRef.current = viewMode;
  onRenderStateRef.current = onRenderState;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let animationFrame = 0;
    let vrm: VRM | undefined;
    let avatarRoot: THREE.Object3D | undefined;
    let animationMixer: THREE.AnimationMixer | undefined;
    let backgroundTexture: THREE.Texture | undefined;
    const identityTextures: THREE.Texture[] = [];

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
    camera.position.set(0, 0.08, 4.15);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "immersive-canvas";
    renderer.domElement.setAttribute("aria-label", `${actorName} rigged 3D avatar`);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff3db, 0x26302f, 1.35));
    const keyLight = new THREE.DirectionalLight(0xfff1df, 2.05);
    keyLight.position.set(-2.2, 3.8, 4.2);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const faceFill = new THREE.DirectionalLight(0xf2f7ff, 1.15);
    faceFill.position.set(0.4, 1.8, 4.5);
    scene.add(faceFill);
    const rimLight = new THREE.DirectionalLight(0x83b8b4, 1.45);
    rimLight.position.set(3.4, 2.2, -2.8);
    scene.add(rimLight);

    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    const lookTarget = new THREE.Object3D();
    scene.add(lookTarget);
    const baseRotations = new Map<BoneName, THREE.Quaternion>();
    const genericBones = new Map<BoneName, THREE.Object3D>();
    const targetQuaternion = new THREE.Quaternion();
    const offsetQuaternion = new THREE.Quaternion();
    const articulationQuaternion = new THREE.Quaternion();
    const articulationEuler = new THREE.Euler();
    const parentWorldQuaternion = new THREE.Quaternion();
    const rotationAxis = new THREE.Vector3();

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointerTarget.y = -((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    const onPointerLeave = () => pointerTarget.set(0, 0);

    const rememberBone = (name: BoneName) => {
      const bone =
        vrm?.humanoid?.getNormalizedBoneNode(name) ??
        genericBoneNames[name]
          .map((candidate) => avatarRoot?.getObjectByName(candidate))
          .find(Boolean);
      if (bone) baseRotations.set(name, bone.quaternion.clone());
      if (bone) genericBones.set(name, bone);
    };

    const moveBone = (name: BoneName, rotation: [number, number, number], amount = 0.08) => {
      const bone = genericBones.get(name);
      const base = baseRotations.get(name);
      if (!bone || !base) return;
      if (!vrm && (name === "leftUpperArm" || name === "rightUpperArm")) {
        bone.parent?.getWorldQuaternion(parentWorldQuaternion);
        rotationAxis.set(0, 0, 1).applyQuaternion(parentWorldQuaternion.invert());
        const angle = name === "leftUpperArm" ? -Math.abs(rotation[2]) : Math.abs(rotation[2]);
        offsetQuaternion.setFromAxisAngle(rotationAxis, angle);
        targetQuaternion.copy(offsetQuaternion).multiply(base);
        articulationQuaternion.setFromEuler(articulationEuler.set(rotation[0], rotation[1], 0));
        targetQuaternion.multiply(articulationQuaternion);
      } else {
        offsetQuaternion.setFromEuler(new THREE.Euler(...rotation));
        targetQuaternion.copy(base).multiply(offsetQuaternion);
      }
      bone.quaternion.slerp(targetQuaternion, amount);
    };

    const applyArmPose = (
      pose: Pose,
      gesturePhase: number,
      gestureStrength: number,
      amount = 0.08
    ) => {
      moveBone("leftShoulder", [0, -0.025 + gesturePhase * 0.012, 0.025], amount);
      moveBone("rightShoulder", [0, 0.02 - gesturePhase * 0.012, -0.02], amount);
      moveBone(
        "leftUpperArm",
        [
          pose.leftArm[0] - gestureStrength * (0.1 + gesturePhase * 0.06),
          pose.leftArm[1] + gestureStrength * 0.08,
          pose.leftArm[2] - gestureStrength * 0.1
        ],
        amount
      );
      moveBone(
        "rightUpperArm",
        [
          pose.rightArm[0] - gestureStrength * (0.16 - gesturePhase * 0.09),
          pose.rightArm[1] - gestureStrength * 0.12,
          pose.rightArm[2] + gestureStrength * 0.16
        ],
        amount
      );
      moveBone(
        "leftLowerArm",
        [-0.08 - gestureStrength * 0.16, gestureStrength * 0.16, pose.leftArm[2] * 0.46],
        amount
      );
      moveBone(
        "rightLowerArm",
        [-0.12 - gestureStrength * 0.28, -gestureStrength * 0.2, pose.rightArm[2] * 0.52],
        amount
      );
      moveBone("leftHand", [0.02, -0.04 + gesturePhase * 0.025, 0.08], amount);
      moveBone("rightHand", [0.04, 0.06 - gesturePhase * 0.04, -0.1], amount);
    };

    setRenderState("loading");
    onRenderStateRef.current?.("loading");
    loadAvatar(avatarModelUrl)
      .then(async (loadedAvatar) => {
        if (disposed) {
          VRMUtils.deepDispose(loadedAvatar.root);
          return;
        }
        avatarRoot = loadedAvatar.root;
        vrm = loadedAvatar.vrm;
        if (vrm) {
          VRMUtils.removeUnnecessaryVertices(vrm.scene);
          VRMUtils.combineSkeletons(vrm.scene);
          VRMUtils.rotateVRM0(vrm);
        }

        avatarRoot.traverse((object) => {
          object.frustumCulled = false;
          if ("castShadow" in object) {
            const mesh = object as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.filter(Boolean).forEach((material) => {
              const toonMaterial = material as THREE.Material & {
                isMToonMaterial?: boolean;
                outlineWidthMode?: "none" | "worldCoordinates" | "screenCoordinates";
                outlineWidthFactor?: number;
                outlineColorFactor?: THREE.Color;
              };
              material.opacity = 1;
              if (material.transparent) {
                material.transparent = false;
                material.alphaTest = Math.max(material.alphaTest, 0.025);
                material.needsUpdate = true;
              }
              if (toonMaterial.isMToonMaterial) {
                toonMaterial.outlineWidthMode = "worldCoordinates";
                toonMaterial.outlineWidthFactor = Math.max(toonMaterial.outlineWidthFactor ?? 0, 0.002);
                toonMaterial.outlineColorFactor?.set(0x292b28);
                material.needsUpdate = true;
              }
            });
          }
        });

        if (identityImageUrl) {
          const textureJobs = new Map<
            THREE.Texture,
            Promise<FaceIdentityTexture>
          >();
          const materialJobs: Promise<void>[] = [];
          avatarRoot.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (
              !mesh.isMesh ||
              !mesh.material ||
              !mesh.morphTargetDictionary?.jawOpen
            ) {
              return;
            }
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            const personalized = materials.map((material) => {
              const sourceMaterial = material as THREE.Material & {
                map?: THREE.Texture | null;
              };
              if (!sourceMaterial.map) return material;
              const cloned = sourceMaterial.clone() as typeof sourceMaterial;
              let textureJob = textureJobs.get(sourceMaterial.map);
              if (!textureJob) {
                textureJob = bakeFaceIdentityTexture(
                  identityImageUrl,
                  sourceMaterial.map,
                  renderer.capabilities.getMaxAnisotropy()
                );
                textureJobs.set(sourceMaterial.map, textureJob);
              }
              materialJobs.push(
                textureJob.then((result) => {
                  cloned.map = result.texture;
                  cloned.needsUpdate = true;
                  applyFaceIdentityShape(mesh, result.shape);
                })
              );
              return cloned;
            });
            mesh.material = Array.isArray(mesh.material)
              ? personalized
              : personalized[0];
          });
          await Promise.all(materialJobs);
          const identityResults = await Promise.all(textureJobs.values());
          identityTextures.push(
            ...new Set(identityResults.map((result) => result.texture))
          );
        }

        const initialBounds = new THREE.Box3().setFromObject(avatarRoot);
        const height = Math.max(initialBounds.max.y - initialBounds.min.y, 0.1);
        const scale = 2.75 / height;
        avatarRoot.scale.setScalar(scale);
        avatarRoot.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(avatarRoot);
        const center = bounds.getCenter(new THREE.Vector3());
        avatarRoot.position.set(0.58 - center.x, -1.53 - bounds.min.y, -0.08 - center.z);
        if (
          avatarSource === "bundled" &&
          ["cabin", "teacher", "turtleneck"].includes(outfitId)
        ) {
          attachWardrobeShell(vrm, avatarRoot, outfitId, initialBounds);
        }
        scene.add(avatarRoot);
        if (!vrm && loadedAvatar.animations.length > 0) {
          animationMixer = new THREE.AnimationMixer(avatarRoot);
          animationMixer.clipAction(loadedAvatar.animations[0]).play();
        }
        const morphNames = getGenericMorphNames(avatarRoot);
        renderer.domElement.dataset.faceMorphs = [
          "eyeBlinkLeft",
          "eyeBlinkRight",
          "jawOpen",
          "mouthSmileLeft",
          "mouthSmileRight",
          "mouthFunnel"
        ]
          .filter((name) => morphNames.has(name))
          .join(",");

        loadTexture(sceneImage)
          .then((texture) => {
            if (disposed) {
              texture.dispose();
              return;
            }
            backgroundTexture = texture;
            backgroundTexture.colorSpace = THREE.SRGBColorSpace;
            scene.background = backgroundTexture;
          })
          .catch(() => undefined);

        (
          [
            "hips",
            "spine",
            "chest",
            "upperChest",
            "neck",
            "head",
            "leftShoulder",
            "leftUpperArm",
            "leftLowerArm",
            "leftHand",
            "rightShoulder",
            "rightUpperArm",
            "rightLowerArm",
            "rightHand"
          ] as BoneName[]
        ).forEach(rememberBone);

        const initialPose = poses[performanceRef.current];
        const initialGestureStrength =
          performanceRef.current === "explaining"
            ? 1
            : performanceRef.current === "inviting"
              ? 0.55
              : 0.22;
        applyArmPose(initialPose, 0, initialGestureStrength, 1);
        if (vrm?.lookAt) vrm.lookAt.target = lookTarget;

        if (!disposed) {
          setRenderState("ready");
          onRenderStateRef.current?.("ready");
        }
      })
      .catch((error) => {
        console.error("Avatar rendering failed:", error);
        if (!disposed) {
          setRenderState("error");
          onRenderStateRef.current?.("error");
        }
      });

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const thirdPerson = viewModeRef.current === "third";
      pointer.lerp(pointerTarget, reducedMotion ? 1 : 0.065);

      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        (thirdPerson ? -0.28 : 0.36) + pointer.x * 0.08,
        0.06
      );
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        (thirdPerson ? 0.1 : 0.54) + pointer.y * 0.045,
        0.06
      );
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, thirdPerson ? 5.15 : 2.35, 0.06);
      camera.lookAt(
        (thirdPerson ? 0.28 : 0.52) + pointer.x * 0.03,
        (thirdPerson ? 0.05 : 0.62) + pointer.y * 0.02,
        0
      );

      animationMixer?.update(delta);
      if (avatarRoot) {
        const pose = poses[performanceRef.current];
        const breath = reducedMotion ? 0 : Math.sin(elapsed * 1.55) * 0.018;
        const talk = speakingRef.current && !reducedMotion ? Math.sin(elapsed * 7.5) : 0;
        const nod = speakingRef.current && !reducedMotion ? Math.sin(elapsed * 3.15) * 0.035 : 0;
        const gesturePhase = reducedMotion ? 0 : Math.sin(elapsed * 1.35);
        const gestureStrength =
          performanceRef.current === "explaining"
            ? 1
            : performanceRef.current === "inviting"
              ? 0.55
              : 0.22;

        moveBone("hips", [0, pose.turn * 0.35, -pose.lean * 0.18]);
        moveBone("spine", [pose.lean + breath * 0.32, pose.turn, 0]);
        moveBone("chest", [pose.lean * 0.45 + breath, pose.turn * 0.55, 0]);
        moveBone("head", [nod, -pointer.x * 0.09, pose.headTilt + pointer.x * -0.025], 0.1);
        moveBone("neck", [nod * 0.4, -pointer.x * 0.04, pose.headTilt * 0.35], 0.1);
        applyArmPose(pose, gesturePhase, gestureStrength);

        const blinkPhase = elapsed % 4.7;
        const blink = reducedMotion || blinkPhase < 4.48
          ? 0
          : Math.sin(((blinkPhase - 4.48) / 0.22) * Math.PI);
        const smile =
          performanceRef.current === "encouraging"
            ? 0.78
            : performanceRef.current === "inviting"
              ? 0.42
              : 0.12;
        const mouth = speakingRef.current ? 0.18 + Math.abs(talk) * 0.62 : 0;
        renderer.domElement.dataset.blinkWeight = blink.toFixed(3);
        renderer.domElement.dataset.smileWeight = smile.toFixed(3);
        renderer.domElement.dataset.mouthWeight = mouth.toFixed(3);

        if (vrm) {
          setExpression(vrm, "blink", blink);
          setExpression(vrm, "happy", smile);
          setExpression(vrm, "relaxed", performanceRef.current === "listening" ? 0.28 : 0);
          setExpression(vrm, "surprised", performanceRef.current === "thinking" ? 0.16 : 0);
          setExpression(vrm, "aa", mouth);
          setExpression(vrm, "oh", speakingRef.current ? Math.max(0, talk) * 0.24 : 0);
        } else {
          setGenericMorph(avatarRoot, ["eyeBlinkLeft", "eyeBlinkRight"], blink);
          setGenericMorph(avatarRoot, ["mouthSmileLeft", "mouthSmileRight"], smile * 0.62);
          setGenericMorph(avatarRoot, ["jawOpen"], mouth * 0.72);
          setGenericMorph(avatarRoot, ["mouthFunnel"], speakingRef.current ? Math.max(0, talk) * 0.2 : 0);
        }
        lookTarget.position.set(pointer.x * 0.42, 0.22 + pointer.y * 0.22, 3.1);
        vrm?.update(delta);
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);
    resize();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      backgroundTexture?.dispose();
      identityTextures.forEach((texture) => texture.dispose());
      if (avatarRoot) VRMUtils.deepDispose(avatarRoot);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    actorName,
    avatarModelUrl,
    avatarSource,
    identityImageUrl,
    outfitId,
    sceneImage
  ]);

  return (
    <div ref={mountRef} className={`immersive-stage ${renderState}`}>
      <img className="stage-background-fallback" src={sceneImage} alt="" />
      {renderState === "loading" && (
        <span className="digital-human-loading" role="status">
          <span />
          Loading rigged avatar
        </span>
      )}
      <div className="avatar-runtime-badge" aria-live="polite">
        <span className={renderState} />
        {renderState === "ready" ? "3D · LIVE RIG" : renderState === "error" ? "2D FALLBACK" : "LOADING 3D"}
      </div>
    </div>
  );
}
