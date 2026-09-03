#include "EnglishImmersionDirector.h"
#include "EnglishImmersionFaceAnimInstance.h"

#include "Async/Async.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Camera/CameraActor.h"
#include "Components/PrimitiveComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EngineUtils.h"
#include "Engine/SkeletalMesh.h"
#include "FaceAnimationLib.h"
#include "GameFramework/PlayerController.h"
#include "GroomAsset.h"
#include "GroomBindingAsset.h"
#include "GroomComponent.h"
#include "HAL/IConsoleManager.h"
#include "IWebSocket.h"
#include "Json.h"
#include "LiveLinkFaceComponent.h"
#include "LiveLinkTypes.h"
#include "Materials/MaterialInterface.h"
#include "Modules/ModuleManager.h"
#include "UObject/UnrealType.h"
#include "WebSocketsModule.h"

namespace
{
constexpr int32 ProtocolVersion = 1;
constexpr int32 MaxLipSyncCues = 2048;

struct FVerifiedHairProfile
{
    const TCHAR* AvatarId;
    const TCHAR* HairId;
    const TCHAR* GroomPath;
    const TCHAR* BindingPath;
    const TCHAR* StrandMaterialPath;
    const TCHAR* CardsMaterialPath;
    const TCHAR* HelmetMaterialPath;
};

const FVerifiedHairProfile VerifiedHairProfiles[] = {
    {
        TEXT("sophia-tuya"),
        TEXT("long-straight"),
        TEXT(
            "/Game/MetaHumans/SophiaTuya/Grooms/"
            "Hair_L_Straight.Hair_L_Straight"
        ),
        TEXT(
            "/Game/MetaHumans/SophiaTuya/Grooms/"
            "Hair_L_Straight_Binding.Hair_L_Straight_Binding"
        ),
        TEXT(
            "/Game/MetaHumans/SophiaTuya/Grooms/"
            "MI_WI_Hair_L_Straight_Hair.MI_WI_Hair_L_Straight_Hair"
        ),
        TEXT(
            "/Game/MetaHumans/SophiaTuya/Grooms/"
            "MI_WI_Hair_L_Straight_Hair_Cards."
            "MI_WI_Hair_L_Straight_Hair_Cards"
        ),
        TEXT(
            "/Game/MetaHumans/SophiaTuya/Grooms/"
            "MI_WI_Hair_L_Straight_Hair_Helmet."
            "MI_WI_Hair_L_Straight_Hair_Helmet"
        )
    },
    {
        TEXT("amara-aera"),
        TEXT("long-straight-bangs"),
        TEXT(
            "/Game/MetaHumans/Sophia/Grooms/"
            "Hair_L_StraightBangs.Hair_L_StraightBangs"
        ),
        TEXT(
            "/Game/MetaHumans/Sophia/Grooms/"
            "Hair_L_StraightBangs_Binding.Hair_L_StraightBangs_Binding"
        ),
        TEXT(
            "/Game/MetaHumans/Sophia/Grooms/"
            "MI_WI_Hair_L_StraightBangs_Hair."
            "MI_WI_Hair_L_StraightBangs_Hair"
        ),
        TEXT(
            "/Game/MetaHumans/Sophia/Grooms/"
            "MI_WI_Hair_L_StraightBangs_Hair_Cards."
            "MI_WI_Hair_L_StraightBangs_Hair_Cards"
        ),
        TEXT(
            "/Game/MetaHumans/Sophia/Grooms/"
            "MI_WI_Hair_L_StraightBangs_Hair_Helmet."
            "MI_WI_Hair_L_StraightBangs_Hair_Helmet"
        )
    },
    {
        TEXT("vivian-voss"),
        TEXT("bob-straight"),
        TEXT(
            "/Game/MetaHumans/Vivian/Grooms/"
            "Hair_M_BobStraight.Hair_M_BobStraight"
        ),
        TEXT(
            "/Game/MetaHumans/Vivian/Grooms/"
            "Hair_M_BobStraight_Binding.Hair_M_BobStraight_Binding"
        ),
        TEXT(
            "/Game/MetaHumans/Vivian/Grooms/"
            "MI_WI_Hair_M_BobStraight_Hair."
            "MI_WI_Hair_M_BobStraight_Hair"
        ),
        TEXT(
            "/Game/MetaHumans/Vivian/Grooms/"
            "MI_WI_Hair_M_BobStraight_Hair_Cards."
            "MI_WI_Hair_M_BobStraight_Hair_Cards"
        ),
        TEXT(
            "/Game/MetaHumans/Vivian/Grooms/"
            "MI_WI_Hair_M_BobStraight_Hair_Helmet."
            "MI_WI_Hair_M_BobStraight_Hair_Helmet"
        )
    }
};

struct FLipCurveValues
{
    float JawOpen = 0.0f;
    float Funnel = 0.0f;
    float LipsTogether = 0.0f;
    float LowerLipBite = 0.0f;
    float CornerWide = 0.0f;
    float LipsPurse = 0.0f;
    float LowerLipDepress = 0.0f;
};

bool ReadString(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    FString& Value
)
{
    return Object.IsValid() && Object->TryGetStringField(Field, Value);
}

bool ParseLipShape(const FString& Value, ELipShape& Shape)
{
    if (Value == TEXT("sil")) Shape = ELipShape::Silence;
    else if (Value == TEXT("closed")) Shape = ELipShape::Closed;
    else if (Value == TEXT("teeth")) Shape = ELipShape::Teeth;
    else if (Value == TEXT("tongue")) Shape = ELipShape::Tongue;
    else if (Value == TEXT("wide")) Shape = ELipShape::Wide;
    else if (Value == TEXT("open")) Shape = ELipShape::Open;
    else if (Value == TEXT("round")) Shape = ELipShape::Round;
    else if (Value == TEXT("purse")) Shape = ELipShape::Purse;
    else return false;
    return true;
}

FLipCurveValues ValuesForShape(ELipShape Shape)
{
    FLipCurveValues Values;
    switch (Shape)
    {
    case ELipShape::Closed:
        Values.LipsTogether = 0.9f;
        break;
    case ELipShape::Teeth:
        Values.JawOpen = 0.16f;
        Values.LowerLipBite = 0.72f;
        break;
    case ELipShape::Tongue:
        Values.JawOpen = 0.24f;
        Values.LowerLipDepress = 0.3f;
        break;
    case ELipShape::Wide:
        Values.JawOpen = 0.34f;
        Values.CornerWide = 0.52f;
        break;
    case ELipShape::Open:
        Values.JawOpen = 0.72f;
        break;
    case ELipShape::Round:
        Values.JawOpen = 0.46f;
        Values.Funnel = 0.64f;
        break;
    case ELipShape::Purse:
        Values.JawOpen = 0.22f;
        Values.LipsPurse = 0.72f;
        break;
    default:
        break;
    }
    return Values;
}

FLipCurveValues BlendLipValues(
    const FLipCurveValues& From,
    const FLipCurveValues& To,
    float Alpha
)
{
    FLipCurveValues Values;
    Values.JawOpen = FMath::Lerp(From.JawOpen, To.JawOpen, Alpha);
    Values.Funnel = FMath::Lerp(From.Funnel, To.Funnel, Alpha);
    Values.LipsTogether =
        FMath::Lerp(From.LipsTogether, To.LipsTogether, Alpha);
    Values.LowerLipBite =
        FMath::Lerp(From.LowerLipBite, To.LowerLipBite, Alpha);
    Values.CornerWide =
        FMath::Lerp(From.CornerWide, To.CornerWide, Alpha);
    Values.LipsPurse =
        FMath::Lerp(From.LipsPurse, To.LipsPurse, Alpha);
    Values.LowerLipDepress =
        FMath::Lerp(From.LowerLipDepress, To.LowerLipDepress, Alpha);
    return Values;
}
}

