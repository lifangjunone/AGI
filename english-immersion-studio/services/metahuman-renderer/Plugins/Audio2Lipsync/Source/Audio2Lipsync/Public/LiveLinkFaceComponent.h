#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "FaceAnimationLib.h"
#include "Interfaces/IHttpRequest.h"
#include "LiveLinkFaceComponent.generated.h"

class ILiveLinkSource;
class USoundWaveProcedural;
class UAudioComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnFacePlaybackFinished);

/**
 * Drives face animation on a MetaHuman (or any ARKit-compatible character)
 * via Unreal's LiveLink system, with optional synchronised audio playback.
 *
 * Two modes of operation:
 *
 * HIGH-LEVEL (automated):
 *   Call PlayAnimation() or PlayWithAudio() with an FFaceAnimationData struct.
 *   The component handles frame interpolation, LiveLink push, and audio sync.
 *   Or call FetchAndPlay(URL) to HTTP GET + parse + play in one call.
 *
 * LOW-LEVEL (manual):
 *   Call InitSource() once with channel names, then call PushFrame() every
 *   tick with your own per-frame values. You control timing completely.
 *
 * The LiveLink source is created and registered automatically. The subject
 * name is configurable. The component cleans up the source on EndPlay.
 *
 * Works with the standard MetaHuman ABP_MH_LiveLink setup: push ARKit
 * channel names, the AnimBP's PA_MetaHuman_ARKit_Mapping handles the
 * conversion to MetaHuman rig curves internally.
 */
UCLASS(ClassGroup = (Animation), meta = (BlueprintSpawnableComponent))
class AUDIO2LIPSYNC_API ULiveLinkFaceComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	ULiveLinkFaceComponent();

	// ---- Config ---------------------------------------------------------

	/**
	 * LiveLink subject name. Must match what the MetaHuman's face AnimBP
	 * listens for (e.g., "FaceAnimation" or "TextToFace").
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "LiveLink Face")
	FName SubjectName = FName(TEXT("FaceAnimation"));

	// ---- High-Level API -------------------------------------------------

	/** Play a face animation. Starts LiveLink push on the next tick. */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Playback")
	void PlayAnimation(const FFaceAnimationData& Data);

	/**
	 * Play a face animation with synchronised audio. The audio starts on
	 * the same tick as the first LiveLink frame push.
	 */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Playback")
	void PlayWithAudio(const FFaceAnimationData& Data, USoundWaveProcedural* Audio);

	/**
	 * HTTP GET a URL, parse the JSON response as face animation data
	 * (expects "arkit_raw" format), and start playing. If the response
	 * also contains "audio_base64", it is decoded and played in sync.
	 */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Playback")
	void FetchAndPlay(const FString& URL);

	// ---- Low-Level API --------------------------------------------------

	/**
	 * Initialise the LiveLink source with a set of channel names.
	 * Call once before using PushFrame(). Call ClearSource() to tear down.
	 */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Manual")
	void InitSource(const TArray<FName>& ChannelNames);

	/**
	 * Push a single frame of values to LiveLink. The array must match the
	 * channel count from InitSource(). Call this every tick or at your
	 * own rate.
	 */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Manual")
	void PushFrame(const TArray<float>& Values);

	/** Tear down the LiveLink source created by InitSource(). */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Manual")
	void ClearSource();

	// ---- Controls -------------------------------------------------------

	/** Stop the current high-level playback (if any). */
	UFUNCTION(BlueprintCallable, Category = "LiveLink Face|Playback")
	void Stop();

	/** Is high-level playback currently active? */
	UFUNCTION(BlueprintPure, Category = "LiveLink Face|Playback")
	bool IsPlaying() const;

	/** Current playback progress (0 to 1). */
	UFUNCTION(BlueprintPure, Category = "LiveLink Face|Playback")
	float GetProgress() const;

	// ---- Events ---------------------------------------------------------

	/** Fired when high-level playback finishes (animation reaches the end). */
	UPROPERTY(BlueprintAssignable, Category = "LiveLink Face")
	FOnFacePlaybackFinished OnPlaybackFinished;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType,
		FActorComponentTickFunction* ThisTickFunction) override;

private:
	void EnsureLiveLinkSource();
	void PushInterpolatedFrame();
	void HandleFetchResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);

	// Find or create an AudioComponent on the owning actor
	UAudioComponent* GetOrCreateAudioComponent();

	// LiveLink source (implementation hidden in .cpp)
	TSharedPtr<ILiveLinkSource> Source;

	// High-level playback state
	FFaceAnimationData CurrentData;
	double PlayStartTime = -1.0;
	bool bPlaybackActive = false;

	// Audio sync
	UPROPERTY()
	TObjectPtr<USoundWaveProcedural> PendingAudio;
};
