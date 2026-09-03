import unreal


WARDROBE_ROOTS = (
    "/MetaHumanCharacter/Optional/Clothing",
    "/MetaHumanCharacter/Optional/Outfits",
)


def main():
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    unreal.log("EIS_WARDROBE_INVENTORY_BEGIN")
    count = 0
    for root in WARDROBE_ROOTS:
        assets = registry.get_assets_by_path(
            unreal.Name(root),
            recursive=True,
            include_only_on_disk_assets=True,
        )
        for asset in sorted(assets, key=lambda item: str(item.package_name)):
            unreal.log(
                "EIS_WARDROBE_ASSET "
                f"path={asset.package_name} class={asset.asset_class_path.asset_name}"
            )
            count += 1
    unreal.log(f"EIS_WARDROBE_INVENTORY_COMPLETE count={count}")


if __name__ == "__main__":
    main()
