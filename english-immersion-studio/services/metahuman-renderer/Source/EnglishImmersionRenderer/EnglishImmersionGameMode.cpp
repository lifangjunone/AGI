#include "EnglishImmersionGameMode.h"

#include "EnglishImmersionDirector.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

void AEnglishImmersionGameMode::BeginPlay()
{
    Super::BeginPlay();

    if (GetWorld())
    {
        if (APlayerController* Controller =
                GetWorld()->GetFirstPlayerController())
        {
            Controller->bShowMouseCursor = true;
            Controller->bEnableClickEvents = true;
            Controller->bEnableMouseOverEvents = true;

            FInputModeGameAndUI InputMode;
            InputMode.SetHideCursorDuringCapture(false);
            InputMode.SetLockMouseToViewportBehavior(
                EMouseLockMode::DoNotLock
            );
            Controller->SetInputMode(InputMode);
        }

        GetWorld()->SpawnActor<AEnglishImmersionDirector>();
    }
}