AEnglishImmersionDirector::AEnglishImmersionDirector()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickInterval = 0.0f;
    LiveLinkFace = CreateDefaultSubobject<ULiveLinkFaceComponent>(
        TEXT("LiveLinkFace")
    );
}

void AEnglishImmersionDirector::BeginPlay()
{
    Super::BeginPlay();
    ConfigureIdleAnimations();
    Connect();
}

void AEnglishImmersionDirector::EndPlay(
    const EEndPlayReason::Type EndPlayReason
)
{
    if (Socket.IsValid())
    {
        Socket->Close();
        Socket.Reset();
    }

    Super::EndPlay(EndPlayReason);
}

void AEnglishImmersionDirector::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (Socket.IsValid() && Socket->IsConnected())
    {
        ReconnectDelay = 0.0f;
        return;
    }

    ReconnectDelay -= DeltaSeconds;
    if (ReconnectDelay <= 0.0f)
    {
        ReconnectDelay = 2.0f;
        Connect();
    }
}

void AEnglishImmersionDirector::ConfigureIdleAnimations()
{
    UAnimationAsset* BodyIdle = LoadObject<UAnimationAsset>(
        nullptr,
        TEXT(
            "/MetaHumanCharacter/Optional/Animation/UEFNAnimPreset/"
            "Locomotion/AS_MH_Neutral_Stand_Idle_Loop."
            "AS_MH_Neutral_Stand_Idle_Loop"
        )
    );
    UAnimationAsset* FaceIdle = LoadObject<UAnimationAsset>(
        nullptr,
        TEXT(
            "/MetaHumanCharacter/Optional/Animation/TemplateAnimations/"
            "Technical_Loops/Idle/mhc_mh001_fmn_f_idle."
            "mhc_mh001_fmn_f_idle"
        )
    );
    UClass* FaceLiveLinkClass = LoadClass<UAnimInstance>(
        nullptr,
        TEXT(
            "/Game/MetaHumans/Common/Animation/ABP_MH_LiveLink."
            "ABP_MH_LiveLink_C"
        )
    );

    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        const bool bAvatar = Actor->Tags.ContainsByPredicate(
            [](const FName& Tag)
            {
                return Tag.ToString().StartsWith(TEXT("Avatar."));
            }
        );
        if (!bAvatar)
        {
            continue;
        }

        TInlineComponentArray<USkeletalMeshComponent*> Components(*Actor);
        for (USkeletalMeshComponent* Component : Components)
        {
            if (Component->GetName() == TEXT("Body"))
            {
                Component->SetAnimationMode(
                    EAnimationMode::AnimationSingleNode
                );
                Component->PlayAnimation(BodyIdle, true);
            }
            else if (Component->GetName() == TEXT("Face"))
            {
                if (!FaceLiveLinkClass)
                {
                    Component->SetAnimationMode(
                        EAnimationMode::AnimationSingleNode
                    );
                    Component->PlayAnimation(FaceIdle, true);
                    continue;
                }

                Component->SetAnimInstanceClass(FaceLiveLinkClass);
                UAnimInstance* Instance = Component->GetAnimInstance();
                if (!Instance)
                {
                    continue;
                }

                if (FStructProperty* SubjectProperty =
                    FindFProperty<FStructProperty>(
                        Instance->GetClass(),
                        TEXT("LLink_Face_Subj")
                    ))
                {
                    if (FLiveLinkSubjectName* Subject =
                        SubjectProperty->ContainerPtrToValuePtr<
                            FLiveLinkSubjectName
                        >(Instance))
                    {
                        Subject->Name = TEXT("FaceAnimation");
                    }
                }
                if (FBoolProperty* MhfdsProperty =
                    FindFProperty<FBoolProperty>(
                        Instance->GetClass(),
                        TEXT("IsMHFDS")
                    ))
                {
                    MhfdsProperty->SetPropertyValue_InContainer(
                        Instance,
                        false
                    );
                }
            }
        }
    }
}
void AEnglishImmersionDirector::Connect()
{
    if (Socket.IsValid() && Socket->IsConnected())
    {
        return;
    }

    FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
    Socket = FWebSocketsModule::Get().CreateWebSocket(BridgeUrl);

    TWeakObjectPtr<AEnglishImmersionDirector> WeakThis(this);
    Socket->OnMessage().AddLambda([WeakThis](const FString& Message)
    {
        AsyncTask(ENamedThreads::GameThread, [WeakThis, Message]()
        {
            if (WeakThis.IsValid())
            {
                WeakThis->HandleMessage(Message);
            }
        });
    });
    Socket->OnConnectionError().AddLambda([WeakThis](const FString& Error)
    {
        if (WeakThis.IsValid())
        {
            UE_LOG(
                LogTemp,
                Warning,
                TEXT("English Immersion bridge connection failed: %s"),
                *Error
            );
        }
    });
    Socket->Connect();
}

