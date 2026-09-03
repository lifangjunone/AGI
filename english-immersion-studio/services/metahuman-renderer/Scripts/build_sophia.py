import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


CHARACTER_NAME = command_value("EISCharacterName", "SophiaAoi")
CHARACTER_PATH = (
    f"/Game/Characters/MetaHumans/{CHARACTER_NAME}.{CHARACTER_NAME}"
)


def save_progress(character, marker):
    unreal.EditorAssetLibrary.save_loaded_asset(
        character, only_if_is_dirty=False
    )
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(
        save_map_packages=True,
        save_content_packages=True,
    )
    unreal.log(marker)


def verify_runtime_assets():
    required_assets = [
        f"/Game/MetaHumans/{CHARACTER_NAME}/BP_{CHARACTER_NAME}",
        (
            f"/Game/MetaHumans/{CHARACTER_NAME}/Face/"
            f"SKM_{CHARACTER_NAME}_FaceMesh"
        ),
        (
            f"/Game/MetaHumans/{CHARACTER_NAME}/Body/"
            f"SKM_{CHARACTER_NAME}_BodyMesh"
        ),
    ]
    required_assets.extend(
        (
            f"/Game/MetaHumans/{CHARACTER_NAME}/Face/Textures/"
            f"T_Face_{texture_name}"
        )
        for texture_name in (
            "Basecolor_Animated_CM1",
            "Basecolor_Animated_CM2",
            "Basecolor_Animated_CM3",
            "Normal_Animated_WM1",
            "Normal_Animated_WM2",
            "Normal_Animated_WM3",
        )
    )
    missing = [
        asset
        for asset in required_assets
        if not unreal.EditorAssetLibrary.does_asset_exist(asset)
    ]
    if missing:
        raise RuntimeError(
            "Runtime assembly is incomplete: " + ", ".join(missing)
        )
    unreal.log(
        "EIS_METAHUMAN_RUNTIME_ASSETS_VERIFIED "
        f"character={CHARACTER_NAME} count={len(required_assets)}"
    )


def main():
    unreal.log("EIS_METAHUMAN_BUILD_BEGIN")
    character = unreal.load_asset(CHARACTER_PATH)
    if not character:
        raise RuntimeError(f"{CHARACTER_NAME} MetaHuman Character is missing")

    subsystem = unreal.get_editor_subsystem(
        unreal.MetaHumanCharacterEditorSubsystem
    )
    if not subsystem.try_add_object_to_edit(character):
        raise RuntimeError(f"Unable to open {CHARACTER_NAME} for building")

    try:
        command_line = unreal.SystemLibrary.get_command_line()
        if "-EISSkipTextures" not in command_line:
            unreal.log("EIS_METAHUMAN_TEXTURE_DOWNLOAD_BEGIN")
            texture_request = unreal.MetaHumanCharacterTextureRequestParams()
            texture_request.blocking = True
            texture_request.report_progress = False
            subsystem.request_texture_sources(character, texture_request)
            save_progress(
                character,
                "EIS_METAHUMAN_TEXTURE_DOWNLOAD_COMPLETE",
            )

        if "-EISSkipAutoRig" not in command_line:
            unreal.log("EIS_METAHUMAN_AUTORIG_BEGIN")
            rig_request = unreal.MetaHumanCharacterAutoRiggingRequestParams()
            rig_request.blocking = True
            rig_request.report_progress = False
            rig_request.rig_type = (
                unreal.MetaHumanRigType.JOINTS_AND_BLEND_SHAPES
            )
            subsystem.request_auto_rigging(character, rig_request)
            save_progress(character, "EIS_METAHUMAN_AUTORIG_COMPLETE")

        build_params = unreal.MetaHumanCharacterEditorBuildParameters()
        build_params.pipeline_type = unreal.MetaHumanDefaultPipelineType.OPTIMIZED
        build_params.pipeline_quality = unreal.MetaHumanQualityLevel.HIGH
        build_params.absolute_build_path = "/Game/MetaHumans"
        build_params.common_folder_path = "/Game/MetaHumans/Common"
        build_params.enable_wardrobe_item_validation = False

        unreal.log("EIS_METAHUMAN_ASSEMBLY_BEGIN")
        if not subsystem.can_build_meta_human(
            character=character, log_error=True
        ):
            raise RuntimeError(f"{CHARACTER_NAME} is not ready for assembly")
        subsystem.build_meta_human(character=character, params=build_params)
        verify_runtime_assets()
        unreal.log("EIS_METAHUMAN_ASSEMBLY_COMPLETE")
    finally:
        if subsystem.is_object_added_for_editing(character):
            subsystem.remove_object_to_edit(character)

    save_progress(character, "EIS_METAHUMAN_BUILD_COMPLETE")


if __name__ == "__main__":
    main()
