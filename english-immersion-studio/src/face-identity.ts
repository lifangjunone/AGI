import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { FACEMESH_TESSELATION } from "./face-mesh-triangulation";

type Point = { x: number; y: number };
type FaceImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type FaceIdentityShape = {
  widthScale: number;
  heightScale: number;
  jawScale: number;
};

export type FaceIdentityTexture = {
  texture: THREE.CanvasTexture;
  shape: FaceIdentityShape;
};

let faceLandmarkerPromise: Promise<FaceLandmarker> | undefined;
const sourceAnalysisCache = new Map<
  string,
  Promise<{
    image: HTMLImageElement;
    landmarks: NormalizedLandmark[];
  }>
>();

function assetUrl(path: string) {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;
}

async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    assetUrl("mediapipe/wasm")
  );
  const options = {
    baseOptions: {
      modelAssetPath: assetUrl("mediapipe/face_landmarker.task")
    },
    runningMode: "IMAGE" as const,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" }
    });
  } catch {
    return FaceLandmarker.createFromOptions(vision, options);
  }
}

function getFaceLandmarker() {
  faceLandmarkerPromise ??= createFaceLandmarker();
  return faceLandmarkerPromise;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取人脸图片。"));
    image.src = url;
  });
}

function imageDimensions(image: FaceImageSource) {
  if (image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    };
  }
  return { width: image.width, height: image.height };
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function detectLandmarks(
  landmarker: FaceLandmarker,
  image: FaceImageSource
) {
  const landmarks = landmarker.detect(image).faceLandmarks[0];
  if (!landmarks || landmarks.length < 468) {
    throw new Error("没有检测到清晰的正面人脸，请换用光线均匀的正脸照片。");
  }
  return landmarks;
}

function analyzeSourceImage(
  url: string,
  landmarker: FaceLandmarker
) {
  let analysis = sourceAnalysisCache.get(url);
  if (!analysis) {
    analysis = loadImage(url).then((image) => ({
      image,
      landmarks: detectLandmarks(landmarker, image)
    }));
    sourceAnalysisCache.set(url, analysis);
    analysis.catch(() => sourceAnalysisCache.delete(url));
  }
  return analysis;
}

function affineTransform(source: Point[], target: Point[]) {
  const [s0, s1, s2] = source;
  const [t0, t1, t2] = target;
  const denominator =
    s0.x * (s1.y - s2.y) +
    s1.x * (s2.y - s0.y) +
    s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 0.0001) return null;

  return {
    a:
      (t0.x * (s1.y - s2.y) +
        t1.x * (s2.y - s0.y) +
        t2.x * (s0.y - s1.y)) /
      denominator,
    b:
      (t0.y * (s1.y - s2.y) +
        t1.y * (s2.y - s0.y) +
        t2.y * (s0.y - s1.y)) /
      denominator,
    c:
      (t0.x * (s2.x - s1.x) +
        t1.x * (s0.x - s2.x) +
        t2.x * (s1.x - s0.x)) /
      denominator,
    d:
      (t0.y * (s2.x - s1.x) +
        t1.y * (s0.x - s2.x) +
        t2.y * (s1.x - s0.x)) /
      denominator,
    e:
      (t0.x * (s1.x * s2.y - s2.x * s1.y) +
        t1.x * (s2.x * s0.y - s0.x * s2.y) +
        t2.x * (s0.x * s1.y - s1.x * s0.y)) /
      denominator,
    f:
      (t0.y * (s1.x * s2.y - s2.x * s1.y) +
        t1.y * (s2.x * s0.y - s0.x * s2.y) +
        t2.y * (s0.x * s1.y - s1.x * s0.y)) /
      denominator
  };
}

function expandTriangle(points: Point[], amount: number) {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3
  };
  return points.map((point) => {
    const length = Math.hypot(point.x - center.x, point.y - center.y) || 1;
    return {
      x: point.x + ((point.x - center.x) / length) * amount,
      y: point.y + ((point.y - center.y) / length) * amount
    };
  });
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: FaceImageSource,
  source: Point[],
  target: Point[]
) {
  const transform = affineTransform(source, target);
  if (!transform) return;

  const clip = expandTriangle(target, 0.7);
  context.save();
  context.beginPath();
  context.moveTo(clip[0].x, clip[0].y);
  context.lineTo(clip[1].x, clip[1].y);
  context.lineTo(clip[2].x, clip[2].y);
  context.closePath();
  context.clip();
  context.setTransform(
    transform.a,
    transform.b,
    transform.c,
    transform.d,
    transform.e,
    transform.f
  );
  context.drawImage(image, 0, 0);
  context.restore();
}

function landmarkPoint(
  landmark: NormalizedLandmark,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0
) {
  return {
    x: offsetX + landmark.x * width,
    y: offsetY + landmark.y * height
  };
}

function distance(
  landmarks: NormalizedLandmark[],
  first: number,
  second: number
) {
  return Math.hypot(
    landmarks[first].x - landmarks[second].x,
    landmarks[first].y - landmarks[second].y
  );
}

function clampIdentityScale(value: number) {
  return THREE.MathUtils.clamp(value, 0.9, 1.1);
}

