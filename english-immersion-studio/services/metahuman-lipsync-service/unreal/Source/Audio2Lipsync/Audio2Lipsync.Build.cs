using System.IO;
using UnrealBuildTool;

public class Audio2Lipsync : ModuleRules
{
    public Audio2Lipsync(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core", "CoreUObject", "Engine", "InputCore",
            "AudioMixer", "HTTP", "AudioCapture", "SignalProcessing",
            "LiveLinkInterface",
        });

        PrivateDependencyModuleNames.AddRange(new string[] {
            "Json",
        });

        // dr_mp3 (header-only)
        PrivateIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty"));
    }
}
