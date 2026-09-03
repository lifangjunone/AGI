#include "LiveLinkFaceComponent.h"
#include "AudioImporterLib.h"
#include "FaceAnimationLib.h"

#include "Sound/SoundWaveProcedural.h"
#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Features/IModularFeatures.h"
#include "ILiveLinkSource.h"
#include "ILiveLinkClient.h"
#include "LiveLinkTypes.h"
#include "Roles/LiveLinkBasicRole.h"

DEFINE_LOG_CATEGORY_STATIC(LogLiveLinkFace, Log, All);

// =============================================================================
// Internal LiveLink source (private implementation, never exposed to users)
// =============================================================================

class FLiveLinkFaceSource final : public ILiveLinkSource
{
public:
	explicit FLiveLinkFaceSource(FName InSubjectName)
		: SubjectName(InSubjectName)
	{
	}

	// -- ILiveLinkSource interface ----------------------------------------
	// (matches the proven working implementation from MH_Express_Test)

	virtual void ReceiveClient(ILiveLinkClient* InClient, FGuid InSourceGuid) override
	{
		Client = InClient;
		SourceGuid = InSourceGuid;
		UE_LOG(LogLiveLinkFace, Log, TEXT("LiveLink source registered, GUID=%s, Subject=%s"),
			*SourceGuid.ToString(), *SubjectName.ToString());
	}

	virtual void InitializeSettings(ULiveLinkSourceSettings* Settings) override {}
	virtual void Update() override {}

	virtual bool IsSourceStillValid() const override { return bIsValid; }

	virtual bool RequestSourceShutdown() override
	{
		bIsValid = false;
		Client = nullptr;
		UE_LOG(LogLiveLinkFace, Log, TEXT("LiveLink source shutdown"));
		return true;
	}

	virtual FText GetSourceType() const override
	{
		return FText::FromString(TEXT("Face Animation"));
	}

	virtual FText GetSourceMachineName() const override
	{
		return FText::FromString(TEXT("localhost"));
	}

	virtual FText GetSourceStatus() const override
	{
		return bIsValid
			? FText::FromString(TEXT("Active"))
			: FText::FromString(TEXT("Inactive"));
	}

	// -- Custom API -------------------------------------------------------

	bool IsReady() const { return Client != nullptr && bIsValid; }

	void PushStaticData(const TArray<FName>& PropertyNames)
	{
		if (!Client || !bIsValid) return;

		FLiveLinkStaticDataStruct StaticData(FLiveLinkBaseStaticData::StaticStruct());
		FLiveLinkBaseStaticData* BaseData = StaticData.Cast<FLiveLinkBaseStaticData>();
		BaseData->PropertyNames = PropertyNames;

		const FLiveLinkSubjectKey SubjectKey(SourceGuid, SubjectName);
		Client->PushSubjectStaticData_AnyThread(
			SubjectKey, ULiveLinkBasicRole::StaticClass(), MoveTemp(StaticData));

		bStaticDataPushed = true;
		UE_LOG(LogLiveLinkFace, Log, TEXT("LiveLink static data pushed: %d channels on '%s'"),
			PropertyNames.Num(), *SubjectName.ToString());
	}

	void PushFrameData(const TArray<float>& Values)
	{
		if (!Client || !bIsValid || !bStaticDataPushed) return;

		FLiveLinkFrameDataStruct FrameData(FLiveLinkBaseFrameData::StaticStruct());
		FLiveLinkBaseFrameData* BaseData = FrameData.Cast<FLiveLinkBaseFrameData>();
		BaseData->PropertyValues = Values;
		BaseData->WorldTime = FLiveLinkWorldTime(FPlatformTime::Seconds());

		const FLiveLinkSubjectKey SubjectKey(SourceGuid, SubjectName);
		Client->PushSubjectFrameData_AnyThread(
			SubjectKey, MoveTemp(FrameData));
	}

private:
	FName SubjectName;
	ILiveLinkClient* Client = nullptr;
	FGuid SourceGuid;
	bool bIsValid = true;
	bool bStaticDataPushed = false;
};

// =============================================================================
// ULiveLinkFaceComponent
// =============================================================================

ULiveLinkFaceComponent::ULiveLinkFaceComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

// ---- Lifecycle ----------------------------------------------------------

void ULiveLinkFaceComponent::BeginPlay()
{
	Super::BeginPlay();
	EnsureLiveLinkSource();
}

void ULiveLinkFaceComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (Source.IsValid())
	{
		// Push a neutral (all-zero) frame so the face snaps back to rest
		// rather than freezing in the last pose between PIE sessions.
		auto* Src = StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get();
		if (Src && Src->IsReady() && CurrentData.NumChannels > 0)
		{
			TArray<float> Zeros;
			Zeros.SetNumZeroed(CurrentData.NumChannels);
			Src->PushFrameData(Zeros);
		}

		// Properly remove the source from the LiveLink client's registry.
		// Just calling RequestSourceShutdown() on the source leaves a stale
		// entry in the client, which breaks the next PIE session.
		IModularFeatures& MF = IModularFeatures::Get();
		if (MF.IsModularFeatureAvailable(ILiveLinkClient::ModularFeatureName))
		{
			ILiveLinkClient& Client = MF.GetModularFeature<ILiveLinkClient>(
				ILiveLinkClient::ModularFeatureName);
			Client.RemoveSource(Source);
		}
		Source.Reset();
	}
	bPlaybackActive = false;
	PlayStartTime = -1.0;
	Super::EndPlay(EndPlayReason);
}

void ULiveLinkFaceComponent::EnsureLiveLinkSource()
{
	if (Source.IsValid()) return;

	IModularFeatures& MF = IModularFeatures::Get();
	if (!MF.IsModularFeatureAvailable(ILiveLinkClient::ModularFeatureName))
	{
		UE_LOG(LogLiveLinkFace, Warning,
			TEXT("LiveLink client not available. Is the LiveLink plugin enabled?"));
		return;
	}

	auto NewSource = MakeShared<FLiveLinkFaceSource>(SubjectName);
	Source = NewSource;

	ILiveLinkClient& Client = MF.GetModularFeature<ILiveLinkClient>(
		ILiveLinkClient::ModularFeatureName);
	Client.AddSource(Source);

	UE_LOG(LogLiveLinkFace, Log, TEXT("LiveLink source created, subject='%s'"),
		*SubjectName.ToString());
}

// ---- Tick (high-level playback) -----------------------------------------

void ULiveLinkFaceComponent::TickComponent(float DeltaTime, ELevelTick TickType,
	FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (!bPlaybackActive) return;

	PushInterpolatedFrame();
}

void ULiveLinkFaceComponent::PushInterpolatedFrame()
{
	if (!Source.IsValid() || PlayStartTime < 0.0) return;

	const UWorld* World = GetWorld();
	if (!World) return;

	const double Elapsed = World->GetTimeSeconds() - PlayStartTime;
	if (Elapsed < 0.0) return;

	auto* Src = StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get();
	if (!Src || !Src->IsReady()) return;

	if (Elapsed >= (double)CurrentData.Duration)
	{
		// Playback finished — push zeros then stop
		TArray<float> Zeros;
		Zeros.SetNumZeroed(CurrentData.NumChannels);
		Src->PushFrameData(Zeros);

		bPlaybackActive = false;
		PlayStartTime = -1.0;
		OnPlaybackFinished.Broadcast();
		return;
	}

	// Interpolate all channels at current time
	const TArray<float> Values = UFaceAnimationLib::SampleAllChannels(
		CurrentData, (float)Elapsed);
	Src->PushFrameData(Values);
}

// ---- High-Level API -----------------------------------------------------

void ULiveLinkFaceComponent::PlayAnimation(const FFaceAnimationData& Data)
{
	if (!UFaceAnimationLib::IsFaceDataValid(Data))
	{
		UE_LOG(LogLiveLinkFace, Warning, TEXT("PlayAnimation: Invalid face data."));
		return;
	}

	EnsureLiveLinkSource();
	auto* Src = StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get();
	if (!Src) return;

	CurrentData = Data;
	Src->PushStaticData(Data.ChannelNames);

	const UWorld* World = GetWorld();
	PlayStartTime = World ? World->GetTimeSeconds() : 0.0;
	bPlaybackActive = true;

	UE_LOG(LogLiveLinkFace, Log, TEXT("PlayAnimation: %d channels x %d frames (%.2fs)"),
		Data.NumChannels, Data.NumFrames, Data.Duration);
}

void ULiveLinkFaceComponent::PlayWithAudio(const FFaceAnimationData& Data, USoundWaveProcedural* Audio)
{
	PlayAnimation(Data);

	if (Audio)
	{
		UAudioComponent* AC = GetOrCreateAudioComponent();
		if (AC)
		{
			AC->SetSound(Audio);
			AC->Play();
		}
	}
}

void ULiveLinkFaceComponent::FetchAndPlay(const FString& URL)
{
	const TSharedRef<IHttpRequest> Req = FHttpModule::Get().CreateRequest();
	Req->SetVerb(TEXT("GET"));
	Req->SetURL(URL);
	Req->SetTimeout(15.f);
	Req->OnProcessRequestComplete().BindUObject(this, &ULiveLinkFaceComponent::HandleFetchResponse);

	if (!Req->ProcessRequest())
	{
		UE_LOG(LogLiveLinkFace, Warning, TEXT("FetchAndPlay: HTTP request failed to start for %s"), *URL);
	}
}

