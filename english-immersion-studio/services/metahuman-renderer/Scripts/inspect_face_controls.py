import unreal


FACE_MESH_PATH = "/Game/MetaHumans/Sophia/Face/SKM_Sophia_FaceMesh"


def main():
    mesh = unreal.load_asset(FACE_MESH_PATH)
    if not mesh:
        raise RuntimeError("Sophia face mesh is missing")

    morph_targets = mesh.get_editor_property("morph_targets")
    unreal.log(f"EIS_FACE_MORPH_COUNT={len(morph_targets)}")
    for morph_target in morph_targets:
        unreal.log(f"EIS_FACE_MORPH={morph_target.get_name()}")


if __name__ == "__main__":
    main()
