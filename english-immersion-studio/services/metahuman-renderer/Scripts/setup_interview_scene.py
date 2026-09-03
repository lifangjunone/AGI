import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


MAP_PATH = "/Game/EnglishImmersion/Maps/EnglishImmersion"
MATERIAL_ROOT = "/Game/EnglishImmersion/Materials"
REQUESTED_CHARACTER = command_value("EISCharacterName", "")
REQUESTED_AVATAR_ID = command_value("EISAvatarId", "")
DEFAULT_AVATARS = [
    ("SophiaTuya", "sophia-tuya", "long-straight"),
    ("Sophia", "amara-aera", "long-straight-bangs"),
    ("Vivian", "vivian-voss", "bob-straight"),
]
AVATARS = (
    [
        (
            REQUESTED_CHARACTER,
            REQUESTED_AVATAR_ID or REQUESTED_CHARACTER.lower(),
            command_value("EISHairId", "long-straight"),
        )
    ]
    if REQUESTED_CHARACTER
    else DEFAULT_AVATARS
)


def set_actor_identity(actor, label, tag):
    actor.set_actor_label(label)
    actor.set_editor_property("tags", [unreal.Name(tag)])


def configure_camera(
    actor,
    label,
    tag,
    location,
    rotation,
    focal_length,
    focus_distance,
):
    set_actor_identity(actor, label, tag)
    actor.set_actor_location(location, sweep=False, teleport=True)
    actor.set_actor_rotation(rotation, teleport_physics=True)
    camera = actor.get_cine_camera_component()
    camera.set_editor_property("current_focal_length", focal_length)
    camera.set_editor_property("current_aperture", 8.0)
    focus = unreal.CameraFocusSettings()
    focus.set_editor_property(
        "focus_method", unreal.CameraFocusMethod.MANUAL
    )
    focus.set_editor_property("manual_focus_distance", focus_distance)
    camera.set_editor_property("focus_settings", focus)


def configure_light(actor, label, location, rotation, intensity):
    actor.set_actor_label(label)
    actor.set_actor_location(location, sweep=False, teleport=True)
    actor.set_actor_rotation(rotation, teleport_physics=True)
    component = actor.get_component_by_class(unreal.LightComponent)
    component.set_editor_property("intensity", intensity)
    component.set_editor_property("cast_shadows", True)
    component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)


def create_color_material(name, color, roughness):
    asset_path = f"{MATERIAL_ROOT}/{name}"
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        unreal.EditorAssetLibrary.delete_asset(asset_path)

    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name,
        MATERIAL_ROOT,
        unreal.Material,
        unreal.MaterialFactoryNew(),
    )
    if not material:
        raise RuntimeError(f"Unable to create material {name}")

    color_node = unreal.MaterialEditingLibrary.create_material_expression(
        material,
        unreal.MaterialExpressionConstant3Vector,
        -280,
        -40,
    )
    color_node.set_editor_property("constant", color)
    unreal.MaterialEditingLibrary.connect_material_property(
        color_node,
        "",
        unreal.MaterialProperty.MP_BASE_COLOR,
    )

    roughness_node = unreal.MaterialEditingLibrary.create_material_expression(
        material,
        unreal.MaterialExpressionConstant,
        -280,
        90,
    )
    roughness_node.set_editor_property("r", roughness)
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness_node,
        "",
        unreal.MaterialProperty.MP_ROUGHNESS,
    )
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    return material


def spawn_set_piece(
    actor_subsystem,
    mesh,
    material,
    label,
    location,
    scale,
):
    actor = actor_subsystem.spawn_actor_from_class(
        unreal.StaticMeshActor,
        location,
    )
    set_actor_identity(actor, label, "Scene.interview")
    actor.set_actor_scale3d(scale)
    actor.static_mesh_component.set_static_mesh(mesh)
    actor.static_mesh_component.set_material(0, material)
    return actor


