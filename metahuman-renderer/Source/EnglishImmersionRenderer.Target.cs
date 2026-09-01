using UnrealBuildTool;
using System.Collections.Generic;

public class EnglishImmersionRendererTarget : TargetRules
{
    public EnglishImmersionRendererTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Game;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("EnglishImmersionRenderer");
    }
}
