import unreal


_open_callback = None
_elapsed = 0.0


def _open_sophia(delta_seconds):
    global _open_callback, _elapsed
    _elapsed += delta_seconds
    if _elapsed < 4.0:
        return

    callback = _open_callback
    _open_callback = None
    unreal.unregister_slate_post_tick_callback(callback)

    character = unreal.load_asset(
        "/Game/Characters/MetaHumans/Sophia.Sophia"
    )
    if character:
        unreal.get_editor_subsystem(
            unreal.AssetEditorSubsystem
        ).open_editor_for_assets(assets=[character])
        unreal.log("EIS_METAHUMAN_ASSET_OPENED")
    else:
        unreal.log_error("EIS_META_HUMAN_ASSET_MISSING")


if "-EISOpenSophia" in unreal.SystemLibrary.get_command_line():
    _open_callback = unreal.register_slate_post_tick_callback(_open_sophia)
