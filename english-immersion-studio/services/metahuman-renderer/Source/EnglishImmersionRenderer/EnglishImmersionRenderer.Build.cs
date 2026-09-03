using UnrealBuildTool;

public class EnglishImmersionRenderer : ModuleRules
{
    public EnglishImmersionRenderer(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(
            new[]
            {
                "Core",
                "CoreUObject",
                "Engine",
                "Audio2Lipsync",
                "HairStrandsCore",
                "Json",
                "LiveLinkInterface",
                "WebSockets"
            }
        );
    }
}