void AEnglishImmersionDirector::HandleMessage(const FString& Message)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected malformed avatar state JSON"));
        return;
    }

    double Version = 0;
    FString Type;
    const TSharedPtr<FJsonObject>* Payload = nullptr;
    if (!Root->TryGetNumberField(TEXT("version"), Version) ||
        Version != ProtocolVersion ||
        !Root->TryGetStringField(TEXT("type"), Type) ||
        !Root->TryGetObjectField(TEXT("payload"), Payload) ||
        Payload == nullptr)
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected incompatible avatar state"));
        return;
    }

    if (Type == TEXT("avatar.state"))
    {
        ApplyState(*Payload);
    }
    else if (Type == TEXT("speech.timeline"))
    {
        ApplySpeechTimeline(*Payload);
    }
    else if (Type == TEXT("speech.face"))
    {
        ApplyFaceAnimation(*Payload);
    }
    else if (Type == TEXT("renderer.performance"))
    {
        ApplyPerformanceMode(*Payload);
    }
    else if (Type == TEXT("speech.stop"))
    {
        FString UtteranceId;
        if (ReadString(*Payload, TEXT("utteranceId"), UtteranceId))
        {
            StopLipSync(UtteranceId);
            LiveLinkFace->Stop();
        }
    }
    else
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected unknown renderer command"));
    }
}