def configure_post_process(actor_subsystem):
    volume = actor_subsystem.spawn_actor_from_class(
        unreal.PostProcessVolume,
        unreal.Vector(),
    )
    volume.set_actor_label("Interview_Color")
    volume.set_editor_property("unbound", True)
    settings = volume.get_editor_property("settings")
    settings.set_editor_property(
        "override_auto_exposure_min_brightness", True
    )
    settings.set_editor_property(
        "override_auto_exposure_max_brightness", True
    )
    settings.set_editor_property("auto_exposure_min_brightness", 4.0)
    settings.set_editor_property("auto_exposure_max_brightness", 4.0)
    settings.set_editor_property("override_auto_exposure_bias", True)
    settings.set_editor_property("auto_exposure_bias", -0.35)
    settings.set_editor_property("override_bloom_intensity", True)
    settings.set_editor_property("bloom_intensity", 0.15)
    volume.set_editor_property("settings", settings)


def tag_avatar_components(actor, hair_id):
    for component in actor.get_components_by_class(unreal.ActorComponent):
        component_name = component.get_name().lower()
        tags = list(component.get_editor_property("component_tags"))
        if isinstance(component, unreal.GroomComponent) and "hair" in component_name:
            tags.append(unreal.Name(f"Hair.{hair_id}"))
        if (
            "outfit" in component_name
            or "garment" in component_name
            or component_name == "skeletalmesh"
        ):
            tags.append(unreal.Name("Outfit.studio-basic"))
        if tags:
            component.set_editor_property("component_tags", list(dict.fromkeys(tags)))


