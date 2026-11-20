"""Build display-sized WebP assets without modifying original references."""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1] / "src"
source = root / "design" / "assets"
target = root / "assets"
target.mkdir(exist_ok=True)
total = 0
for name in ("run", "galaxy", "oil", "idea", "workday", "mbti"):
    with Image.open(source / f"{name}.png") as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        for variant, width in (("thumb", 240), ("display", 480), ("detail", 800)):
            resized = image.resize(
                (width, round(image.height * width / image.width)),
                Image.Resampling.LANCZOS,
            )
            output = target / f"{name}-{variant}-v1.webp"
            resized.save(output, "WEBP", quality=82, method=6)
            print(output.name, output.stat().st_size)
            if variant == "thumb" or (variant == "display" and name in ("run", "galaxy", "oil")):
                total += output.stat().st_size
print("Homepage image bytes:", total)