void AEnglishImmersionDirector::ApplyPerformanceMode(
    const TSharedPtr<FJsonObject>& Payload
)
{
    FString Mode;
    if (!ReadString(Payload, TEXT("mode"), Mode) ||
        (Mode != TEXT("inference") && Mode != TEXT("interactive")))
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected renderer performance mode"));
        return;
    }

    const int32 MaxFps = Mode == TEXT("inference") ? 10 : 30;
    if (IConsoleVariable* Variable =
        IConsoleManager::Get().FindConsoleVariable(TEXT("t.MaxFPS")))
    {
        Variable->Set(MaxFps, ECVF_SetByCode);
    }
    UE_LOG(
        LogTemp,
        Display,
        TEXT("EIS_PERFORMANCE_MODE mode=%s max_fps=%d"),
        *Mode,
        MaxFps
    );
}

void AEnglishImmersionDirector::ApplyFaceAnimation(
    const TSharedPtr<FJsonObject>& Payload
)
{
    FString PayloadJson;
    const TSharedRef<TJsonWriter<>> Writer =
        TJsonWriterFactory<>::Create(&PayloadJson);
    if (!FJsonSerializer::Serialize(Payload.ToSharedRef(), Writer))
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected face animation JSON"));
        return;
    }

    FFaceAnimationData FaceData;
    if (!UFaceAnimationLib::ParseFaceAnimJSON(PayloadJson, FaceData))
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected invalid ARKit face data"));
        return;
    }

    StopLipSync(ActiveUtteranceId);
    LiveLinkFace->PlayAnimation(FaceData);
    UE_LOG(
        LogTemp,
        Display,
        TEXT("EIS_FACE_ANIMATION_STARTED frames=%d channels=%d fps=%d"),
        FaceData.NumFrames,
        FaceData.NumChannels,
        FaceData.Fps
    );
}

void AEnglishImmersionDirector::ApplySpeechTimeline(
    const TSharedPtr<FJsonObject>& Payload
)
{
    FString UtteranceId;
    double OffsetMs = 0.0;
    const TArray<TSharedPtr<FJsonValue>>* Cues = nullptr;
    if (!ReadString(Payload, TEXT("utteranceId"), UtteranceId) ||
        !Payload->TryGetNumberField(TEXT("offsetMs"), OffsetMs) ||
        !Payload->TryGetArrayField(TEXT("cues"), Cues) ||
        Cues == nullptr ||
        Cues->IsEmpty() ||
        Cues->Num() > MaxLipSyncCues)
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected incomplete speech timeline"));
        return;
    }

    TArray<FLipSyncCue> ParsedCues;
    ParsedCues.Reserve(Cues->Num());
    double PreviousTime = -1.0;
    for (const TSharedPtr<FJsonValue>& CueValue : *Cues)
    {
        const TSharedPtr<FJsonObject>* CueObject = nullptr;
        double AtMs = 0.0;
        FString ShapeName;
        ELipShape Shape;
        if (!CueValue.IsValid() ||
            !CueValue->TryGetObject(CueObject) ||
            CueObject == nullptr ||
            !(*CueObject)->TryGetNumberField(TEXT("atMs"), AtMs) ||
            !ReadString(*CueObject, TEXT("shape"), ShapeName) ||
            !ParseLipShape(ShapeName, Shape) ||
            AtMs < PreviousTime ||
            AtMs > 120000.0)
        {
            UE_LOG(LogTemp, Warning, TEXT("Rejected malformed lip sync cue"));
            return;
        }
        ParsedCues.Add({AtMs / 1000.0, Shape});
        PreviousTime = AtMs;
    }

    ResetLipSyncCurves();
    ActiveUtteranceId = MoveTemp(UtteranceId);
    LipSyncCues = MoveTemp(ParsedCues);
    LipSyncCueIndex = 0;
    LipSyncStartSeconds =
        FPlatformTime::Seconds() - FMath::Max(0.0, OffsetMs / 1000.0);
    UE_LOG(
        LogTemp,
        Display,
        TEXT("EIS_LIPSYNC_STARTED utterance=%s cues=%d offset_ms=%.0f"),
        *ActiveUtteranceId,
        LipSyncCues.Num(),
        OffsetMs
    );
}