def main():
    unreal.log("EIS_INTERVIEW_SCENE_SETUP_BEGIN")
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    if unreal.EditorAssetLibrary.does_asset_exist(MAP_PATH):
        if not level_subsystem.load_level(MAP_PATH):
            raise RuntimeError(f"Unable to load level {MAP_PATH}")
        for actor in actor_subsystem.get_all_level_actors():
            actor_subsystem.destroy_actor(actor)
    elif not level_subsystem.new_level(MAP_PATH):
        raise RuntimeError(f"Unable to create level {MAP_PATH}")

    for index, (character_name, avatar_id, hair_id) in enumerate(AVATARS):
        blueprint_path = (
            f"/Game/MetaHumans/{character_name}/BP_{character_name}"
        )
        character_class = unreal.EditorAssetLibrary.load_blueprint_class(
            blueprint_path
        )
        if not character_class:
            raise RuntimeError(f"Optimized {blueprint_path} is missing")

        character = actor_subsystem.spawn_actor_from_class(
            character_class,
            unreal.Vector(0.0, 0.0, 0.0),
            unreal.Rotator(0.0, 0.0, 0.0),
        )
        set_actor_identity(
            character,
            character_name,
            f"Avatar.{avatar_id}",
        )
        character.set_editor_property(
            "tags",
            [
                unreal.Name(f"Avatar.{avatar_id}"),
                unreal.Name("Outfit.studio-basic"),
            ],
        )
        character.set_actor_hidden_in_game(index != 0)
        character.set_actor_enable_collision(index == 0)
        tag_avatar_components(character, hair_id)

    first_camera = actor_subsystem.spawn_actor_from_class(
        unreal.CineCameraActor,
        unreal.Vector(),
    )
    configure_camera(
        first_camera,
        "Camera_First",
        "Camera.first",
        unreal.Vector(0.0, 370.0, 152.0),
        unreal.Rotator(pitch=0.0, yaw=-90.0, roll=0.0),
        50.0,
        370.0,
    )
    first_camera.set_editor_property(
        "auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0
    )

    third_camera = actor_subsystem.spawn_actor_from_class(
        unreal.CineCameraActor,
        unreal.Vector(),
    )
    configure_camera(
        third_camera,
        "Camera_Third",
        "Camera.third",
        unreal.Vector(165.0, 500.0, 142.0),
        unreal.Rotator(pitch=0.0, yaw=-108.0, roll=0.0),
        40.0,
        526.0,
    )

    key_light = actor_subsystem.spawn_actor_from_class(
        unreal.RectLight,
        unreal.Vector(),
    )
    configure_light(
        key_light,
        "Key_Light",
        unreal.Vector(150.0, 170.0, 230.0),
        unreal.Rotator(pitch=-25.0, yaw=-135.0, roll=0.0),
        180.0,
    )
    key_component = key_light.get_component_by_class(
        unreal.RectLightComponent
    )
    key_component.set_editor_property("source_width", 160.0)
    key_component.set_editor_property("source_height", 120.0)
    key_component.set_editor_property(
        "light_color", unreal.Color(255, 232, 214, 255)
    )

    fill_light = actor_subsystem.spawn_actor_from_class(
        unreal.RectLight,
        unreal.Vector(),
    )
    configure_light(
        fill_light,
        "Fill_Light",
        unreal.Vector(-150.0, 140.0, 190.0),
        unreal.Rotator(pitch=-15.0, yaw=-45.0, roll=0.0),
        60.0,
    )
    fill_component = fill_light.get_component_by_class(
        unreal.RectLightComponent
    )
    fill_component.set_editor_property("source_width", 130.0)
    fill_component.set_editor_property("source_height", 100.0)
    fill_component.set_editor_property(
        "light_color", unreal.Color(210, 228, 255, 255)
    )

    rim_light = actor_subsystem.spawn_actor_from_class(
        unreal.PointLight,
        unreal.Vector(-80.0, -100.0, 210.0),
    )
    rim_light.set_actor_label("Rim_Light")
    rim_component = rim_light.get_component_by_class(
        unreal.PointLightComponent
    )
    rim_component.set_editor_property("intensity", 30.0)
    rim_component.set_editor_property("attenuation_radius", 500.0)
    rim_component.set_editor_property(
        "mobility", unreal.ComponentMobility.MOVABLE
    )

    sky_light = actor_subsystem.spawn_actor_from_class(
        unreal.SkyLight,
        unreal.Vector(0.0, 0.0, 200.0),
    )
    sky_light.set_actor_label("Studio_Sky")
    sky_component = sky_light.get_component_by_class(
        unreal.SkyLightComponent
    )
    sky_component.set_editor_property(
        "mobility", unreal.ComponentMobility.MOVABLE
    )
    sky_component.set_intensity(0.35)
    configure_post_process(actor_subsystem)

    cube_mesh = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
    if not cube_mesh:
        raise RuntimeError("Engine cube mesh is missing")

    wall_material = create_color_material(
        "M_InterviewWall",
        unreal.LinearColor(0.055, 0.065, 0.062, 1.0),
        0.78,
    )
    wood_material = create_color_material(
        "M_InterviewWood",
        unreal.LinearColor(0.16, 0.075, 0.038, 1.0),
        0.52,
    )
    floor_material = create_color_material(
        "M_InterviewFloor",
        unreal.LinearColor(0.035, 0.04, 0.038, 1.0),
        0.42,
    )
    accent_material = create_color_material(
        "M_InterviewAccent",
        unreal.LinearColor(0.12, 0.24, 0.21, 1.0),
        0.64,
    )

    spawn_set_piece(
        actor_subsystem,
        cube_mesh,
        floor_material,
        "Interview_Floor",
        unreal.Vector(0.0, 0.0, -8.0),
        unreal.Vector(7.0, 7.0, 0.08),
    )
    spawn_set_piece(
        actor_subsystem,
        cube_mesh,
        wall_material,
        "Interview_Backdrop",
        unreal.Vector(0.0, -180.0, 165.0),
        unreal.Vector(6.2, 0.12, 3.3),
    )
    spawn_set_piece(
        actor_subsystem,
        cube_mesh,
        wall_material,
        "Interview_Wall_Left",
        unreal.Vector(-360.0, 40.0, 165.0),
        unreal.Vector(0.12, 4.4, 3.3),
    )
    spawn_set_piece(
        actor_subsystem,
        cube_mesh,
        wall_material,
        "Interview_Wall_Right",
        unreal.Vector(360.0, 40.0, 165.0),
        unreal.Vector(0.12, 4.4, 3.3),
    )
    spawn_set_piece(
        actor_subsystem,
        cube_mesh,
        wood_material,
        "Interview_Desk",
        unreal.Vector(0.0, 95.0, 56.0),
        unreal.Vector(2.4, 0.72, 0.12),
    )
    for index, x in enumerate((-220.0, -110.0, 0.0, 110.0, 220.0)):
        spawn_set_piece(
            actor_subsystem,
            cube_mesh,
            accent_material if index == 2 else wood_material,
            f"Interview_Wall_Panel_{index + 1}",
            unreal.Vector(x, -167.0, 165.0),
            unreal.Vector(0.9, 0.08, 2.7),
        )

    if not level_subsystem.save_current_level():
        raise RuntimeError("Unable to save the interview level")

    unreal.log("EIS_INTERVIEW_SCENE_SETUP_COMPLETE")


if __name__ == "__main__":
    main()
