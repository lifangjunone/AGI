export type FaceStyleId = "k-stage" | "j-fashion" | "executive";

export type SyntheticFace = {
  id: string;
  name: string;
  style: FaceStyleId;
  imageUrl: string;
};

export const faceStyles: Array<{
  id: FaceStyleId;
  label: string;
  shortLabel: string;
}> = [
  { id: "k-stage", label: "韩国舞台妆", shortLabel: "K-STAGE" },
  { id: "j-fashion", label: "日本成人时尚", shortLabel: "J-FASHION" },
  { id: "executive", label: "成熟职业", shortLabel: "EXECUTIVE" }
];

const styleNames: Record<FaceStyleId, string> = {
  "k-stage": "Seoul",
  "j-fashion": "Tokyo",
  executive: "Atelier"
};

export const syntheticFaces: SyntheticFace[] = faceStyles.flatMap((style) =>
  Array.from({ length: 10 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `${style.id}-${number}`,
      name: `${styleNames[style.id]} ${number}`,
      style: style.id,
      imageUrl: `${import.meta.env.BASE_URL}faces/${style.id}-${number}.jpg`
    };
  })
);

export function facesForStyle(style: FaceStyleId) {
  return syntheticFaces.filter((face) => face.style === style);
}