void AEnglishImmersionDirector::ApplyLipSync()
{
    if (LipSyncCues.IsEmpty())
    {
        return;
    }

    const double Elapsed = FPlatformTime::Seconds() - LipSyncStartSeconds;
    if (Elapsed > LipSyncCues.Last().TimeSeconds + 0.12)
    {
        StopLipSync(ActiveUtteranceId);
        return;
    }

    while (LipSyncCueIndex + 1 < LipSyncCues.Num() &&
        LipSyncCues[LipSyncCueIndex + 1].TimeSeconds <= Elapsed)
    {
        ++LipSyncCueIndex;
    }

    const FLipSyncCue& FromCue = LipSyncCues[LipSyncCueIndex];
    const FLipSyncCue& ToCue = LipSyncCues[
        FMath::Min(LipSyncCueIndex + 1, LipSyncCues.Num() - 1)
    ];
    const double Duration = ToCue.TimeSeconds - FromCue.TimeSeconds;
    const float LinearAlpha = Duration > UE_SMALL_NUMBER
        ? FMath::Clamp(
            static_cast<float>((Elapsed - FromCue.TimeSeconds) / Duration),
            0.0f,
            1.0f
        )
        : 1.0f;
    const float Alpha = LinearAlpha * LinearAlpha * (3.0f - 2.0f * LinearAlpha);
    const FLipCurveValues Values = BlendLipValues(
        ValuesForShape(FromCue.Shape),
        ValuesForShape(ToCue.Shape),
        Alpha
    );

    UEnglishImmersionFaceAnimInstance* Instance =
        Cast<UEnglishImmersionFaceAnimInstance>(
        FindFaceComponent() ? FaceComponent->GetAnimInstance() : nullptr
    );
    if (!Instance)
    {
        return;
    }

    TMap<FName, float> CurveValues;
    const auto SetCurve = [&CurveValues](
        const TCHAR* Name,
        float Value
    )
    {
        CurveValues.Add(FName(Name), Value);
    };
    const auto SetPair = [&SetCurve](
        const TCHAR* Left,
        const TCHAR* Right,
        float Value
    )
    {
        SetCurve(Left, Value);
        SetCurve(Right, Value);
    };
    SetCurve(
        TEXT("CTRL_expressions.jawOpen"),
        Values.JawOpen
    );
    SetPair(
        TEXT("CTRL_expressions.mouthFunnelDL"),
        TEXT("CTRL_expressions.mouthFunnelDR"),
        Values.Funnel
    );
    SetPair(
        TEXT("CTRL_expressions.mouthFunnelUL"),
        TEXT("CTRL_expressions.mouthFunnelUR"),
        Values.Funnel
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLipsTogetherDL"),
        TEXT("CTRL_expressions.mouthLipsTogetherDR"),
        Values.LipsTogether
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLipsTogetherUL"),
        TEXT("CTRL_expressions.mouthLipsTogetherUR"),
        Values.LipsTogether
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLowerLipBiteL"),
        TEXT("CTRL_expressions.mouthLowerLipBiteR"),
        Values.LowerLipBite
    );
    SetPair(
        TEXT("CTRL_expressions.mouthCornerWideL"),
        TEXT("CTRL_expressions.mouthCornerWideR"),
        Values.CornerWide
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLipsPurseDL"),
        TEXT("CTRL_expressions.mouthLipsPurseDR"),
        Values.LipsPurse
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLipsPurseUL"),
        TEXT("CTRL_expressions.mouthLipsPurseUR"),
        Values.LipsPurse
    );
    SetPair(
        TEXT("CTRL_expressions.mouthLowerLipDepressL"),
        TEXT("CTRL_expressions.mouthLowerLipDepressR"),
        Values.LowerLipDepress
    );
    Instance->SetLipCurveValues(CurveValues);

    if (LastLoggedLipSyncCueIndex != LipSyncCueIndex)
    {
        LastLoggedLipSyncCueIndex = LipSyncCueIndex;
        UE_LOG(
            LogTemp,
            Display,
            TEXT(
                "EIS_LIPSYNC_CUE index=%d shape=%d jaw_requested=%.3f"
            ),
            LipSyncCueIndex,
            static_cast<int32>(FromCue.Shape),
            Values.JawOpen
        );
    }
}

