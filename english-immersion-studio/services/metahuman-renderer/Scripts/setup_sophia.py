import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


CHARACTER_NAME = command_value("EISCharacterName", "SophiaAoi")
PRESET_NAME = command_value("EISPreset", "Aoi")
HAIR_NAME = command_value("EISHair", "Hair_L_Straight")
CHARACTER_PATH = f"/Game/Characters/MetaHumans/{CHARACTER_NAME}"
PRESET_PATH = (
    f"/MetaHumanCharacter/Optional/Presets/{PRESET_NAME}.{PRESET_NAME}"
)
HAIR_PATH = (
    "/MetaHumanCharacter/Optional/Grooms/Bindings/Hair/"
    f"WI_{HAIR_NAME}.WI_{HAIR_NAME}"
)
OUTFIT_PATH = (
    "/MetaHumanCharacter/Optional/Clothing/"
    "WI_DefaultGarment.WI_DefaultGarment"
)


def load_or_create_character():
    preset = unreal.load_asset(PRESET_PATH)
    if not preset:
        raise RuntimeError(f"{PRESET_NAME} MetaHuman preset is missing")

    if unreal.EditorAssetLibrary.does_asset_exist(CHARACTER_PATH):
        if not unreal.EditorAssetLibrary.delete_asset(CHARACTER_PATH):
            raise RuntimeError(
                f"Unable to replace the existing {CHARACTER_NAME} asset"
            )

    character = unreal.EditorAssetLibrary.duplicate_asset(
        PRESET_PATH, CHARACTER_PATH
    )
    if not character:
        raise RuntimeError(
            f"Unable to duplicate {PRESET_NAME} as {CHARACTER_NAME}"
        )
    return character


def configure_makeup(character, subsystem):
    eye_makeup = unreal.MetaHumanCharacterEyeMakeupProperties()
    eye_makeup.type = unreal.MetaHumanCharacterEyeMakeupType.DRAMATIC_SMUDGE
    eye_makeup.opacity = 0.16
    eye_makeup.primary_color = unreal.LinearColor(0.035, 0.025, 0.02, 1.0)
    eye_makeup.secondary_color = unreal.LinearColor(0.12, 0.055, 0.04, 1.0)

    blush = unreal.MetaHumanCharacterBlushMakeupProperties()
    blush.type = unreal.MetaHumanCharacterBlushMakeupType.HIGH_CURVE
    blush.color = unreal.LinearColor(0.33, 0.08, 0.07, 1.0)
    blush.intensity = 0.12
    blush.roughness = 0.68

    lips = unreal.MetaHumanCharacterLipsMakeupProperties()
    lips.type = unreal.MetaHumanCharacterLipsMakeupType.HOLLYWOOD
    lips.color = unreal.LinearColor(0.26, 0.06, 0.055, 1.0)
    lips.opacity = 0.3
    lips.roughness = 0.58

    makeup = unreal.MetaHumanCharacterMakeupSettings()
    makeup.eyes = eye_makeup
    makeup.blush = blush
    makeup.lips = lips
    subsystem.commit_makeup_settings(character, makeup)


def configure_body(character, subsystem):
    constraints = subsystem.get_body_constraints(
        character, scale_measurement_ranges_with_height=False
    )
    for constraint in constraints:
        name = str(constraint.name).lower().replace(" ", "_")
        if name == "height":
            constraint.is_active = True
            constraint.target_measurement = 170.0
    subsystem.set_body_constraints(character, constraints)
    subsystem.commit_body_state(character)


def configure_wardrobe(character, subsystem):
    hair = unreal.load_asset(HAIR_PATH)
    outfit = unreal.load_asset(OUTFIT_PATH)
    if not hair or not outfit:
        raise RuntimeError("Required MetaHuman groom or clothing asset is missing")

    hair_key = character.internal_collection.try_add_item_from_wardrobe_item(
        "Hair", hair
    )
    outfit_key = character.internal_collection.try_add_item_from_wardrobe_item(
        "Outfits", outfit
    )

    character.internal_collection.default_instance.set_single_slot_selection(
        slot_name="Hair", item_key=hair_key
    )
    character.internal_collection.default_instance.set_single_slot_selection(
        slot_name="Outfits", item_key=outfit_key
    )
    for facial_hair_slot in ("Beard", "Mustache"):
        character.internal_collection.default_instance.set_single_slot_selection(
            slot_name=facial_hair_slot,
            item_key=unreal.MetaHumanPaletteItemKey(),
        )

    subsystem.assemble_for_preview(character=character)

    hair_path = unreal.MetaHumanPaletteItemPath(item_key=hair_key)
    for parameter in character.internal_collection.default_instance.get_instance_parameters(
        item_path=hair_path
    ):
        if parameter.name == "Melanin":
            parameter.set_float(value=0.82)


def configure_viewport(character):
    viewport = unreal.MetaHumanCharacterViewportSettings()
    viewport.always_use_hair_cards = True
    viewport.camera_frame = unreal.MetaHumanCharacterCameraFrame.FACE
    viewport.character_environment = unreal.MetaHumanCharacterEnvironment.STUDIO
    viewport.level_of_detail = unreal.MetaHumanCharacterLOD.LOD1
    viewport.rendering_quality = unreal.MetaHumanCharacterRenderingQuality.HIGH
    viewport.light_rotation = 24.0
    viewport.tonemapper_enabled = True
    character.viewport_settings = viewport


def main():
    unreal.log("EIS_METAHUMAN_SETUP_BEGIN")
    character = load_or_create_character()
    if not character:
        raise RuntimeError("Unable to create Sophia MetaHuman Character")

    subsystem = unreal.get_editor_subsystem(
        unreal.MetaHumanCharacterEditorSubsystem
    )
    if not subsystem.try_add_object_to_edit(character):
        raise RuntimeError(f"Unable to open {CHARACTER_NAME} for editing")

    try:
        configure_makeup(character, subsystem)
        configure_body(character, subsystem)
        configure_wardrobe(character, subsystem)
        configure_viewport(character)
    finally:
        if subsystem.is_object_added_for_editing(character):
            subsystem.remove_object_to_edit(character)

    unreal.EditorAssetLibrary.save_loaded_asset(character, only_if_is_dirty=False)
    unreal.log("EIS_METAHUMAN_SETUP_COMPLETE")


if __name__ == "__main__":
    main()
