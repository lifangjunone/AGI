import os
import sys

import unreal


SCRIPT_ROOT = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_ROOT not in sys.path:
    sys.path.insert(0, SCRIPT_ROOT)

import setup_interview_scene


MAP_PATH = "/Game/EnglishImmersion/Maps/EnglishImmersion"
MATERIAL_ROOT = "/Game/EnglishImmersion/Materials/Scenarios"
ASSET_ROOT = "/Game/EnglishImmersion/Environment/PolyHaven"
SCENE_IDS = (
    "interview",
    "restaurant",
    "hotel",
    "small-talk",
    "clinic",
    "airport",
)


def scene_tag(scene_id):
    return unreal.Name(f"Scene.{scene_id}")


def tag_scene_actor(actor, scene_id, label, extra_tags=None):
    tags = [scene_tag(scene_id)]
    if extra_tags:
        tags.extend(unreal.Name(tag) for tag in extra_tags)
    actor.set_actor_label(label)
    actor.set_editor_property("tags", tags)
    actor.set_actor_hidden_in_game(scene_id != "interview")
    actor.set_actor_enable_collision(False)


def create_material(name, color, roughness, metallic=0.0, emissive=None):
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
        raise RuntimeError(f"Unable to create material {asset_path}")

    color_node = unreal.MaterialEditingLibrary.create_material_expression(
        material,
        unreal.MaterialExpressionConstant3Vector,
        -320,
        -80,
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
        -320,
        40,
    )
    roughness_node.set_editor_property("r", roughness)
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness_node,
        "",
        unreal.MaterialProperty.MP_ROUGHNESS,
    )

    metallic_node = unreal.MaterialEditingLibrary.create_material_expression(
        material,
        unreal.MaterialExpressionConstant,
        -320,
        140,
    )
    metallic_node.set_editor_property("r", metallic)
    unreal.MaterialEditingLibrary.connect_material_property(
        metallic_node,
        "",
        unreal.MaterialProperty.MP_METALLIC,
    )

    if emissive:
        emissive_node = unreal.MaterialEditingLibrary.create_material_expression(
            material,
            unreal.MaterialExpressionConstant3Vector,
            -320,
            240,
        )
        emissive_node.set_editor_property("constant", emissive)
        unreal.MaterialEditingLibrary.connect_material_property(
            emissive_node,
            "",
            unreal.MaterialProperty.MP_EMISSIVE_COLOR,
        )

    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(
        material,
        only_if_is_dirty=False,
    )
    return material


def spawn_mesh(
    actor_subsystem,
    scene_id,
    mesh,
    label,
    location,
    rotation=None,
    scale=None,
    material=None,
    extra_tags=None,
):
    actor = actor_subsystem.spawn_actor_from_class(
        unreal.StaticMeshActor,
        location,
        rotation or unreal.Rotator(),
    )
    tag_scene_actor(actor, scene_id, label, extra_tags)
    actor.static_mesh_component.set_static_mesh(mesh)
    if material:
        actor.static_mesh_component.set_material(0, material)
    if scale:
        actor.set_actor_scale3d(scale)
    return actor


def load_polyhaven_meshes(asset_id):
    root = f"{ASSET_ROOT}/{asset_id}"
    meshes = []
    for asset_path in unreal.EditorAssetLibrary.list_assets(
        root,
        recursive=True,
        include_folder=False,
    ):
        asset = unreal.load_asset(asset_path)
        if isinstance(asset, unreal.StaticMesh):
            meshes.append(asset)
        elif (
            isinstance(asset, unreal.SkeletalMesh)
            and asset.get_name().lower() == f"{asset_id}_1k".lower()
        ):
            meshes.append(asset)
    if not meshes:
        raise RuntimeError(f"No imported mesh found under {root}")
    return sorted(meshes, key=lambda mesh: mesh.get_path_name())


