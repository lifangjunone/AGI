using UnrealBuildTool;
using System.Collections.Generic;

public class EnglishImmersionRendererEditorTarget : TargetRules
{
    public EnglishImmersionRendererEditorTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Editor;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("EnglishImmersionRenderer");
    }
}
