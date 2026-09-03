export type AvatarSource = "bundled" | "synthetic" | "imported" | "generated";

export type AvatarAsset = {
  id: string;
  label: string;
  modelUrl: string;
  photoUrl?: string;
  stageImageUrl?: string;
  identityImageUrl?: string;
  source: AvatarSource;
};

export type AvatarGenerationStatus =
  | "idle"
  | "preparing"
  | "generating"
  | "ready"
  | "error";

export const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}models/real-casual.glb`;
export const MAX_AVATAR_FILE_BYTES = 20 * 1024 * 1024;

const outfitModelFiles: Record<string, string> = {
  executive: "real-executive.glb",
  doctor: "medical.glb",
  nurse: "real-nurse.glb",
  cabin: "real-uniform.glb",
  hanfu: "real-casual.glb",
  teacher: "real-executive.glb",
  academy: "real-casual.glb",
  turtleneck: "real-executive.glb",
  editorial: "real-casual.glb",
  anime: "real-casual.glb"
};

export function getBuiltInAvatarUrl(outfitId: string) {
  return `${import.meta.env.BASE_URL}models/${outfitModelFiles[outfitId] ?? "real-casual.glb"}`;
}

export function validateAvatarFile(file: Pick<File, "name" | "size" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isImage = file.type.startsWith("image/");
  const isModel = extension === "vrm" || extension === "glb";

  if (!isImage && !isModel) {
    return "请选择 JPG、PNG、WebP、VRM 或 GLB 文件。";
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    return "文件不能超过 20 MB。";
  }
  return null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.readAsDataURL(file);
  });
}

async function createPortraitTexture(file: File) {
  const source = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = source;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return source;

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight * 0.72);
  const sourceX = Math.max(0, (image.naturalWidth - cropSize) / 2);
  const sourceY = Math.min(
    Math.max(0, image.naturalHeight * 0.08),
    image.naturalHeight - cropSize
  );
  context.fillStyle = "#d8b7a2";
  context.fillRect(0, 0, 512, 512);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    512,
    512
  );
  context.globalCompositeOperation = "destination-in";
  const mask = context.createRadialGradient(256, 244, 150, 256, 244, 256);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(0.72, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = mask;
  context.fillRect(0, 0, 512, 512);
  return canvas.toDataURL("image/png");
}

export async function createAvatarFromPhoto(
  file: File,
  templateId = "academy"
): Promise<AvatarAsset> {
  const validationError = validateAvatarFile(file);
  if (validationError || !file.type.startsWith("image/")) {
    throw new Error(validationError ?? "请选择人物照片。");
  }

  const identityImageUrl = await readFileAsDataUrl(file);
  const photoUrl = await createPortraitTexture(file);

  return {
    id: `generated-${Date.now()}`,
    label: file.name.replace(/\.[^.]+$/, "") || "My avatar",
    modelUrl: getBuiltInAvatarUrl(templateId),
    photoUrl,
    identityImageUrl,
    source: "generated"
  };
}

export function createImportedAvatar(file: File): AvatarAsset {
  const validationError = validateAvatarFile(file);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (validationError || (extension !== "vrm" && extension !== "glb")) {
    throw new Error(validationError ?? "请选择 VRM 或 GLB 模型。");
  }
  return {
    id: `imported-${Date.now()}`,
    label: file.name.replace(/\.[^.]+$/, "") || "Imported avatar",
    modelUrl: URL.createObjectURL(file),
    source: "imported"
  };
}