def disable_nanite(mesh):
    try:
        subsystem = unreal.get_editor_subsystem(
            unreal.StaticMeshEditorSubsystem
        )
        settings = subsystem.get_nanite_settings(mesh)
        if settings.get_editor_property("enabled"):
            settings.set_editor_property("enabled", False)
            subsystem.set_nanite_settings(mesh, settings, True)
            unreal.EditorAssetLibrary.save_loaded_asset(
                mesh,
                only_if_is_dirty=False,
            )
    except Exception as error:
        unreal.log_warning(
            f"EIS_DISABLE_NANITE_FAILED mesh={mesh.get_path_name()} "
            f"error={error}"
        )


def spawn_polyhaven(
    actor_subsystem,
    scene_id,
    asset_id,
    label,
    location,
    rotation=None,
    scale=None,
):
    actors = []
    import_scale = scale or unreal.Vector(1.0, 1.0, 1.0)
    for index, mesh in enumerate(load_polyhaven_meshes(asset_id), start=1):
        if isinstance(mesh, unreal.StaticMesh):
            if asset_id == "chemistry_set":
                disable_nanite(mesh)
            actor = spawn_mesh(
                actor_subsystem,
                scene_id,
                mesh,
                f"{label}_{index:02d}",
                location,
                rotation,
                import_scale,
                extra_tags=[f"EnvironmentAsset.{asset_id}"],
            )
        else:
            actor = actor_subsystem.spawn_actor_from_class(
                unreal.SkeletalMeshActor,
                location,
                rotation or unreal.Rotator(),
            )
            tag_scene_actor(
                actor,
                scene_id,
                f"{label}_{index:02d}",
                [f"EnvironmentAsset.{asset_id}"],
            )
            component = actor.get_editor_property("skeletal_mesh_component")
            component.set_skeletal_mesh_asset(mesh)
            actor.set_actor_scale3d(import_scale)
        actors.append(actor)
    return actors


def spawn_room(
    actor_subsystem,
    scene_id,
    cube_mesh,
    floor_material,
    wall_material,
    accent_material,
):
    spawn_mesh(
        actor_subsystem,
        scene_id,
        cube_mesh,
        f"{scene_id}_Floor",
        unreal.Vector(0.0, 0.0, -7.0),
        scale=unreal.Vector(7.0, 7.0, 0.07),
        material=floor_material,
    )
    spawn_mesh(
        actor_subsystem,
        scene_id,
        cube_mesh,
        f"{scene_id}_BackWall",
        unreal.Vector(0.0, -215.0, 165.0),
        scale=unreal.Vector(6.8, 0.08, 3.3),
        material=wall_material,
    )
    for x in (-345.0, 345.0):
        spawn_mesh(
            actor_subsystem,
            scene_id,
            cube_mesh,
            f"{scene_id}_SideWall_{int(x)}",
            unreal.Vector(x, 20.0, 165.0),
            scale=unreal.Vector(0.08, 4.7, 3.3),
            material=wall_material,
        )
    for x in (-225.0, -75.0, 75.0, 225.0):
        spawn_mesh(
            actor_subsystem,
            scene_id,
            cube_mesh,
            f"{scene_id}_WallTrim_{int(x)}",
            unreal.Vector(x, -205.0, 165.0),
            scale=unreal.Vector(0.035, 0.04, 2.75),
            material=accent_material,
        )


def spawn_scene_light(
    actor_subsystem,
    scene_id,
    label,
    location,
    rotation,
    intensity,
    color,
):
    actor = actor_subsystem.spawn_actor_from_class(
        unreal.RectLight,
        location,
        rotation,
    )
    tag_scene_actor(actor, scene_id, label)
    component = actor.get_component_by_class(unreal.RectLightComponent)
    component.set_editor_property("intensity", intensity)
    component.set_editor_property("source_width", 180.0)
    component.set_editor_property("source_height", 120.0)
    component.set_editor_property("cast_shadows", True)
    component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    component.set_editor_property("light_color", color)


