#include "FaceAnimationLib.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// =============================================================================
// Parsing
// =============================================================================

bool UFaceAnimationLib::ParseFaceAnimJSON(const FString& JsonString, FFaceAnimationData& OutData)
{
	OutData = FFaceAnimationData();

	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("FaceAnimationLib: Failed to parse JSON."));
		return false;
	}

	// Read metadata
	double D = 0.0;
	if (Root->TryGetNumberField(TEXT("fps"), D)) OutData.Fps = (int32)D;
	if (Root->TryGetNumberField(TEXT("duration"), D)) OutData.Duration = (float)D;

	// Find arkit_raw object
	const TSharedPtr<FJsonObject>* ARKitObj = nullptr;
	if (!Root->TryGetObjectField(TEXT("arkit_raw"), ARKitObj) || !ARKitObj || !(*ARKitObj).IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("FaceAnimationLib: No 'arkit_raw' field in JSON."));
		return false;
	}

	// First pass: collect channel names and per-channel arrays to determine
	// layout (channels are stored as {name: [floats...]} in the JSON).
	TArray<FName> Names;
	TArray<TArray<float>> PerChannelArrays;
	int32 FrameCount = 0;

	for (const auto& Pair : (*ARKitObj)->Values)
	{
		const TArray<TSharedPtr<FJsonValue>>* Arr = nullptr;
		if (!Pair.Value->TryGetArray(Arr) || !Arr) continue;

		TArray<float> Vals;
		Vals.Reserve(Arr->Num());
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			Vals.Add((float)V->AsNumber());
		}

		if (FrameCount == 0)
			FrameCount = Vals.Num();

		Names.Add(FName(*Pair.Key));
		PerChannelArrays.Add(MoveTemp(Vals));
	}

	if (Names.Num() == 0 || FrameCount == 0) return false;

	// Transpose from per-channel to flat per-frame layout.
	const int32 NumCh = Names.Num();
	OutData.ChannelNames = MoveTemp(Names);
	OutData.NumChannels = NumCh;
	OutData.NumFrames = FrameCount;
	OutData.Frames.SetNumUninitialized(FrameCount * NumCh);

	for (int32 F = 0; F < FrameCount; ++F)
	{
		for (int32 C = 0; C < NumCh; ++C)
		{
			const float Val = (F < PerChannelArrays[C].Num()) ? PerChannelArrays[C][F] : 0.f;
			OutData.Frames[F * NumCh + C] = Val;
		}
	}

	// If duration wasn't in the JSON, compute from frame count.
	if (OutData.Duration <= 0.f && OutData.Fps > 0)
		OutData.Duration = (float)FrameCount / (float)OutData.Fps;

	return true;
}

// =============================================================================
// Queries
// =============================================================================

bool UFaceAnimationLib::IsFaceDataValid(const FFaceAnimationData& Data)
{
	return Data.NumFrames > 0
		&& Data.NumChannels > 0
		&& Data.Frames.Num() == Data.NumFrames * Data.NumChannels
		&& Data.ChannelNames.Num() == Data.NumChannels;
}

TArray<FName> UFaceAnimationLib::GetChannelNames(const FFaceAnimationData& Data)
{
	return Data.ChannelNames;
}

int32 UFaceAnimationLib::GetFrameCount(const FFaceAnimationData& Data)
{
	return Data.NumFrames;
}

float UFaceAnimationLib::GetDuration(const FFaceAnimationData& Data)
{
	return Data.Duration;
}

// =============================================================================
// Sampling
// =============================================================================

static int32 FindChannelIndex(const FFaceAnimationData& Data, FName Name)
{
	for (int32 i = 0; i < Data.ChannelNames.Num(); ++i)
	{
		if (Data.ChannelNames[i] == Name) return i;
	}
	return INDEX_NONE;
}

TArray<float> UFaceAnimationLib::GetChannelCurve(const FFaceAnimationData& Data, FName ChannelName)
{
	TArray<float> Out;
	const int32 ChIdx = FindChannelIndex(Data, ChannelName);
	if (ChIdx == INDEX_NONE) return Out;

	Out.Reserve(Data.NumFrames);
	for (int32 F = 0; F < Data.NumFrames; ++F)
	{
		Out.Add(Data.Frames[F * Data.NumChannels + ChIdx]);
	}
	return Out;
}

