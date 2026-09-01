#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "EnglishImmersionGameMode.generated.h"

UCLASS()
class ENGLISHIMMERSIONRENDERER_API AEnglishImmersionGameMode
    : public AGameModeBase
{
    GENERATED_BODY()

protected:
    virtual void BeginPlay() override;
};