def destroy_actor_by_label(actor_subsystem, label):
    for actor in actor_subsystem.get_all_level_actors():
        if actor.get_actor_label() == label:
            actor_subsystem.destroy_actor(actor)


def build_interview(actor_subsystem):
    spawn_polyhaven(
        actor_subsystem,
        "interview",
        "metal_office_desk",
        "Interview_OfficeDesk",
        unreal.Vector(0.0, 92.0, 0.0),
        unreal.Rotator(yaw=180.0),
    )
    spawn_polyhaven(
        actor_subsystem,
        "interview",
        "modern_arm_chair_01",
        "Interview_GuestChair",
        unreal.Vector(-220.0, -105.0, 0.0),
        unreal.Rotator(yaw=35.0),
        unreal.Vector(0.85, 0.85, 0.85),
    )
    spawn_polyhaven(
        actor_subsystem,
        "interview",
        "office_notepads",
        "Interview_Notepads",
        unreal.Vector(-35.0, 58.0, 80.0),
        unreal.Rotator(yaw=8.0),
        unreal.Vector(0.62, 0.62, 0.62),
    )
    spawn_polyhaven(
        actor_subsystem,
        "interview",
        "desk_lamp_arm_01",
        "Interview_DeskLamp",
        unreal.Vector(145.0, 48.0, 78.0),
        unreal.Rotator(yaw=-120.0),
        unreal.Vector(0.65, 0.65, 0.65),
    )


def build_restaurant(actor_subsystem, cube_mesh):
    floor = create_material(
        "M_RestaurantFloor",
        unreal.LinearColor(0.055, 0.025, 0.018, 1.0),
        0.38,
    )
    wall = create_material(
        "M_RestaurantWall",
        unreal.LinearColor(0.13, 0.035, 0.028, 1.0),
        0.72,
    )
    accent = create_material(
        "M_RestaurantBrass",
        unreal.LinearColor(0.42, 0.20, 0.055, 1.0),
        0.28,
        metallic=0.78,
    )
    millwork = create_material(
        "M_RestaurantMillwork",
        unreal.LinearColor(0.035, 0.018, 0.012, 1.0),
        0.32,
    )
    spawn_room(actor_subsystem, "restaurant", cube_mesh, floor, wall, accent)
    for z in (105.0, 170.0, 235.0):
        spawn_mesh(
            actor_subsystem,
            "restaurant",
            cube_mesh,
            f"Restaurant_Backbar_{int(z)}",
            unreal.Vector(0.0, -198.0, z),
            scale=unreal.Vector(2.9, 0.04, 0.035),
            material=accent,
        )
    spawn_mesh(
        actor_subsystem,
        "restaurant",
        cube_mesh,
        "Restaurant_MenuPanel",
        unreal.Vector(150.0, -198.0, 168.0),
        scale=unreal.Vector(0.68, 0.035, 0.82),
        material=millwork,
    )
    spawn_mesh(
        actor_subsystem,
        "restaurant",
        cube_mesh,
        "Restaurant_ServiceConsole",
        unreal.Vector(-145.0, -176.0, 96.0),
        scale=unreal.Vector(1.02, 0.26, 0.08),
        material=millwork,
    )
    spawn_polyhaven(
        actor_subsystem,
        "restaurant",
        "dining_table",
        "Restaurant_Table",
        unreal.Vector(0.0, 112.0, 0.0),
        unreal.Rotator(yaw=180.0),
        unreal.Vector(0.82, 0.82, 0.82),
    )
    for x, yaw in ((-175.0, 72.0), (175.0, -72.0)):
        spawn_polyhaven(
            actor_subsystem,
            "restaurant",
            "dining_chair_02",
            f"Restaurant_Chair_{int(x)}",
            unreal.Vector(x, 55.0, 0.0),
            unreal.Rotator(yaw=yaw),
            unreal.Vector(0.92, 0.92, 0.92),
        )
    spawn_polyhaven(
        actor_subsystem,
        "restaurant",
        "tea_set_01",
        "Restaurant_Service",
        unreal.Vector(-145.0, -154.0, 108.0),
        unreal.Rotator(yaw=15.0),
        unreal.Vector(0.68, 0.68, 0.68),
    )
    for x in (-145.0, 145.0):
        spawn_polyhaven(
            actor_subsystem,
            "restaurant",
            "modern_ceiling_lamp_01",
            f"Restaurant_Pendant_{int(x)}",
            unreal.Vector(x, -95.0, 202.0),
            scale=unreal.Vector(0.82, 0.82, 0.82),
        )
    spawn_scene_light(
        actor_subsystem,
        "restaurant",
        "Restaurant_WarmLight",
        unreal.Vector(0.0, 105.0, 245.0),
        unreal.Rotator(pitch=-75.0),
        90.0,
        unreal.Color(255, 187, 120, 255),
    )