void AEnglishImmersionDirector::StopLipSync(const FString& UtteranceId)
{
    if (!ActiveUtteranceId.IsEmpty() &&
        !UtteranceId.IsEmpty() &&
        UtteranceId != ActiveUtteranceId)
    {
        return;
    }
    ResetLipSyncCurves();
    ActiveUtteranceId.Empty();
    LipSyncCues.Reset();
    LipSyncCueIndex = 0;
    LastLoggedLipSyncCueIndex = INDEX_NONE;
    UE_LOG(LogTemp, Display, TEXT("EIS_LIPSYNC_STOPPED"));
}

USkeletalMeshComponent* AEnglishImmersionDirector::FindFaceComponent()
{
    if (FaceComponent.IsValid())
    {
        return FaceComponent.Get();
    }
    const FName ActiveAvatarTag(
        *(TEXT("Avatar.") + ActiveAvatarId)
    );
    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        if (!ActiveAvatarId.IsEmpty() &&
            !Actor->ActorHasTag(ActiveAvatarTag))
        {
            continue;
        }
        TInlineComponentArray<USkeletalMeshComponent*> Components(*Actor);
        for (USkeletalMeshComponent* Component : Components)
        {
            if (Component->GetName() == TEXT("Face"))
            {
                FaceComponent = Component;
                Component->AddTickPrerequisiteActor(this);
                const USkeletalMesh* Mesh =
                    Component->GetSkeletalMeshAsset();
                UE_LOG(
                    LogTemp,
                    Display,
                    TEXT(
                        "EIS_FACE_COMPONENT_SELECTED avatar=%s actor=%s "
                        "instance=%s postprocess=%s mesh=%s morphs=%d "
                        "has_jaw=%d"
                    ),
                    *ActiveAvatarId,
                    *Actor->GetName(),
                    Component->GetAnimInstance()
                        ? *Component->GetAnimInstance()->GetClass()->GetName()
                        : TEXT("none"),
                    Component->GetPostProcessInstance()
                        ? *Component->GetPostProcessInstance()
                            ->GetClass()->GetName()
                        : TEXT("none"),
                    Mesh ? *Mesh->GetName() : TEXT("none"),
                    Mesh ? Mesh->GetMorphTargets().Num() : 0,
                    Mesh && Mesh->FindMorphTarget(
                        TEXT("head_lod0_mesh__jaw_open")
                    ) ? 1 : 0
                );
                return Component;
            }
        }
    }
    return nullptr;
}

void AEnglishImmersionDirector::ResetLipSyncCurves()
{
    UEnglishImmersionFaceAnimInstance* Instance =
        Cast<UEnglishImmersionFaceAnimInstance>(
        FindFaceComponent() ? FaceComponent->GetAnimInstance() : nullptr
    );
    if (!Instance)
    {
        return;
    }
    Instance->SetLipCurveValues({});
}

void AEnglishImmersionDirector::ApplyState(
    const TSharedPtr<FJsonObject>& Payload
)
{
    FString NextAvatarId;
    FString NextHairId;
    FString NextOutfitId;
    FString NextPerformance;
    FString NextSceneId;
    FString NextViewMode;
    bool bNextSpeaking = false;

    if (!ReadString(Payload, TEXT("avatarId"), NextAvatarId) ||
        !ReadString(Payload, TEXT("hairId"), NextHairId) ||
        !ReadString(Payload, TEXT("outfitId"), NextOutfitId) ||
        !ReadString(Payload, TEXT("performance"), NextPerformance) ||
        !ReadString(Payload, TEXT("sceneId"), NextSceneId) ||
        !ReadString(Payload, TEXT("viewMode"), NextViewMode) ||
        !Payload->TryGetBoolField(TEXT("speaking"), bNextSpeaking))
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected incomplete avatar state"));
        return;
    }

    ActiveAvatarId = MoveTemp(NextAvatarId);
    ActiveHairId = MoveTemp(NextHairId);
    ActiveOutfitId = MoveTemp(NextOutfitId);
    ActivePerformance = MoveTemp(NextPerformance);
    ActiveSceneId = MoveTemp(NextSceneId);
    ActiveViewMode = MoveTemp(NextViewMode);
    bIsSpeaking = bNextSpeaking;
    FaceComponent.Reset();

    SetTaggedActorsVisible(TEXT("Avatar."), ActiveAvatarId);
    SetTaggedActorsVisible(TEXT("Scene."), ActiveSceneId);
    ApplyHairProfile();
    SetTaggedComponentsVisible(TEXT("Hair."), ActiveHairId);
    SetTaggedComponentsVisible(TEXT("Outfit."), ActiveOutfitId);
    SetActiveCamera(ActiveViewMode);

    OnAvatarStateChanged.Broadcast(
        ActiveAvatarId,
        ActiveHairId,
        ActiveOutfitId,
        ActivePerformance,
        ActiveSceneId,
        bIsSpeaking,
        ActiveViewMode
    );
}

