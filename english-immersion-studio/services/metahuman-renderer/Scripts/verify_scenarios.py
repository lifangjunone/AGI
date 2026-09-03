import unreal


MAP_PATH = "/Game/EnglishImmersion/Maps/EnglishImmersion"
SCENE_REQUIREMENTS = {
    "interview": {
        "minimumActors": 12,
        "assets": {
            "metal_office_desk",
            "modern_arm_chair_01",
            "office_notepads",
            "desk_lamp_arm_01",
        },
    },
    "restaurant": {
        "minimumActors": 15,
        "assets": {
            "dining_chair_02",
            "dining_table",
            "modern_ceiling_lamp_01",
            "tea_set_01",
        },
    },
    "hotel": {
        "minimumActors": 12,
        "assets": {
            "modern_wooden_cabinet",
            "modern_arm_chair_01",
            "vintage_suitcase",
            "potted_plant_01",
        },
    },
    "small-talk": {
        "minimumActors": 12,
        "assets": {
            "sofa_02",
            "modern_coffee_table_01",
            "potted_plant_02",
            "desk_lamp_arm_01",
        },
    },
    "clinic": {
        "minimumActors": 20,
        "assets": {
            "wheelchair_01",
            "medical_box",
            "chemistry_set",
            "metal_stool_01",
            "vintage_day_bed",
        },
    },
    "airport": {
        "minimumActors": 18,
        "assets": {
            "modern_arm_chair_01",
            "life_jacket",
            "CoffeeCart_01",
        },
    },
}
AVATAR_IDS = ("sophia-tuya", "amara-aera", "vivian-voss")
HAIR_IDS = ("long-straight", "long-straight-bangs", "bob-straight")
REPRESENTATIVE_LABELS = {
    "Restaurant_Table_01",
    "Restaurant_Chair_-175_01",
    "Hotel_Cabinet_01",
    "Cafe_Sofa_01",
    "Clinic_Wheelchair_01",
    "Cabin_Seat_-205_35_01",
}


def tags_for(actor):
    return {str(tag) for tag in actor.get_editor_property("tags")}


def main():
    unreal.log("EIS_SCENARIOS_VERIFY_BEGIN")
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not level_subsystem.load_level(MAP_PATH):
        raise RuntimeError(f"Unable to load {MAP_PATH}")

    actors = actor_subsystem.get_all_level_actors()
    scene_counts = {scene_id: 0 for scene_id in SCENE_REQUIREMENTS}
    asset_scenes = {
        scene_id: set() for scene_id in SCENE_REQUIREMENTS
    }
    avatar_tags = set()
    component_tags = set()
    camera_tags = set()

    for actor in actors:
        tags = tags_for(actor)
        if actor.get_actor_label() in REPRESENTATIVE_LABELS:
            origin, extent = actor.get_actor_bounds(
                only_colliding_components=False,
                include_from_child_actors=True,
            )
            unreal.log(
                "EIS_SCENE_REPRESENTATIVE "
                f"label={actor.get_actor_label()} "
                f"location={actor.get_actor_location()} "
                f"scale={actor.get_actor_scale3d()} "
                f"origin={origin} extent={extent} "
                f"tags={sorted(tags)}"
            )
        for tag in tags:
            if tag.startswith("Scene."):
                scene_id = tag.removeprefix("Scene.")
                if scene_id in scene_counts:
                    scene_counts[scene_id] += 1
                    asset_scenes[scene_id].update(
                        candidate.removeprefix("EnvironmentAsset.")
                        for candidate in tags
                        if candidate.startswith("EnvironmentAsset.")
                    )
            elif tag.startswith("Avatar."):
                avatar_tags.add(tag.removeprefix("Avatar."))
            elif tag.startswith("Camera."):
                camera_tags.add(tag.removeprefix("Camera."))

        for component in actor.get_components_by_class(unreal.ActorComponent):
            component_tags.update(
                str(tag)
                for tag in component.get_editor_property("component_tags")
            )

    errors = []
    for scene_id, requirement in SCENE_REQUIREMENTS.items():
        if scene_counts[scene_id] < requirement["minimumActors"]:
            errors.append(
                f"{scene_id} has {scene_counts[scene_id]} actors, "
                f"expected at least {requirement['minimumActors']}"
            )
        missing_assets = requirement["assets"] - asset_scenes[scene_id]
        if missing_assets:
            errors.append(
                f"{scene_id} is missing assets: {sorted(missing_assets)}"
            )

    missing_avatars = set(AVATAR_IDS) - avatar_tags
    if missing_avatars:
        errors.append(f"Missing avatars: {sorted(missing_avatars)}")
    missing_hair = {
        hair_id
        for hair_id in HAIR_IDS
        if f"Hair.{hair_id}" not in component_tags
    }
    if missing_hair:
        errors.append(f"Missing hair tags: {sorted(missing_hair)}")
    if camera_tags != {"first", "third"}:
        errors.append(f"Expected first/third cameras, found {sorted(camera_tags)}")

    if errors:
        raise RuntimeError("; ".join(errors))

    unreal.log(
        "EIS_SCENARIOS_VERIFY_COMPLETE "
        + " ".join(
            f"{scene_id}={scene_counts[scene_id]}"
            for scene_id in SCENE_REQUIREMENTS
        )
        + f" total={len(actors)}"
    )


if __name__ == "__main__":
    main()