def build_hotel(actor_subsystem, cube_mesh):
    floor = create_material(
        "M_HotelFloor",
        unreal.LinearColor(0.11, 0.115, 0.105, 1.0),
        0.22,
    )
    wall = create_material(
        "M_HotelWall",
        unreal.LinearColor(0.12, 0.16, 0.13, 1.0),
        0.68,
    )
    accent = create_material(
        "M_HotelBrass",
        unreal.LinearColor(0.48, 0.31, 0.09, 1.0),
        0.24,
        metallic=0.82,
    )
    marble = create_material(
        "M_HotelCounter",
        unreal.LinearColor(0.24, 0.27, 0.24, 1.0),
        0.24,
    )
    spawn_room(actor_subsystem, "hotel", cube_mesh, floor, wall, accent)
    for x in (-175.0, 175.0):
        spawn_mesh(
            actor_subsystem,
            "hotel",
            cube_mesh,
            f"Hotel_StoneInset_{int(x)}",
            unreal.Vector(x, -198.0, 170.0),
            scale=unreal.Vector(0.68, 0.04, 1.3),
            material=marble,
        )
    spawn_mesh(
        actor_subsystem,
        "hotel",
        cube_mesh,
        "Hotel_ReceptionCounter",
        unreal.Vector(0.0, 104.0, 52.0),
        scale=unreal.Vector(2.45, 0.56, 0.50),
        material=marble,
    )
    spawn_polyhaven(
        actor_subsystem,
        "hotel",
        "modern_wooden_cabinet",
        "Hotel_Cabinet",
        unreal.Vector(0.0, -180.0, 0.0),
        unreal.Rotator(yaw=180.0),
    )
    spawn_polyhaven(
        actor_subsystem,
        "hotel",
        "modern_arm_chair_01",
        "Hotel_LoungeChair",
        unreal.Vector(-175.0, -92.0, 0.0),
        unreal.Rotator(yaw=35.0),
        unreal.Vector(0.82, 0.82, 0.82),
    )
    spawn_polyhaven(
        actor_subsystem,
        "hotel",
        "vintage_suitcase",
        "Hotel_Luggage",
        unreal.Vector(145.0, -152.0, 88.0),
        unreal.Rotator(yaw=-18.0),
        unreal.Vector(0.72, 0.72, 0.72),
    )
    spawn_polyhaven(
        actor_subsystem,
        "hotel",
        "potted_plant_01",
        "Hotel_Plant",
        unreal.Vector(-160.0, -158.0, 0.0),
        unreal.Rotator(),
        unreal.Vector(0.88, 0.88, 0.88),
    )
    spawn_scene_light(
        actor_subsystem,
        "hotel",
        "Hotel_WarmLight",
        unreal.Vector(175.0, 45.0, 245.0),
        unreal.Rotator(pitch=-62.0, yaw=-125.0),
        75.0,
        unreal.Color(255, 218, 162, 255),
    )