float UFaceAnimationLib::SampleChannel(const FFaceAnimationData& Data, FName ChannelName, float TimeSeconds)
{
	const int32 ChIdx = FindChannelIndex(Data, ChannelName);
	if (ChIdx == INDEX_NONE || Data.NumFrames == 0 || Data.Duration <= 0.f) return 0.f;

	const float FrameF = FMath::Clamp(TimeSeconds / Data.Duration, 0.f, 1.f) * (Data.NumFrames - 1);
	const int32 F0 = FMath::FloorToInt32(FrameF);
	const int32 F1 = FMath::Min(F0 + 1, Data.NumFrames - 1);
	const float Alpha = FrameF - (float)F0;

	const float V0 = Data.Frames[F0 * Data.NumChannels + ChIdx];
	const float V1 = Data.Frames[F1 * Data.NumChannels + ChIdx];
	return FMath::Lerp(V0, V1, Alpha);
}

TArray<float> UFaceAnimationLib::SampleAllChannels(const FFaceAnimationData& Data, float TimeSeconds)
{
	TArray<float> Out;
	if (Data.NumFrames == 0 || Data.Duration <= 0.f || Data.NumChannels == 0)
	{
		Out.SetNumZeroed(Data.NumChannels);
		return Out;
	}

	const float FrameF = FMath::Clamp(TimeSeconds / Data.Duration, 0.f, 1.f) * (Data.NumFrames - 1);
	const int32 F0 = FMath::FloorToInt32(FrameF);
	const int32 F1 = FMath::Min(F0 + 1, Data.NumFrames - 1);
	const float Alpha = FrameF - (float)F0;

	Out.SetNum(Data.NumChannels);
	for (int32 C = 0; C < Data.NumChannels; ++C)
	{
		const float V0 = Data.Frames[F0 * Data.NumChannels + C];
		const float V1 = Data.Frames[F1 * Data.NumChannels + C];
		Out[C] = FMath::Lerp(V0, V1, Alpha);
	}
	return Out;
}

// =============================================================================
// Manipulation
// =============================================================================

FFaceAnimationData UFaceAnimationLib::ScaleChannels(
	const FFaceAnimationData& Data,
	const TArray<FName>& Channels,
	float Scale)
{
	FFaceAnimationData Out = Data; // deep copy

	// Build a set of channel indices to scale
	TArray<int32> Indices;
	for (const FName& Name : Channels)
	{
		const int32 Idx = FindChannelIndex(Data, Name);
		if (Idx != INDEX_NONE) Indices.Add(Idx);
	}

	for (int32 F = 0; F < Out.NumFrames; ++F)
	{
		for (const int32 C : Indices)
		{
			float& Val = Out.Frames[F * Out.NumChannels + C];
			Val = FMath::Clamp(Val * Scale, 0.f, 1.f);
		}
	}
	return Out;
}

FFaceAnimationData UFaceAnimationLib::BlendAnimations(
	const FFaceAnimationData& A,
	const FFaceAnimationData& B,
	float Alpha)
{
	if (!IsFaceDataValid(A)) return B;
	if (!IsFaceDataValid(B)) return A;

	FFaceAnimationData Out = A;
	const int32 MinFrames = FMath::Min(A.NumFrames, B.NumFrames);
	const int32 MinCh = FMath::Min(A.NumChannels, B.NumChannels);
	Out.NumFrames = MinFrames;
	Out.Frames.SetNum(MinFrames * Out.NumChannels);
	Out.Duration = (float)MinFrames / FMath::Max(Out.Fps, 1);

	const float AlphaClamped = FMath::Clamp(Alpha, 0.f, 1.f);
	for (int32 F = 0; F < MinFrames; ++F)
	{
		for (int32 C = 0; C < MinCh; ++C)
		{
			const float VA = A.Frames[F * A.NumChannels + C];
			const float VB = B.Frames[F * B.NumChannels + C];
			Out.Frames[F * Out.NumChannels + C] = FMath::Lerp(VA, VB, AlphaClamped);
		}
	}
	return Out;
}
