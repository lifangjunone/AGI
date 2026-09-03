// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "AudioImporterLib.generated.h"

class USoundWaveProcedural;

/** Detected audio container format. */
UENUM(BlueprintType)
enum class EAudioFormat : uint8
{
	Unknown  UMETA(DisplayName = "Unknown"),
	WAV      UMETA(DisplayName = "WAV"),
	MP3      UMETA(DisplayName = "MP3"),
	PCM16    UMETA(DisplayName = "Raw PCM 16-bit"),
};

/**
 * Static Blueprint function library for importing, decoding, converting,
 * and analysing audio data at runtime. Every function is stateless and
 * can be called from any Blueprint or C++ context.
 *
 * Designed to be procedural: each node does ONE thing.
 * Chain them together to build custom audio pipelines.
 */
UCLASS()
class AUDIO2LIPSYNC_API UAudioImporterLib : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	// ==== Base64 =========================================================

	/** Decode a base64-encoded string to raw bytes. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Base64")
	static TArray<uint8> DecodeBase64(const FString& Base64String);

	/** Encode raw bytes to a base64 string. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Base64")
	static FString EncodeBase64(const TArray<uint8>& Bytes);

	// ==== Format Detection ===============================================

	/**
	 * Detect the audio format from the first bytes of a buffer.
	 * Checks for WAV (RIFF header) and MP3 (ID3 tag or sync word).
	 * Returns PCM16 only if you explicitly know the data is raw PCM.
	 */
	UFUNCTION(BlueprintPure, Category = "Audio|Format")
	static EAudioFormat DetectAudioFormat(const TArray<uint8>& AudioBytes);

	// ==== Decode (format -> float samples) ===============================
	// These return normalized float samples (-1 to 1). They do NOT create
	// a sound wave --- use CreateSoundWave separately for that.

	/** Decode MP3 bytes to float samples. Uses dr_mp3 (no external deps). */
	UFUNCTION(BlueprintCallable, Category = "Audio|Decode",
		meta = (DisplayName = "Decode MP3 to Samples"))
	static bool DecodeMP3(const TArray<uint8>& MP3Bytes,
		TArray<float>& OutSamples, int32& OutSampleRate, int32& OutNumChannels);

	/** Decode a WAV file (RIFF/PCM) to float samples. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Decode",
		meta = (DisplayName = "Decode WAV to Samples"))
	static bool DecodeWAV(const TArray<uint8>& WAVBytes,
		TArray<float>& OutSamples, int32& OutSampleRate, int32& OutNumChannels);

	/** Interpret raw 16-bit PCM bytes as float samples (no header parsing). */
	UFUNCTION(BlueprintCallable, Category = "Audio|Decode",
		meta = (DisplayName = "Decode PCM16 to Samples"))
	static bool DecodePCM16(const TArray<uint8>& PCMBytes,
		int32 SampleRate, int32 NumChannels,
		TArray<float>& OutSamples);

	// ==== Sound Wave Creation ============================================

	/**
	 * Create a playable USoundWaveProcedural from float samples.
	 * This is a separate step from decoding so you can process samples
	 * (resample, mix, analyse) before creating the sound wave.
	 */
	UFUNCTION(BlueprintCallable, Category = "Audio|Create",
		meta = (DisplayName = "Create Sound Wave from Samples"))
	static USoundWaveProcedural* CreateSoundWave(
		const TArray<float>& Samples, int32 SampleRate, int32 NumChannels = 1);

	// ==== Convenience (chains decode + create) ===========================

	/**
	 * Auto-detect format, decode, and create a playable sound wave in one call.
	 * Handles WAV, MP3, and raw PCM16 (assumes 16kHz mono for raw PCM).
	 */
	UFUNCTION(BlueprintCallable, Category = "Audio|Import",
		meta = (DisplayName = "Import Audio from Bytes"))
	static USoundWaveProcedural* ImportAudio(const TArray<uint8>& AudioBytes);

	/**
	 * Decode base64 string, auto-detect format, and create a playable sound wave.
	 * Single node for the common case of receiving audio from an HTTP response.
	 */
	UFUNCTION(BlueprintCallable, Category = "Audio|Import",
		meta = (DisplayName = "Import Audio from Base64"))
	static USoundWaveProcedural* ImportAudioFromBase64(const FString& Base64String);

	// ==== Conversion =====================================================

	/** Float samples (-1..1) to 16-bit PCM bytes (little-endian). */
	UFUNCTION(BlueprintCallable, Category = "Audio|Convert",
		meta = (DisplayName = "Float to PCM16 Bytes"))
	static TArray<uint8> FloatToPCM16(const TArray<float>& Samples);

	/** 16-bit PCM bytes to float samples (-1..1). */
	UFUNCTION(BlueprintCallable, Category = "Audio|Convert",
		meta = (DisplayName = "PCM16 Bytes to Float"))
	static TArray<float> PCM16ToFloat(const TArray<uint8>& PCMBytes);

	/**
	 * Resample audio from one sample rate to another using linear interpolation.
	 * Useful for converting 44100 Hz MP3 audio to 16000 Hz for ML models.
	 */
	UFUNCTION(BlueprintCallable, Category = "Audio|Convert",
		meta = (DisplayName = "Resample Audio"))
	static TArray<float> ResampleAudio(
		const TArray<float>& Samples, int32 FromSampleRate, int32 ToSampleRate);

	/** Mix a multi-channel signal down to mono by averaging channels. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Convert",
		meta = (DisplayName = "Mix to Mono"))
	static TArray<float> MixToMono(const TArray<float>& Samples, int32 NumChannels);

	// ==== Encode =========================================================

	/** Wrap float samples in a WAV file (RIFF/PCM header + data). */
	UFUNCTION(BlueprintCallable, Category = "Audio|Encode",
		meta = (DisplayName = "Encode as WAV"))
	static TArray<uint8> EncodeAsWAV(
		const TArray<float>& Samples, int32 SampleRate, int32 NumChannels = 1);

	// ==== Analysis =======================================================

	/** Get the peak absolute sample value (0..1 for properly normalised audio). */
	UFUNCTION(BlueprintPure, Category = "Audio|Analysis")
	static float GetPeakLevel(const TArray<float>& Samples);

	/**
	 * Compute a windowed RMS (root-mean-square) envelope.
	 * Returns one value per window. Useful for volume visualisation or
	 * silence detection.
	 */
	UFUNCTION(BlueprintCallable, Category = "Audio|Analysis",
		meta = (DisplayName = "Get RMS Envelope"))
	static TArray<float> GetRMSEnvelope(
		const TArray<float>& Samples, int32 WindowSamples = 4096);

	// ==== Legacy (backward-compatible, kept for existing Blueprints) ======

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Import MP3 from File"))
	static USoundWaveProcedural* ImportMp3FromFile(const FString& FilePath);

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Import MP3 from Buffer"))
	static USoundWaveProcedural* ImportMp3FromBuffer(const TArray<uint8>& Buffer);

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Import PCM as Sound Wave"))
	static USoundWaveProcedural* ImportPcmAsSoundWave(
		const TArray<uint8>& PcmData, int32 SampleRate = 24000, int32 NumChannels = 1);

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Import MP3 and Get Float Samples"))
	static bool ImportMp3AndGetFloatSamples(const TArray<uint8>& Mp3Buffer,
		USoundWaveProcedural*& OutSoundWave, TArray<float>& OutFloatSamples);

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Import PCM and Get Float Samples"))
	static bool ImportPcmAndGetFloatSamples(const TArray<uint8>& InPcmData,
		int32 SampleRate, int32 NumChannels,
		USoundWaveProcedural*& OutSoundWave, TArray<float>& OutFloatSamples);

	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy")
	static TArray<uint8> CreateMultipartWavPayload(const TArray<uint8>& PcmData,
		int32 SampleRate, int32 NumChannels,
		const FString& Model, const FString& Task, FString& OutBoundary);

	/** @deprecated Use FloatToPCM16 instead. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Convert Float to PCM16 (Legacy)"))
	static TArray<uint8> ConvertFloatSamplesTo16BitPCMUints(const TArray<float>& InSamples);

	/** @deprecated Use PCM16ToFloat instead. */
	UFUNCTION(BlueprintCallable, Category = "Audio|Legacy",
		meta = (DisplayName = "Convert PCM16 to Float (Legacy)"))
	static TArray<float> Convert16BitPCMUintsToFloatSamples(const TArray<uint8>& InPcmData);
};