function measureIdentityShape(
  source: NormalizedLandmark[],
  target: NormalizedLandmark[]
): FaceIdentityShape {
  const sourceWidth = distance(source, 234, 454);
  const targetWidth = distance(target, 234, 454);
  const sourceHeight = distance(source, 10, 152);
  const targetHeight = distance(target, 10, 152);
  const sourceJaw = distance(source, 172, 397);
  const targetJaw = distance(target, 172, 397);
  const widthScale = clampIdentityScale(
    (sourceWidth / sourceHeight) / (targetWidth / targetHeight)
  );
  const jawScale = clampIdentityScale(
    widthScale * (sourceJaw / sourceWidth) / (targetJaw / targetWidth)
  );
  return {
    widthScale,
    heightScale: clampIdentityScale(1 / Math.sqrt(widthScale)),
    jawScale
  };
}

function sampleHairColor(
  sourceImage: HTMLImageElement,
  sourceLandmarks: NormalizedLandmark[]
) {
  const sourceSize = imageDimensions(sourceImage);
  const xs = sourceLandmarks.map((landmark) => landmark.x * sourceSize.width);
  const ys = sourceLandmarks.map((landmark) => landmark.y * sourceSize.height);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  const sample = createCanvas(sourceSize.width, sourceSize.height);
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前设备无法读取头发颜色。");
  context.drawImage(sourceImage, 0, 0);
  const x = Math.max(0, Math.round((minX + maxX) / 2 - faceWidth * 0.28));
  const y = Math.max(0, Math.round(minY - faceHeight * 0.42));
  const width = Math.min(
    sourceSize.width - x,
    Math.max(1, Math.round(faceWidth * 0.56))
  );
  const height = Math.min(
    sourceSize.height - y,
    Math.max(1, Math.round(faceHeight * 0.34))
  );
  const pixels = context.getImageData(x, y, width, height).data;
  const colors: Array<{ r: number; g: number; b: number; luminance: number }> = [];
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    colors.push({
      r,
      g,
      b,
      luminance: r * 0.2126 + g * 0.7152 + b * 0.0722
    });
  }
  colors.sort((first, second) => first.luminance - second.luminance);
  const selected = colors.slice(
    Math.floor(colors.length * 0.08),
    Math.max(1, Math.floor(colors.length * 0.52))
  );
  const total = selected.reduce(
    (sum, color) => ({
      r: sum.r + color.r,
      g: sum.g + color.g,
      b: sum.b + color.b
    }),
    { r: 0, g: 0, b: 0 }
  );
  return {
    r: total.r / selected.length,
    g: total.g / selected.length,
    b: total.b / selected.length
  };
}

function recolorHair(
  atlas: HTMLCanvasElement,
  hairColor: { r: number; g: number; b: number },
  targetLandmarks: NormalizedLandmark[],
  targetRect: { x: number; y: number; width: number; height: number }
) {
  const atlasContext = atlas.getContext("2d", { willReadFrequently: true });
  if (!atlasContext) throw new Error("当前设备无法创建头部纹理。");
  const targetXs = targetLandmarks.map(
    (landmark) => targetRect.x + landmark.x * targetRect.width
  );
  const targetYs = targetLandmarks.map(
    (landmark) => targetRect.y + landmark.y * targetRect.height
  );
  const targetMinX = Math.min(...targetXs);
  const targetMaxX = Math.max(...targetXs);
  const targetMinY = Math.min(...targetYs);
  const targetMaxY = Math.max(...targetYs);
  const targetCenterX = (targetMinX + targetMaxX) / 2;
  const targetCenterY = (targetMinY + targetMaxY) / 2;
  const targetFaceWidth = targetMaxX - targetMinX;
  const targetFaceHeight = targetMaxY - targetMinY;
  const image = atlasContext.getImageData(
    0,
    0,
    atlas.width,
    atlas.height
  );
  const sourceLuminance = Math.max(
    8,
    hairColor.r * 0.2126 + hairColor.g * 0.7152 + hairColor.b * 0.0722
  );
  const startX = Math.max(0, Math.floor(targetCenterX - targetFaceWidth));
  const endX = Math.min(
    atlas.width - 1,
    Math.ceil(targetCenterX + targetFaceWidth)
  );
  const startY = Math.max(
    0,
    Math.floor(targetCenterY - targetFaceHeight * 0.95)
  );
  const endY = Math.min(
    atlas.height - 1,
    Math.ceil(targetCenterY + targetFaceHeight * 0.42)
  );
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const headX = (x - targetCenterX) / (targetFaceWidth * 0.96);
      const headY =
        (y - (targetCenterY - targetFaceHeight * 0.1)) /
        (targetFaceHeight * 0.82);
      if (headX * headX + headY * headY > 1) continue;
      const aboveHairline = y < targetMinY + targetFaceHeight * 0.12;
      const sideHair =
        (x < targetMinX + targetFaceWidth * 0.1 ||
          x > targetMaxX - targetFaceWidth * 0.1) &&
        y < targetCenterY + targetFaceHeight * 0.08;
      if (!aboveHairline && !sideHair) continue;

      const offset = (y * atlas.width + x) * 4;
      const originalLuminance =
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722;
      const desiredLuminance = THREE.MathUtils.clamp(
        sourceLuminance * 0.72 + originalLuminance * 0.24,
        14,
        135
      );
      const scale = desiredLuminance / sourceLuminance;
      image.data[offset] = Math.min(255, hairColor.r * scale);
      image.data[offset + 1] = Math.min(255, hairColor.g * scale);
      image.data[offset + 2] = Math.min(255, hairColor.b * scale);
    }
  }
  atlasContext.putImageData(image, 0, 0);
}

