#include "EnglishImmersionGameMode.h"

#include "EnglishImmersionDirector.h"
#include "Engine/World.h"

void AEnglishImmersionGameMode::BeginPlay()
{
    Super::BeginPlay();

    if (GetWorld())
    {
        GetWorld()->SpawnActor<AEnglishImmersionDirector>();
    }
}