void AEnglishImmersionDirector::ApplyHairProfile()
{
    const FVerifiedHairProfile* Profile = nullptr;
    for (const FVerifiedHairProfile& Candidate : VerifiedHairProfiles)
    {
        if (ActiveAvatarId == Candidate.AvatarId &&
            ActiveHairId == Candidate.HairId)
        {
            Profile = &Candidate;
            break;
        }
    }
    if (!Profile)
    {
        UE_LOG(
            LogTemp,
            Warning,
            TEXT("EIS_HAIR_PROFILE_REJECTED avatar=%s hair=%s"),
            *ActiveAvatarId,
            *ActiveHairId
        );
        return;
    }

    UGroomAsset* Groom = LoadObject<UGroomAsset>(
        nullptr,
        Profile->GroomPath
    );
    UGroomBindingAsset* Binding = LoadObject<UGroomBindingAsset>(
        nullptr,
        Profile->BindingPath
    );
    UMaterialInterface* StrandMaterial = LoadObject<UMaterialInterface>(
        nullptr,
        Profile->StrandMaterialPath
    );
    UMaterialInterface* CardsMaterial = LoadObject<UMaterialInterface>(
        nullptr,
        Profile->CardsMaterialPath
    );
    UMaterialInterface* HelmetMaterial = LoadObject<UMaterialInterface>(
        nullptr,
        Profile->HelmetMaterialPath
    );
    if (!Groom || !Binding || !StrandMaterial ||
        !CardsMaterial || !HelmetMaterial)
    {
        UE_LOG(
            LogTemp,
            Error,
            TEXT("EIS_HAIR_PROFILE_MISSING_ASSET avatar=%s hair=%s"),
            *ActiveAvatarId,
            *ActiveHairId
        );
        return;
    }

    const FName ActiveAvatarTag(
        *(TEXT("Avatar.") + ActiveAvatarId)
    );
    const FName HairTag(*(TEXT("Hair.") + ActiveHairId));
    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        if (!Actor->ActorHasTag(ActiveAvatarTag))
        {
            continue;
        }

        TInlineComponentArray<UGroomComponent*> Components(*Actor);
        for (UGroomComponent* Component : Components)
        {
            const bool bIsHair =
                Component->GetName().Contains(TEXT("Hair")) ||
                Component->ComponentTags.ContainsByPredicate(
                    [](const FName& Tag)
                    {
                        return Tag.ToString().StartsWith(TEXT("Hair."));
                    }
                );
            if (!bIsHair)
            {
                continue;
            }

            const bool bChanged =
                Component->GroomAsset != Groom ||
                Component->BindingAsset != Binding;
            if (bChanged)
            {
                Component->SetGroomAsset(Groom, Binding, true);
                Component->SetMaterial(0, StrandMaterial);
                Component->SetMaterial(1, CardsMaterial);
                Component->SetMaterial(2, HelmetMaterial);
            }

            Component->ComponentTags.RemoveAll(
                [](const FName& Tag)
                {
                    return Tag.ToString().StartsWith(TEXT("Hair."));
                }
            );
            Component->ComponentTags.AddUnique(HairTag);
            Component->SetVisibility(true, false);

            UE_LOG(
                LogTemp,
                Display,
                TEXT(
                    "EIS_HAIR_PROFILE_APPLIED avatar=%s hair=%s "
                    "component=%s changed=%d"
                ),
                *ActiveAvatarId,
                *ActiveHairId,
                *Component->GetName(),
                bChanged ? 1 : 0
            );
        }
        return;
    }
}

