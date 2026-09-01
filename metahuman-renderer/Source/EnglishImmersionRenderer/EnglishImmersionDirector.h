#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "EnglishImmersionDirector.generated.h"

class IWebSocket;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_SevenParams(
    FAvatarStateChanged,
    const FString&, AvatarId,
    const FString&, HairId,
    const FString&, OutfitId,
    const FString&, Performance,
    const FString&, SceneId,
    bool, bSpeaking,
    const FString&, ViewMode
);

UCLASS()
class ENGLISHIMMERSIONRENDERER_API AEnglishImmersionDirector : public AActor
{
    GENERATED_BODY()

public:
    AEnglishImmersionDirector();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
    virtual void Tick(float DeltaSeconds) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "English Immersion")
    FString BridgeUrl = TEXT("ws://127.0.0.1:7790");

    UPROPERTY(BlueprintAssignable, Category = "English Immersion")
    FAvatarStateChanged OnAvatarStateChanged;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActiveAvatarId;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActiveHairId;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActiveOutfitId;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActivePerformance;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActiveSceneId;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    FString ActiveViewMode;

    UPROPERTY(BlueprintReadOnly, Category = "English Immersion")
    bool bIsSpeaking = false;

private:
    TSharedPtr<IWebSocket> Socket;
    float ReconnectDelay = 0.0f;

    void Connect();
    void HandleMessage(const FString& Message);
    void ApplyState(const TSharedPtr<class FJsonObject>& Payload);
    void SetTaggedActorsVisible(const FString& Prefix, const FString& SelectedId);
    void SetTaggedComponentsVisible(const FString& Prefix, const FString& SelectedId);
    void SetActiveCamera(const FString& ViewMode);
};