def build_small_talk(actor_subsystem, cube_mesh):
    floor = create_material(
        "M_CafeFloor",
        unreal.LinearColor(0.065, 0.07, 0.058, 1.0),
        0.58,
    )
    wall = create_material(
        "M_CafeWall",
        unreal.LinearColor(0.095, 0.13, 0.115, 1.0),
        0.78,
    )
    accent = create_material(
        "M_CafeAccent",
        unreal.LinearColor(0.42, 0.16, 0.08, 1.0),
        0.48,
    )
    spawn_room(actor_subsystem, "small-talk", cube_mesh, floor, wall, accent)
    for x in (-150.0, 150.0):
        spawn_mesh(
            actor_subsystem,
            "small-talk",
            cube_mesh,
            f"Cafe_WallArt_{int(x)}",
            unreal.Vector(x, -198.0, 185.0),
            scale=unreal.Vector(0.78, 0.04, 0.98),
            material=accent,
        )
    spawn_polyhaven(
        actor_subsystem,
        "small-talk",
        "sofa_02",
        "Cafe_Sofa",
        unreal.Vector(-155.0, -145.0, 0.0),
        unreal.Rotator(yaw=12.0),
        unreal.Vector(0.86, 0.86, 0.86),
    )
    spawn_polyhaven(
        actor_subsystem,
        "small-talk",
        "modern_coffee_table_01",
        "Cafe_Table",
        unreal.Vector(0.0, 112.0, 0.0),
        unreal.Rotator(yaw=180.0),
        unreal.Vector(0.88, 0.88, 0.88),
    )
    spawn_polyhaven(
        actor_subsystem,
        "small-talk",
        "potted_plant_02",
        "Cafe_Plant",
        unreal.Vector(165.0, -150.0, 0.0),
        scale=unreal.Vector(0.92, 0.92, 0.92),
    )
    spawn_polyhaven(
        actor_subsystem,
        "small-talk",
        "desk_lamp_arm_01",
        "Cafe_Lamp",
        unreal.Vector(-155.0, -132.0, 82.0),
        unreal.Rotator(yaw=115.0),
        unreal.Vector(0.76, 0.76, 0.76),
    )
    spawn_scene_light(
        actor_subsystem,
        "small-talk",
        "Cafe_SoftLight",
        unreal.Vector(-150.0, 30.0, 225.0),
        unreal.Rotator(pitch=-58.0, yaw=-55.0),
        65.0,
        unreal.Color(255, 205, 155, 255),
    )


