#include "EnglishImmersionFaceAnimInstance.h"

#include "Animation/AnimSingleNodeInstanceProxy.h"

namespace
{
struct FEnglishImmersionFaceAnimProxy final
    : public FAnimSingleNodeInstanceProxy
{
    explicit FEnglishImmersionFaceAnimProxy(UAnimInstance* Instance)
        : FAnimSingleNodeInstanceProxy(Instance)
    {
    }

    virtual bool Evaluate(FPoseContext& Output) override
    {
        const bool bEvaluated =
            FAnimSingleNodeInstanceProxy::Evaluate(Output);
        for (const TPair<FName, float>& Curve : LipCurveValues)
        {
            Output.Curve.Set(Curve.Key, Curve.Value);
        }
        return bEvaluated;
    }

    void SetLipCurveValues(const TMap<FName, float>& Values)
    {
        LipCurveValues = Values;
    }

private:
    TMap<FName, float> LipCurveValues;
};
}

void UEnglishImmersionFaceAnimInstance::SetLipCurveValues(
    const TMap<FName, float>& Values
)
{
    GetProxyOnGameThread<FEnglishImmersionFaceAnimProxy>()
        .SetLipCurveValues(Values);
}

FAnimInstanceProxy*
UEnglishImmersionFaceAnimInstance::CreateAnimInstanceProxy()
{
    return new FEnglishImmersionFaceAnimProxy(this);
}

void UEnglishImmersionFaceAnimInstance::DestroyAnimInstanceProxy(
    FAnimInstanceProxy* InProxy
)
{
    delete static_cast<FEnglishImmersionFaceAnimProxy*>(InProxy);
}
