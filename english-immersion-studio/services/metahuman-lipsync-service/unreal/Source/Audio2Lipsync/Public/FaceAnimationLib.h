#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "FaceAnimationLib.generated.h"

/**
 * A block of per-frame face animation data (ARKit blendshape format).
 *
 * Frames are stored flat: FrameData[FrameIndex * NumChannels + ChannelIndex].
 * This is the format returned by the LipSync / Text2Face servers and consumed
 * by ULiveLinkFaceComponent.
 */
USTRUCT(BlueprintType)
struct AUDIO2LIPSYNC_API FFaceAnimationData
{
	GENERATED_BODY()

	/** Channel names in order (e.g., "EyeBlinkLeft", "JawOpen", ...). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	TArray<FName> ChannelNames;

	/**
	 * Flat array of per-frame values.
	 * Layout: [frame0_ch0, frame0_ch1, ..., frame0_chN, frame1_ch0, ...]
	 * Total size = NumFrames * NumChannels.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	TArray<float> Frames;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	int32 NumFrames = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	int32 NumChannels = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	float Duration = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Face Animation")
	int32 Fps = 60;
};

/**
 * Static Blueprint function library for parsing, sampling, and manipulating
 * face animation data. All functions are pure/static --- no state, no
 * component required. Chain them in Blueprint to build custom pipelines.
 */
UCLASS()
class AUDIO2LIPSYNC_API UFaceAnimationLib : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	// ---- Parsing --------------------------------------------------------

	/**
	 * Parse a JSON string containing "arkit_raw" face animation data
	 * (the format returned by the LipSync and Text2Face servers).
	 *
	 * Expected shape: {"arkit_raw": {"JawOpen": [0.1, 0.2, ...], ...}, "fps": 60, "duration": 3.2, ...}
	 */
	UFUNCTION(BlueprintCallable, Category = "Face Animation|Parse")
	static bool ParseFaceAnimJSON(const FString& JsonString, FFaceAnimationData& OutData);

	// ---- Queries --------------------------------------------------------

	/** Check whether the data has valid content (non-zero frames and channels). */
	UFUNCTION(BlueprintPure, Category = "Face Animation|Query")
	static bool IsFaceDataValid(const FFaceAnimationData& Data);

	/** Get the list of channel names. */
	UFUNCTION(BlueprintPure, Category = "Face Animation|Query")
	static TArray<FName> GetChannelNames(const FFaceAnimationData& Data);

	/** Get the number of frames. */
	UFUNCTION(BlueprintPure, Category = "Face Animation|Query")
	static int32 GetFrameCount(const FFaceAnimationData& Data);

	/** Get the animation duration in seconds. */
	UFUNCTION(BlueprintPure, Category = "Face Animation|Query")
	static float GetDuration(const FFaceAnimationData& Data);

	// ---- Sampling -------------------------------------------------------

	/** Get the full curve (all frame values) for a single channel by name. */
	UFUNCTION(BlueprintCallable, Category = "Face Animation|Sample")
	static TArray<float> GetChannelCurve(const FFaceAnimationData& Data, FName ChannelName);

	/**
	 * Sample a channel at a specific time (seconds), with linear interpolation
	 * between frames. Returns 0 if the channel is not found.
	 */
	UFUNCTION(BlueprintPure, Category = "Face Animation|Sample")
	static float SampleChannel(const FFaceAnimationData& Data, FName ChannelName, float TimeSeconds);

	/**
	 * Sample ALL channels at a given time, returning one float per channel.
	 * The output array order matches Data.ChannelNames.
	 */
	UFUNCTION(BlueprintCallable, Category = "Face Animation|Sample")
	static TArray<float> SampleAllChannels(const FFaceAnimationData& Data, float TimeSeconds);

	// ---- Manipulation ---------------------------------------------------

	/**
	 * Scale specific channels by a multiplier. Useful for amplifying mouth
	 * movement, dampening eye blinks, etc. Returns a new copy.
	 */
	UFUNCTION(BlueprintCallable, Category = "Face Animation|Manipulate")
	static FFaceAnimationData ScaleChannels(
		const FFaceAnimationData& Data,
		const TArray<FName>& ChannelNames,
		float Scale);

	/**
	 * Blend two face animations together. Alpha=0 is fully A, Alpha=1 is
	 * fully B. Both must have the same channel layout. Frame counts are
	 * matched to the shorter of the two.
	 */
	UFUNCTION(BlueprintCallable, Category = "Face Animation|Manipulate")
	static FFaceAnimationData BlendAnimations(
		const FFaceAnimationData& A,
		const FFaceAnimationData& B,
		float Alpha);
};