def build_clinic(actor_subsystem, cube_mesh):
    floor = create_material(
        "M_ClinicFloor",
        unreal.LinearColor(0.09, 0.12, 0.12, 1.0),
        0.28,
    )
    wall = create_material(
        "M_ClinicWall",
        unreal.LinearColor(0.15, 0.20, 0.20, 1.0),
        0.72,
    )
    accent = create_material(
        "M_ClinicAccent",
        unreal.LinearColor(0.04, 0.30, 0.31, 1.0),
        0.54,
    )
    counter = create_material(
        "M_ClinicCounter",
        unreal.LinearColor(0.21, 0.24, 0.23, 1.0),
        0.42,
    )
    spawn_room(actor_subsystem, "clinic", cube_mesh, floor, wall, accent)
    spawn_mesh(
        actor_subsystem,
        "clinic",
        cube_mesh,
        "Clinic_CrossVertical",
        unreal.Vector(-145.0, -198.0, 184.0),
        scale=unreal.Vector(0.12, 0.04, 0.58),
        material=accent,
    )
    spawn_mesh(
        actor_subsystem,
        "clinic",
        cube_mesh,
        "Clinic_CrossHorizontal",
        unreal.Vector(-145.0, -197.0, 184.0),
        scale=unreal.Vector(0.42, 0.04, 0.13),
        material=accent,
    )
    spawn_mesh(
        actor_subsystem,
        "clinic",
        cube_mesh,
        "Clinic_Counter",
        unreal.Vector(-110.0, -165.0, 61.0),
        scale=unreal.Vector(1.72, 0.46, 0.61),
        material=counter,
    )
    spawn_polyhaven(
        actor_subsystem,
        "clinic",
        "vintage_day_bed",
        "Clinic_ExamBed",
        unreal.Vector(205.0, -100.0, 0.0),
        unreal.Rotator(yaw=90.0),
        unreal.Vector(0.82, 0.82, 0.82),
    )
    spawn_polyhaven(
        actor_subsystem,
        "clinic",
        "wheelchair_01",
        "Clinic_Wheelchair",
        unreal.Vector(-245.0, -85.0, 0.0),
        unreal.Rotator(yaw=24.0),
        unreal.Vector(0.82, 0.82, 0.82),
    )
    spawn_polyhaven(
        actor_subsystem,
        "clinic",
        "metal_stool_01",
        "Clinic_Stool",
        unreal.Vector(190.0, 55.0, 0.0),
        unreal.Rotator(yaw=-18.0),
        unreal.Vector(0.82, 0.82, 0.82),
    )
    spawn_polyhaven(
        actor_subsystem,
        "clinic",
        "medical_box",
        "Clinic_MedicalBox",
        unreal.Vector(-175.0, -150.0, 125.0),
        unreal.Rotator(yaw=8.0),
        unreal.Vector(0.88, 0.88, 0.88),
    )
    spawn_polyhaven(
        actor_subsystem,
        "clinic",
        "chemistry_set",
        "Clinic_Glassware",
        unreal.Vector(-92.0, -154.0, 125.0),
        unreal.Rotator(yaw=180.0),
        unreal.Vector(0.52, 0.52, 0.52),
    )
    spawn_scene_light(
        actor_subsystem,
        "clinic",
        "Clinic_CleanLight",
        unreal.Vector(0.0, 35.0, 255.0),
        unreal.Rotator(pitch=-78.0),
        58.0,
        unreal.Color(213, 241, 255, 255),
    )


