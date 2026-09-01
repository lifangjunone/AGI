#include "EnglishImmersionDirector.h"

#include "Async/Async.h"
#include "Camera/CameraActor.h"
#include "Components/PrimitiveComponent.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "IWebSocket.h"
#include "Json.h"
#include "Modules/ModuleManager.h"
#include "WebSocketsModule.h"

namespace
{
constexpr int32 ProtocolVersion = 1;

bool ReadString(
    const TSharedPtr<FJsonObject>& Object,
    const TCHAR* Field,
    FString& Value
)
{
    return Object.IsValid() && Object->TryGetStringField(Field, Value);
}
}

AEnglishImmersionDirector::AEnglishImmersionDirector()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.TickInterval = 0.25f;
}

void AEnglishImmersionDirector::BeginPlay()
{
    Super::BeginPlay();
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
        Type != TEXT("avatar.state") ||
        !Root->TryGetObjectField(TEXT("payload"), Payload) ||
        Payload == nullptr)
    {
        UE_LOG(LogTemp, Warning, TEXT("Rejected incompatible avatar state"));
        return;
    }

    ApplyState(*Payload);
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

    SetTaggedActorsVisible(TEXT("Avatar."), ActiveAvatarId);
    SetTaggedActorsVisible(TEXT("Scene."), ActiveSceneId);
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

void AEnglishImmersionDirector::SetTaggedActorsVisible(
    const FString& Prefix,
    const FString& SelectedId
)
{
    const FName SelectedTag(*(Prefix + SelectedId));
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

        const bool bSelected = Actor->ActorHasTag(SelectedTag);
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
    for (TActorIterator<AActor> Actor(GetWorld()); Actor; ++Actor)
    {
        TInlineComponentArray<UPrimitiveComponent*> Components(*Actor);
        for (UPrimitiveComponent* Component : Components)
        {
            const bool bManaged = Component->ComponentTags.ContainsByPredicate(
                [&Prefix](const FName& Tag)
                {
                    return Tag.ToString().StartsWith(Prefix);
                }
            );
            if (bManaged)
            {
                Component->SetVisibility(
                    Component->ComponentHasTag(SelectedTag),
                    true
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
            }
            return;
        }
    }
}
