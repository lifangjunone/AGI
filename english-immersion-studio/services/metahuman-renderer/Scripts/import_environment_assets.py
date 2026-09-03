import json
import os
import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


PROJECT_ROOT = unreal.Paths.convert_relative_path_to_full(
    unreal.Paths.project_dir()
)
SOURCE_ROOT = os.environ.get(
    "EIS_ENVIRONMENT_ASSET_ROOT",
    os.path.join(PROJECT_ROOT, "ExternalAssets", "PolyHaven"),
)
LOCK_PATH = os.path.join(SOURCE_ROOT, "resolved-assets.json")
DESTINATION_ROOT = "/Game/EnglishImmersion/Environment/PolyHaven"
REQUESTED_ASSET = command_value("EISEnvironmentAsset", "")


def load_lock():
    if not os.path.isfile(LOCK_PATH):
        raise RuntimeError(
            "Environment asset lock is missing. Run npm run "
            f"environment:setup first: {LOCK_PATH}"
        )
    with open(LOCK_PATH, "r", encoding="utf-8") as handle:
        lock = json.load(handle)
    if (
        lock.get("version") != 1
        or lock.get("provider") != "Poly Haven"
        or lock.get("license") != "CC0-1.0"
        or not isinstance(lock.get("assets"), list)
    ):
        raise RuntimeError("Environment asset lock is invalid")
    return lock


def import_asset(asset):
    asset_id = asset["id"]
    source_path = os.path.join(SOURCE_ROOT, asset["entryFile"])
    if not os.path.isfile(source_path):
        raise RuntimeError(f"Environment source is missing: {source_path}")

    destination = f"{DESTINATION_ROOT}/{asset_id}"
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", source_path)
    task.set_editor_property("destination_path", destination)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", True)
    task.set_editor_property("replace_existing_settings", True)
    task.set_editor_property("save", True)

    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    imported_paths = list(task.get_editor_property("imported_object_paths"))
    if not imported_paths:
        raise RuntimeError(f"Unreal imported no objects for {asset_id}")

    unreal.EditorAssetLibrary.save_directory(
        destination,
        only_if_is_dirty=False,
        recursive=True,
    )
    unreal.log(
        "EIS_ENVIRONMENT_ASSET_IMPORTED "
        f"id={asset_id} objects={len(imported_paths)} "
        f"destination={destination}"
    )
    for imported_path in imported_paths:
        unreal.log(f"EIS_ENVIRONMENT_OBJECT path={imported_path}")


def main():
    lock = load_lock()
    assets = lock["assets"]
    if REQUESTED_ASSET:
        assets = [
            asset for asset in assets if asset.get("id") == REQUESTED_ASSET
        ]
        if not assets:
            raise RuntimeError(
                f"Requested environment asset is not pinned: {REQUESTED_ASSET}"
            )

    unreal.log(
        "EIS_ENVIRONMENT_IMPORT_BEGIN "
        f"count={len(assets)} source={SOURCE_ROOT}"
    )
    for asset in assets:
        import_asset(asset)
    unreal.log(f"EIS_ENVIRONMENT_IMPORT_COMPLETE count={len(assets)}")


if __name__ == "__main__":
    main()