def build_airport(actor_subsystem, cube_mesh):
    floor = create_material(
        "M_CabinFloor",
        unreal.LinearColor(0.045, 0.055, 0.065, 1.0),
        0.42,
    )
    wall = create_material(
        "M_CabinWall",
        unreal.LinearColor(0.12, 0.15, 0.18, 1.0),
        0.62,
    )
    accent = create_material(
        "M_CabinAccent",
        unreal.LinearColor(0.025, 0.09, 0.16, 1.0),
        0.36,
        metallic=0.18,
    )
    window = create_material(
        "M_CabinWindow",
        unreal.LinearColor(0.025, 0.12, 0.20, 1.0),
        0.1,
        metallic=0.1,
        emissive=unreal.LinearColor(0.03, 0.16, 0.28, 1.0),
    )
    light_strip = create_material(
        "M_CabinLightStrip",
        unreal.LinearColor(0.48, 0.58, 0.68, 1.0),
        0.22,
        emissive=unreal.LinearColor(0.20, 0.30, 0.42, 1.0),
    )
    spawn_room(actor_subsystem, "airport", cube_mesh, floor, wall, accent)
    for x in (-180.0, 180.0):
        spawn_mesh(
            actor_subsystem,
            "airport",
            cube_mesh,
            f"Cabin_OverheadBin_{int(x)}",
            unreal.Vector(x, -85.0, 245.0),
            scale=unreal.Vector(0.82, 1.45, 0.34),
            material=accent,
        )
    for x in (-150.0, 150.0):
        spawn_mesh(
            actor_subsystem,
            "airport",
            cube_mesh,
            f"Cabin_Window_{int(x)}",
            unreal.Vector(x, -205.0, 175.0),
            scale=unreal.Vector(0.46, 0.025, 0.66),
            material=window,
        )
        for suffix, offset, frame_scale in (
            ("Left", unreal.Vector(-52.0, 2.0, 0.0), unreal.Vector(0.055, 0.035, 0.76)),
            ("Right", unreal.Vector(52.0, 2.0, 0.0), unreal.Vector(0.055, 0.035, 0.76)),
            ("Top", unreal.Vector(0.0, 2.0, 72.0), unreal.Vector(0.57, 0.035, 0.055)),
            ("Bottom", unreal.Vector(0.0, 2.0, -72.0), unreal.Vector(0.57, 0.035, 0.055)),
        ):
            spawn_mesh(
                actor_subsystem,
                "airport",
                cube_mesh,
                f"Cabin_WindowFrame_{int(x)}_{suffix}",
                unreal.Vector(x, -205.0, 175.0) + offset,
                scale=frame_scale,
                material=accent,
            )
    spawn_mesh(
        actor_subsystem,
        "airport",
        cube_mesh,
        "Cabin_CeilingLight",
        unreal.Vector(0.0, -202.0, 270.0),
        scale=unreal.Vector(2.6, 0.03, 0.035),
        material=light_strip,
    )
    for x, y, yaw in (
        (-150.0, 55.0, 22.0),
        (150.0, 55.0, -22.0),
        (-180.0, -125.0, 18.0),
        (180.0, -125.0, -18.0),
    ):
        spawn_polyhaven(
            actor_subsystem,
            "airport",
            "modern_arm_chair_01",
            f"Cabin_Seat_{int(x)}_{int(y)}",
            unreal.Vector(x, y, 0.0),
            unreal.Rotator(yaw=yaw),
            unreal.Vector(0.72, 0.72, 0.72),
        )
    spawn_polyhaven(
        actor_subsystem,
        "airport",
        "CoffeeCart_01",
        "Cabin_ServiceCart",
        unreal.Vector(165.0, -155.0, 0.0),
        unreal.Rotator(yaw=-90.0),
        unreal.Vector(0.52, 0.52, 0.52),
    )
    spawn_polyhaven(
        actor_subsystem,
        "airport",
        "life_jacket",
        "Cabin_LifeJacket",
        unreal.Vector(-160.0, -180.0, 122.0),
        unreal.Rotator(pitch=90.0, yaw=90.0),
        unreal.Vector(0.62, 0.62, 0.62),
    )
    spawn_scene_light(
        actor_subsystem,
        "airport",
        "Cabin_CoolLight",
        unreal.Vector(0.0, 35.0, 270.0),
        unreal.Rotator(pitch=-82.0),
        62.0,
        unreal.Color(204, 226, 255, 255),
    )


def main():
    unreal.log("EIS_SCENARIOS_SETUP_BEGIN")
    setup_interview_scene.main()

    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    destroy_actor_by_label(actor_subsystem, "Interview_Desk")

    cube_mesh = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
    if not cube_mesh:
        raise RuntimeError("Engine cube mesh is missing")

    build_interview(actor_subsystem)
    build_restaurant(actor_subsystem, cube_mesh)
    build_hotel(actor_subsystem, cube_mesh)
    build_small_talk(actor_subsystem, cube_mesh)
    build_clinic(actor_subsystem, cube_mesh)
    build_airport(actor_subsystem, cube_mesh)

    if not level_subsystem.save_current_level():
        raise RuntimeError("Unable to save the six-scenario level")

    counts = {scene_id: 0 for scene_id in SCENE_IDS}
    for actor in actor_subsystem.get_all_level_actors():
        for scene_id in SCENE_IDS:
            if scene_tag(scene_id) in actor.get_editor_property("tags"):
                counts[scene_id] += 1
    unreal.log(
        "EIS_SCENARIOS_SETUP_COMPLETE "
        + " ".join(f"{key}={value}" for key, value in counts.items())
    )


if __name__ == "__main__":
    main()