void ULiveLinkFaceComponent::HandleFetchResponse(
	FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
	if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
	{
		UE_LOG(LogLiveLinkFace, Warning, TEXT("FetchAndPlay: HTTP error (code %d)."),
			Response.IsValid() ? Response->GetResponseCode() : -1);
		return;
	}

	const FString Body = Response->GetContentAsString();

	// Parse face animation data
	FFaceAnimationData Data;
	if (!UFaceAnimationLib::ParseFaceAnimJSON(Body, Data))
	{
		UE_LOG(LogLiveLinkFace, Warning, TEXT("FetchAndPlay: Failed to parse face animation JSON."));
		return;
	}

	// Check for audio_base64 in the response
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	USoundWaveProcedural* Audio = nullptr;
	if (FJsonSerializer::Deserialize(Reader, Root) && Root.IsValid())
	{
		FString AudioB64;
		if (Root->TryGetStringField(TEXT("audio_base64"), AudioB64) && !AudioB64.IsEmpty())
		{
			Audio = UAudioImporterLib::ImportAudioFromBase64(AudioB64);
		}
	}

	if (Audio)
	{
		PlayWithAudio(Data, Audio);
	}
	else
	{
		PlayAnimation(Data);
	}
}

// ---- Low-Level API ------------------------------------------------------

void ULiveLinkFaceComponent::InitSource(const TArray<FName>& ChannelNames)
{
	EnsureLiveLinkSource();
	auto* Src = StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get();
	if (Src)
	{
		Src->PushStaticData(ChannelNames);
	}
}

void ULiveLinkFaceComponent::PushFrame(const TArray<float>& Values)
{
	auto* Src = Source.IsValid()
		? StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get()
		: nullptr;
	if (Src && Src->IsReady())
	{
		Src->PushFrameData(Values);
	}
}

void ULiveLinkFaceComponent::ClearSource()
{
	if (Source.IsValid())
	{
		IModularFeatures& MF = IModularFeatures::Get();
		if (MF.IsModularFeatureAvailable(ILiveLinkClient::ModularFeatureName))
		{
			ILiveLinkClient& Client = MF.GetModularFeature<ILiveLinkClient>(
				ILiveLinkClient::ModularFeatureName);
			Client.RemoveSource(Source);
		}
		Source.Reset();
	}
}

// ---- Controls -----------------------------------------------------------

void ULiveLinkFaceComponent::Stop()
{
	if (bPlaybackActive)
	{
		// Push zeros to clear the face
		auto* Src = Source.IsValid()
			? StaticCastSharedPtr<FLiveLinkFaceSource>(Source).Get()
			: nullptr;
		if (Src && Src->IsReady() && CurrentData.NumChannels > 0)
		{
			TArray<float> Zeros;
			Zeros.SetNumZeroed(CurrentData.NumChannels);
			Src->PushFrameData(Zeros);
		}

		bPlaybackActive = false;
		PlayStartTime = -1.0;
	}

	// Stop audio
	UAudioComponent* AC = GetOrCreateAudioComponent();
	if (AC && AC->IsPlaying())
	{
		AC->Stop();
	}
}

bool ULiveLinkFaceComponent::IsPlaying() const
{
	return bPlaybackActive;
}

float ULiveLinkFaceComponent::GetProgress() const
{
	if (!bPlaybackActive || PlayStartTime < 0.0 || CurrentData.Duration <= 0.f)
		return 0.f;

	const UWorld* World = GetWorld();
	if (!World) return 0.f;

	const double Elapsed = World->GetTimeSeconds() - PlayStartTime;
	return FMath::Clamp((float)(Elapsed / CurrentData.Duration), 0.f, 1.f);
}

// ---- Audio component helper ---------------------------------------------

UAudioComponent* ULiveLinkFaceComponent::GetOrCreateAudioComponent()
{
	AActor* Owner = GetOwner();
	if (!Owner) return nullptr;

	// Look for an existing AudioComponent on the actor
	UAudioComponent* AC = Owner->FindComponentByClass<UAudioComponent>();
	if (AC) return AC;

	// Create one dynamically
	AC = NewObject<UAudioComponent>(Owner, TEXT("FaceAudioComponent"));
	if (AC)
	{
		AC->bAutoActivate = false;
		AC->bAutoDestroy = false;
		AC->RegisterComponent();
		Owner->AddInstanceComponent(AC);
	}
	return AC;
}
