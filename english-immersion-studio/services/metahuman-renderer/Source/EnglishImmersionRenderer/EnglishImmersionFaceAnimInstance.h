#pragma once

#include "Animation/AnimSingleNodeInstance.h"
#include "EnglishImmersionFaceAnimInstance.generated.h"

UCLASS(Transient, NotBlueprintable)
class ENGLISHIMMERSIONRENDERER_API UEnglishImmersionFaceAnimInstance
    : public UAnimSingleNodeInstance
{
    GENERATED_BODY()

public:
    void SetLipCurveValues(const TMap<FName, float>& Values);

protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(
        FAnimInstanceProxy* InProxy
    ) override;
};