void AEnglishImmersionDirector::SetTaggedActorsVisible(
    const FString& Prefix,
    const FString& SelectedId
)
{
    const FName SelectedTag(*(Prefix + SelectedId));
    FName FallbackTag;
    bool bHasExactMatch = false;
    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        for (const FName& Tag : Actor->Tags)
        {
            if (!Tag.ToString().StartsWith(Prefix))
            {
                continue;
            }
            if (FallbackTag.IsNone())
            {
                FallbackTag = Tag;
            }
            bHasExactMatch |= Tag == SelectedTag;
        }
    }
    const FName EffectiveTag = bHasExactMatch ? SelectedTag : FallbackTag;

    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        const bool bManaged = Actor->Tags.ContainsByPredicate(
            [&Prefix](const FName& Tag)
            {
                return Tag.ToString().StartsWith(Prefix);
            }
        );
        if (!bManaged)
        {
            continue;
        }

        const bool bSelected = Actor->ActorHasTag(EffectiveTag);
        Actor->SetActorHiddenInGame(!bSelected);
        Actor->SetActorEnableCollision(bSelected);
    }
}

void AEnglishImmersionDirector::SetTaggedComponentsVisible(
    const FString& Prefix,
    const FString& SelectedId
)
{
    const FName SelectedTag(*(Prefix + SelectedId));
    FName FallbackTag;
    bool bHasExactMatch = false;
    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        TInlineComponentArray<UPrimitiveComponent*> Components(*Actor);
        for (UPrimitiveComponent* Component : Components)
        {
            for (const FName& Tag : Component->ComponentTags)
            {
                if (Tag.ToString().StartsWith(Prefix))
                {
                    if (FallbackTag.IsNone()) FallbackTag = Tag;
                    bHasExactMatch |= Tag == SelectedTag;
                }
            }
            if (Prefix == TEXT("Outfit.") &&
                Component->GetName() == TEXT("SkeletalMesh"))
            {
                for (const FName& Tag : Actor->Tags)
                {
                    if (Tag.ToString().StartsWith(Prefix))
                    {
                        if (FallbackTag.IsNone()) FallbackTag = Tag;
                        bHasExactMatch |= Tag == SelectedTag;
                    }
                }
            }
        }
    }
    const FName EffectiveTag = bHasExactMatch ? SelectedTag : FallbackTag;

    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        TInlineComponentArray<UPrimitiveComponent*> Components(*Actor);
        for (UPrimitiveComponent* Component : Components)
        {
            const bool bExplicitlyManaged =
                Component->ComponentTags.ContainsByPredicate(
                [&Prefix](const FName& Tag)
                {
                    return Tag.ToString().StartsWith(Prefix);
                }
                );
            const bool bGeneratedOutfit =
                Prefix == TEXT("Outfit.") &&
                Component->GetName() == TEXT("SkeletalMesh") &&
                Actor->Tags.ContainsByPredicate(
                    [&Prefix](const FName& Tag)
                    {
                        return Tag.ToString().StartsWith(Prefix);
                    }
                );
            const bool bManaged = bExplicitlyManaged || bGeneratedOutfit;
            if (bManaged)
            {
                const bool bSelected =
                    Component->ComponentHasTag(EffectiveTag) ||
                    (bGeneratedOutfit && Actor->ActorHasTag(EffectiveTag));
                Component->SetVisibility(
                    bSelected,
                    false
                );
            }
        }
    }
}

void AEnglishImmersionDirector::SetActiveCamera(const FString& ViewMode)
{
    const FName CameraTag(*(TEXT("Camera.") + ViewMode));
    for (TActorIterator<ACameraActor> Camera(GetWorld()); Camera; ++Camera)
    {
        if (Camera->ActorHasTag(CameraTag))
        {
            if (APlayerController* Controller = GetWorld()->GetFirstPlayerController())
            {
                Controller->SetViewTargetWithBlend(*Camera, 0.25f);
                UE_LOG(
                    LogTemp,
                    Display,
                    TEXT(
                        "EIS_CAMERA_CHANGED view=%s location=%s rotation=%s"
                    ),
                    *ViewMode,
                    *Camera->GetActorLocation().ToCompactString(),
                    *Camera->GetActorRotation().ToCompactString()
                );
            }
            return;
        }
    }
}