function paintFace(
  atlas: HTMLCanvasElement,
  sourceImage: HTMLImageElement,
  sourceLandmarks: NormalizedLandmark[],
  targetLandmarks: NormalizedLandmark[],
  targetRect: { x: number; y: number; width: number; height: number }
) {
  const warped = createCanvas(atlas.width, atlas.height);
  const warpedContext = warped.getContext("2d");
  const mask = createCanvas(atlas.width, atlas.height);
  const maskContext = mask.getContext("2d");
  const atlasContext = atlas.getContext("2d");
  if (!warpedContext || !maskContext || !atlasContext) {
    throw new Error("当前设备无法创建人脸纹理。");
  }

  const sourceSize = imageDimensions(sourceImage);
  for (let index = 0; index < FACEMESH_TESSELATION.length; index += 3) {
    const ids = FACEMESH_TESSELATION.slice(index, index + 3);
    const source = ids.map((id) =>
      landmarkPoint(sourceLandmarks[id], sourceSize.width, sourceSize.height)
    );
    const target = ids.map((id) =>
      landmarkPoint(
        targetLandmarks[id],
        targetRect.width,
        targetRect.height,
        targetRect.x,
        targetRect.y
      )
    );
    drawTriangle(warpedContext, sourceImage, source, target);

    const expanded = expandTriangle(target, 1);
    maskContext.beginPath();
    maskContext.moveTo(expanded[0].x, expanded[0].y);
    maskContext.lineTo(expanded[1].x, expanded[1].y);
    maskContext.lineTo(expanded[2].x, expanded[2].y);
    maskContext.closePath();
    maskContext.fillStyle = "#fff";
    maskContext.fill();
  }

  warpedContext.globalCompositeOperation = "destination-in";
  warpedContext.filter = `blur(${Math.max(5, atlas.width * 0.006)}px)`;
  warpedContext.drawImage(mask, 0, 0);
  warpedContext.filter = "none";
  warpedContext.globalCompositeOperation = "source-over";
  atlasContext.drawImage(warped, 0, 0);
}

export async function bakeFaceIdentityTexture(
  sourceImageUrl: string,
  baseTexture: THREE.Texture,
  maxAnisotropy = 1
) {
  const baseImage = baseTexture.image as FaceImageSource | undefined;
  if (!baseImage) throw new Error("3D 模型缺少可编辑的人脸纹理。");

  const baseSize = imageDimensions(baseImage);
  const atlas = createCanvas(baseSize.width, baseSize.height);
  const atlasContext = atlas.getContext("2d", { willReadFrequently: true });
  if (!atlasContext) throw new Error("当前设备无法读取 3D 人脸纹理。");
  atlasContext.drawImage(baseImage, 0, 0, baseSize.width, baseSize.height);

  const landmarker = await getFaceLandmarker();
  const { image: sourceImage, landmarks: sourceLandmarks } =
    await analyzeSourceImage(sourceImageUrl, landmarker);

  const targetRect = {
    x: Math.round(baseSize.width * 0.075),
    y: Math.round(baseSize.height * 0.075),
    width: Math.round(baseSize.width * 0.42),
    height: Math.round(baseSize.height * 0.48)
  };
  const targetCrop = createCanvas(targetRect.width, targetRect.height);
  const targetContext = targetCrop.getContext("2d", { willReadFrequently: true });
  if (!targetContext) throw new Error("当前设备无法分析 3D 人脸纹理。");
  targetContext.drawImage(
    baseImage,
    targetRect.x,
    targetRect.y,
    targetRect.width,
    targetRect.height,
    0,
    0,
    targetRect.width,
    targetRect.height
  );
  const targetLandmarks = detectLandmarks(landmarker, targetCrop);

  const hairColor = sampleHairColor(sourceImage, sourceLandmarks);
  recolorHair(
    atlas,
    hairColor,
    targetLandmarks,
    targetRect
  );
  paintFace(
    atlas,
    sourceImage,
    sourceLandmarks,
    targetLandmarks,
    targetRect
  );

  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = maxAnisotropy;
  texture.wrapS = baseTexture.wrapS;
  texture.wrapT = baseTexture.wrapT;
  texture.magFilter = baseTexture.magFilter;
  texture.minFilter = baseTexture.minFilter;
  texture.generateMipmaps = baseTexture.generateMipmaps;
  texture.needsUpdate = true;
  return {
    texture,
    shape: measureIdentityShape(sourceLandmarks, targetLandmarks)
  } satisfies FaceIdentityTexture;
}
