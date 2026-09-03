import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


CHARACTER_NAME = command_value("EISCharacterName", "")
HAIR_NAME = command_value("EISHair", "")
CHARACTER_PATH = (
    f"/Game/Characters/MetaHumans/{CHARACTER_NAME}.{CHARACTER_NAME}"
)
HAIR_PATH = (
    "/MetaHumanCharacter/Optional/Grooms/Bindings/Hair/"
    f"WI_{HAIR_NAME}.WI_{HAIR_NAME}"
)


def main():
    if not CHARACTER_NAME or not HAIR_NAME:
        raise RuntimeError("EISCharacterName and EISHair are required")

    unreal.log(
        "EIS_METAHUMAN_HAIR_UPDATE_BEGIN "
        f"character={CHARACTER_NAME} hair={HAIR_NAME}"
    )
    character = unreal.load_asset(CHARACTER_PATH)
    hair = unreal.load_asset(HAIR_PATH)
    if not character:
        raise RuntimeError(f"MetaHuman Character is missing: {CHARACTER_PATH}")
    if not hair:
        raise RuntimeError(f"MetaHuman hair wardrobe item is missing: {HAIR_PATH}")

    subsystem = unreal.get_editor_subsystem(
        unreal.MetaHumanCharacterEditorSubsystem
    )
    if not subsystem.try_add_object_to_edit(character):
        raise RuntimeError(f"Unable to open {CHARACTER_NAME} for editing")

    try:
        hair_key = character.internal_collection.try_add_item_from_wardrobe_item(
            "Hair", hair
        )
        character.internal_collection.default_instance.set_single_slot_selection(
            slot_name="Hair",
            item_key=hair_key,
        )
        subsystem.assemble_for_preview(character=character)
    finally:
        if subsystem.is_object_added_for_editing(character):
            subsystem.remove_object_to_edit(character)

    unreal.EditorAssetLibrary.save_loaded_asset(
        character,
        only_if_is_dirty=False,
    )
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(
        save_map_packages=False,
        save_content_packages=True,
    )
    unreal.log(
        "EIS_METAHUMAN_HAIR_UPDATE_COMPLETE "
        f"character={CHARACTER_NAME} hair={HAIR_NAME}"
    )


if __name__ == "__main__":
    main()
