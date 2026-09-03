import re

import unreal


def command_value(name, default):
    pattern = rf"(?:^|\s)-{re.escape(name)}=(?:\"([^\"]+)\"|(\S+))"
    match = re.search(pattern, unreal.SystemLibrary.get_command_line())
    return (match.group(1) or match.group(2)) if match else default


REQUESTED_AVATAR_ID = command_value("EISAvatarId", "")
AVATAR_IDS = (
    [REQUESTED_AVATAR_ID]
    if REQUESTED_AVATAR_ID
    else ["sophia-tuya", "amara-aera", "vivian-voss"]
)
MAP_PATH = "/Game/EnglishImmersion/Maps/EnglishImmersion"


def has_actor_tag(actor, tag):
    return unreal.Name(tag) in actor.get_editor_property("tags")


def main():
    unreal.log("EIS_INTERVIEW_SCENE_VERIFY_BEGIN")
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    if not level_subsystem.load_level(MAP_PATH):
        raise RuntimeError(f"Unable to load level {MAP_PATH}")

    actors = actor_subsystem.get_all_level_actors()
    required_actor_tags = {
        "Camera.first": 0,
        "Camera.third": 0,
        "Outfit.studio-basic": 0,
        "Scene.interview": 0,
    }
    required_actor_tags.update(
        {f"Avatar.{avatar_id}": 0 for avatar_id in AVATAR_IDS}
    )
    required_component_tags = {
        "Hair.long-straight": 0,
        "Hair.long-straight-bangs": 0,
        "Hair.bob-straight": 0,
    }

    for actor in actors:
        for tag in required_actor_tags:
            if has_actor_tag(actor, tag):
                required_actor_tags[tag] += 1
        for component in actor.get_components_by_class(unreal.ActorComponent):
            component_tags = component.get_editor_property("component_tags")
            if any(
                has_actor_tag(actor, f"Avatar.{avatar_id}")
                for avatar_id in AVATAR_IDS
            ):
                unreal.log(
                    "EIS_AVATAR_COMPONENT "
                    f"name={component.get_name()} "
                    f"class={component.get_class().get_name()} "
                    f"tags={[str(tag) for tag in component_tags]}"
                )
            for tag in required_component_tags:
                if unreal.Name(tag) in component_tags:
                    required_component_tags[tag] += 1

    missing = [
        tag
        for tag, count in {
            **required_actor_tags,
            **required_component_tags,
        }.items()
        if count == 0
    ]
    if missing:
        raise RuntimeError(
            "Interview scene is missing runtime tags: " + ", ".join(missing)
        )

    camera_count = sum(
        isinstance(actor, unreal.CineCameraActor) for actor in actors
    )
    light_count = sum(
        isinstance(
            actor,
            (unreal.RectLight, unreal.PointLight, unreal.SkyLight),
        )
        for actor in actors
    )
    if camera_count < 2:
        raise RuntimeError("Interview scene requires two Cine Camera actors")
    if light_count < 3:
        raise RuntimeError("Interview scene requires at least three lights")

    for actor in actors:
        if not isinstance(actor, unreal.CineCameraActor):
            continue
        camera = actor.get_cine_camera_component()
        unreal.log(
            "EIS_CAMERA_CONFIG "
            f"label={actor.get_actor_label()} "
            f"location={actor.get_actor_location()} "
            f"rotation={actor.get_actor_rotation()} "
            f"focal_length={camera.get_editor_property('current_focal_length')}"
        )

    unreal.log(
        "EIS_INTERVIEW_SCENE_VERIFY_COMPLETE "
        f"actors={len(actors)} cameras={camera_count} lights={light_count}"
    )


if __name__ == "__main__":
    main()
