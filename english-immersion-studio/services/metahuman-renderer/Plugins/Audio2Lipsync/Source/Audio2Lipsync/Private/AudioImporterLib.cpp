#include "AudioImporterLib.h"

#include "Sound/SoundWaveProcedural.h"
#include "HAL/FileManager.h"
#include "Misc/Base64.h"
#include "Misc/Guid.h"

#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"

#define DR_MP3_IMPLEMENTATION
#include "dr_mp3.h"

#include "AudioCaptureComponent.h"
#include "DSP/SampleRateConverter.h"
#include "AudioDevice.h"

DEFINE_LOG_CATEGORY_STATIC(LogAudioImporter, Log, All);

// =============================================================================
// Base64
// =============================================================================

TArray<uint8> UAudioImporterLib::DecodeBase64(const FString& Base64String)
{
	TArray<uint8> Decoded;
	FBase64::Decode(Base64String, Decoded);
	return Decoded;
}

FString UAudioImporterLib::EncodeBase64(const TArray<uint8>& Bytes)
{
	return FBase64::Encode(Bytes);
}

// =============================================================================
// Format Detection
// =============================================================================

EAudioFormat UAudioImporterLib::DetectAudioFormat(const TArray<uint8>& AudioBytes)
{
	if (AudioBytes.Num() < 4) return EAudioFormat::Unknown;

	// WAV: starts with "RIFF"
	if (AudioBytes[0] == 'R' && AudioBytes[1] == 'I' &&
		AudioBytes[2] == 'F' && AudioBytes[3] == 'F')
	{
		return EAudioFormat::WAV;
	}

	// MP3: ID3 tag or MPEG sync word
	if ((AudioBytes[0] == 'I' && AudioBytes[1] == 'D' && AudioBytes[2] == '3') ||
		(AudioBytes[0] == 0xFF && (AudioBytes[1] & 0xE0) == 0xE0))
	{
		return EAudioFormat::MP3;
	}

	return EAudioFormat::Unknown;
}

// =============================================================================
// Decode: MP3
// =============================================================================

bool UAudioImporterLib::DecodeMP3(const TArray<uint8>& MP3Bytes,
	TArray<float>& OutSamples, int32& OutSampleRate, int32& OutNumChannels)
{
	OutSamples.Reset();
	OutSampleRate = 0;
	OutNumChannels = 0;

	if (MP3Bytes.Num() == 0) return false;

	drmp3_config Config;
	drmp3_uint64 TotalFrames;
	float* pDecoded = drmp3_open_memory_and_read_pcm_frames_f32(
		MP3Bytes.GetData(), MP3Bytes.Num(), &Config, &TotalFrames, nullptr);

	if (!pDecoded)
	{
		UE_LOG(LogAudioImporter, Warning, TEXT("DecodeMP3: dr_mp3 failed to decode."));
		return false;
	}

	OutSampleRate = Config.sampleRate;
	OutNumChannels = Config.channels;

	const int32 NumSamples = (int32)(TotalFrames * Config.channels);
	OutSamples.SetNumUninitialized(NumSamples);
	FMemory::Memcpy(OutSamples.GetData(), pDecoded, NumSamples * sizeof(float));

	drmp3_free(pDecoded, nullptr);
	return true;
}

// =============================================================================
// Decode: WAV
// =============================================================================

bool UAudioImporterLib::DecodeWAV(const TArray<uint8>& WAVBytes,
	TArray<float>& OutSamples, int32& OutSampleRate, int32& OutNumChannels)
{
	OutSamples.Reset();
	OutSampleRate = 0;
	OutNumChannels = 0;

	if (WAVBytes.Num() < 44)
	{
		UE_LOG(LogAudioImporter, Warning, TEXT("DecodeWAV: Buffer too small for WAV header."));
		return false;
	}

	const uint8* D = WAVBytes.GetData();

	// Verify RIFF header
	if (D[0] != 'R' || D[1] != 'I' || D[2] != 'F' || D[3] != 'F') return false;
	if (D[8] != 'W' || D[9] != 'A' || D[10] != 'V' || D[11] != 'E') return false;

	// Scan for "fmt " chunk (may not be at offset 12 if there are extra chunks)
	int32 Pos = 12;
	int32 FmtPos = -1;
	while (Pos + 8 <= WAVBytes.Num())
	{
		if (D[Pos] == 'f' && D[Pos + 1] == 'm' && D[Pos + 2] == 't' && D[Pos + 3] == ' ')
		{
			FmtPos = Pos;
			break;
		}
		const uint32 ChunkSize = *(const uint32*)(D + Pos + 4);
		Pos += 8 + ChunkSize;
	}
	if (FmtPos < 0) return false;

	const uint16 AudioFormat = *(const uint16*)(D + FmtPos + 8);
	if (AudioFormat != 1) // only PCM supported
	{
		UE_LOG(LogAudioImporter, Warning, TEXT("DecodeWAV: Only PCM format supported (got %d)."), AudioFormat);
		return false;
	}

	OutNumChannels = *(const uint16*)(D + FmtPos + 10);
	OutSampleRate = *(const int32*)(D + FmtPos + 12);
	const uint16 BitsPerSample = *(const uint16*)(D + FmtPos + 22);

	// Scan for "data" chunk
	const uint32 FmtChunkSize = *(const uint32*)(D + FmtPos + 4);
	Pos = FmtPos + 8 + FmtChunkSize;
	int32 DataPos = -1;
	uint32 DataSize = 0;
	while (Pos + 8 <= WAVBytes.Num())
	{
		if (D[Pos] == 'd' && D[Pos + 1] == 'a' && D[Pos + 2] == 't' && D[Pos + 3] == 'a')
		{
			DataPos = Pos + 8;
			DataSize = *(const uint32*)(D + Pos + 4);
			break;
		}
		const uint32 ChunkSize = *(const uint32*)(D + Pos + 4);
		Pos += 8 + ChunkSize;
	}
	if (DataPos < 0) return false;

	// Clamp DataSize to actual buffer
	DataSize = FMath::Min(DataSize, (uint32)(WAVBytes.Num() - DataPos));

	// Convert to float samples
	if (BitsPerSample == 16)
	{
		const int32 NumSamples = DataSize / 2;
		OutSamples.SetNumUninitialized(NumSamples);
		const int16* PCM = (const int16*)(D + DataPos);
		for (int32 i = 0; i < NumSamples; ++i)
		{
			OutSamples[i] = (float)PCM[i] / 32767.f;
		}
	}
	else if (BitsPerSample == 24)
	{
		const int32 NumSamples = DataSize / 3;
		OutSamples.SetNumUninitialized(NumSamples);
		for (int32 i = 0; i < NumSamples; ++i)
		{
			const int32 S = (D[DataPos + i * 3] << 8) | (D[DataPos + i * 3 + 1] << 16)
				| (D[DataPos + i * 3 + 2] << 24);
			OutSamples[i] = (float)(S >> 8) / 8388607.f;
		}
	}
	else if (BitsPerSample == 32)
	{
		const int32 NumSamples = DataSize / 4;
		OutSamples.SetNumUninitialized(NumSamples);
		const int32* PCM = (const int32*)(D + DataPos);
		for (int32 i = 0; i < NumSamples; ++i)
		{
			OutSamples[i] = (float)PCM[i] / 2147483647.f;
		}
	}
	else
	{
		UE_LOG(LogAudioImporter, Warning, TEXT("DecodeWAV: Unsupported bits per sample: %d"), BitsPerSample);
		return false;
	}

	return true;
}

// =============================================================================
// Decode: raw PCM16
// =============================================================================

bool UAudioImporterLib::DecodePCM16(const TArray<uint8>& PCMBytes,
	int32 SampleRate, int32 NumChannels, TArray<float>& OutSamples)
{
	if (PCMBytes.Num() < 2) return false;

	const int32 NumSamples = PCMBytes.Num() / 2;
	OutSamples.SetNumUninitialized(NumSamples);
	const int16* PCM = (const int16*)PCMBytes.GetData();
	for (int32 i = 0; i < NumSamples; ++i)
	{
		OutSamples[i] = (float)PCM[i] / 32767.f;
	}
	return true;
}

// =============================================================================
// Sound Wave Creation
// =============================================================================

USoundWaveProcedural* UAudioImporterLib::CreateSoundWave(
	const TArray<float>& Samples, int32 SampleRate, int32 NumChannels)
{
	if (Samples.Num() == 0 || SampleRate <= 0 || NumChannels <= 0) return nullptr;

	USoundWaveProcedural* SW = NewObject<USoundWaveProcedural>();
	if (!SW) return nullptr;

	SW->SetSampleRate(SampleRate);
	SW->NumChannels = NumChannels;
	SW->Duration = (float)Samples.Num() / (float)(SampleRate * NumChannels);
	SW->SoundGroup = SOUNDGROUP_Voice;
	SW->bLooping = false;

	// Convert float → int16 PCM for QueueAudio
	TArray<int16> PCM;
	PCM.SetNumUninitialized(Samples.Num());
	for (int32 i = 0; i < Samples.Num(); ++i)
	{
		PCM[i] = (int16)(FMath::Clamp(Samples[i], -1.f, 1.f) * 32767.f);
	}
	SW->QueueAudio((const uint8*)PCM.GetData(), PCM.Num() * sizeof(int16));

	return SW;
}

// =============================================================================
// Convenience: auto-detect + decode + create
// =============================================================================

USoundWaveProcedural* UAudioImporterLib::ImportAudio(const TArray<uint8>& AudioBytes)
{
	TArray<float> Samples;
	int32 SR = 0, Ch = 0;

	const EAudioFormat Fmt = DetectAudioFormat(AudioBytes);
	switch (Fmt)
	{
	case EAudioFormat::WAV:
		if (!DecodeWAV(AudioBytes, Samples, SR, Ch)) return nullptr;
		break;
	case EAudioFormat::MP3:
		if (!DecodeMP3(AudioBytes, Samples, SR, Ch)) return nullptr;
		break;
	default:
		// Assume raw PCM16 at 16kHz mono (common for TTS APIs)
		SR = 16000; Ch = 1;
		if (!DecodePCM16(AudioBytes, SR, Ch, Samples)) return nullptr;
		break;
	}

	return CreateSoundWave(Samples, SR, Ch);
}

USoundWaveProcedural* UAudioImporterLib::ImportAudioFromBase64(const FString& Base64String)
{
	const TArray<uint8> Bytes = DecodeBase64(Base64String);
	if (Bytes.Num() == 0)
	{
		UE_LOG(LogAudioImporter, Warning, TEXT("ImportAudioFromBase64: Empty after base64 decode."));
		return nullptr;
	}
	return ImportAudio(Bytes);
}

// =============================================================================
// Conversion
// =============================================================================

TArray<uint8> UAudioImporterLib::FloatToPCM16(const TArray<float>& Samples)
{
	TArray<uint8> Out;
	Out.Reserve(Samples.Num() * 2);
	for (const float S : Samples)
	{
		const int16 V = (int16)(FMath::Clamp(S, -1.f, 1.f) * 32767.f);
		Out.Add(V & 0xFF);
		Out.Add((V >> 8) & 0xFF);
	}
	return Out;
}

TArray<float> UAudioImporterLib::PCM16ToFloat(const TArray<uint8>& PCMBytes)
{
	TArray<float> Out;
	Out.Reserve(PCMBytes.Num() / 2);
	for (int32 i = 0; i + 1 < PCMBytes.Num(); i += 2)
	{
		const int16 V = (int16)((PCMBytes[i + 1] << 8) | PCMBytes[i]);
		Out.Add((float)V / 32767.f);
	}
	return Out;
}

TArray<float> UAudioImporterLib::ResampleAudio(
	const TArray<float>& Samples, int32 FromSampleRate, int32 ToSampleRate)
{
	if (Samples.Num() == 0 || FromSampleRate <= 0 || ToSampleRate <= 0)
		return Samples;
	if (FromSampleRate == ToSampleRate)
		return Samples;

	const double Ratio = (double)ToSampleRate / (double)FromSampleRate;
	const int32 OutLen = FMath::RoundToInt32(Samples.Num() * Ratio);
	TArray<float> Out;
	Out.SetNumUninitialized(OutLen);

	for (int32 i = 0; i < OutLen; ++i)
	{
		const double SrcIdx = (double)i / Ratio;
		const int32 I0 = FMath::FloorToInt32(SrcIdx);
		const int32 I1 = FMath::Min(I0 + 1, Samples.Num() - 1);
		const float Alpha = (float)(SrcIdx - (double)I0);
		Out[i] = FMath::Lerp(Samples[I0], Samples[I1], Alpha);
	}
	return Out;
}

TArray<float> UAudioImporterLib::MixToMono(const TArray<float>& Samples, int32 NumChannels)
{
	if (NumChannels <= 1 || Samples.Num() == 0) return Samples;

	const int32 NumFrames = Samples.Num() / NumChannels;
	TArray<float> Out;
	Out.SetNumUninitialized(NumFrames);

	for (int32 F = 0; F < NumFrames; ++F)
	{
		float Sum = 0.f;
		for (int32 C = 0; C < NumChannels; ++C)
		{
			Sum += Samples[F * NumChannels + C];
		}
		Out[F] = Sum / (float)NumChannels;
	}
	return Out;
}

// =============================================================================
// Encode
// =============================================================================

TArray<uint8> UAudioImporterLib::EncodeAsWAV(
	const TArray<float>& Samples, int32 SampleRate, int32 NumChannels)
{
	TArray<uint8> Out;
	const TArray<uint8> PCM = FloatToPCM16(Samples);
	const uint32 DataSize = PCM.Num();
	const uint32 FileSize = 36 + DataSize;

	// RIFF header
	Out.Append((const uint8*)"RIFF", 4);
	Out.Append((const uint8*)&FileSize, 4);
	Out.Append((const uint8*)"WAVE", 4);

	// fmt chunk
	Out.Append((const uint8*)"fmt ", 4);
	const uint32 FmtSize = 16;
	Out.Append((const uint8*)&FmtSize, 4);
	const uint16 AudioFmt = 1; // PCM
	Out.Append((const uint8*)&AudioFmt, 2);
	const uint16 Ch = (uint16)NumChannels;
	Out.Append((const uint8*)&Ch, 2);
	const uint32 SR = (uint32)SampleRate;
	Out.Append((const uint8*)&SR, 4);
	const uint32 ByteRate = SR * Ch * 2;
	Out.Append((const uint8*)&ByteRate, 4);
	const uint16 BlockAlign = Ch * 2;
	Out.Append((const uint8*)&BlockAlign, 2);
	const uint16 Bits = 16;
	Out.Append((const uint8*)&Bits, 2);

	// data chunk
	Out.Append((const uint8*)"data", 4);
	Out.Append((const uint8*)&DataSize, 4);
	Out.Append(PCM);

	return Out;
}

// =============================================================================
// Analysis
// =============================================================================

float UAudioImporterLib::GetPeakLevel(const TArray<float>& Samples)
{
	float Peak = 0.f;
	for (const float S : Samples)
	{
		Peak = FMath::Max(Peak, FMath::Abs(S));
	}
	return Peak;
}

TArray<float> UAudioImporterLib::GetRMSEnvelope(
	const TArray<float>& Samples, int32 WindowSamples)
{
	TArray<float> Out;
	if (Samples.Num() == 0 || WindowSamples <= 0) return Out;

	const int32 NumWindows = (Samples.Num() + WindowSamples - 1) / WindowSamples;
	Out.Reserve(NumWindows);

	for (int32 W = 0; W < NumWindows; ++W)
	{
		const int32 Start = W * WindowSamples;
		const int32 End = FMath::Min(Start + WindowSamples, Samples.Num());
		float Sum = 0.f;
		for (int32 i = Start; i < End; ++i)
		{
			Sum += Samples[i] * Samples[i];
		}
		Out.Add(FMath::Sqrt(Sum / (float)(End - Start)));
	}
	return Out;
}

// =============================================================================
// ===== LEGACY FUNCTIONS (kept for backward compatibility) ====================
// =============================================================================

USoundWaveProcedural* UAudioImporterLib::ImportMp3FromFile(const FString& FilePath)
{
    TArray<uint8> FileData;
    if (!FFileHelper::LoadFileToArray(FileData, *FilePath))
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Failed to load file from path: %s"), *FilePath);
        return nullptr;
    }

    drmp3_config config;
    drmp3_uint64 totalPCMFrameCount;
    drmp3_int16* pDecodedPcmData = drmp3_open_memory_and_read_pcm_frames_s16(FileData.GetData(), FileData.Num(), &config, &totalPCMFrameCount, nullptr);

    if (pDecodedPcmData == nullptr)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Failed to decode MP3 data for file: %s"), *FilePath);
        return nullptr;
    }

    // --- ADD THIS FINAL CODE ---

    // 1. Create a new USoundWaveProcedural object. This is the object that can be played in-game.
    USoundWaveProcedural* SoundWave = NewObject<USoundWaveProcedural>();
    if (!SoundWave)
    {
        // If object creation fails, we must free the memory allocated by dr_mp3 before we exit.
        drmp3_free(pDecodedPcmData, nullptr);
        return nullptr;
    }

    // 2. Configure the Sound Wave with the details from the decoded audio.
    SoundWave->SetSampleRate(config.sampleRate); // e.g., 44100
    SoundWave->NumChannels = config.channels;     // e.g., 1 for mono, 2 for stereo
    SoundWave->Duration = (float)totalPCMFrameCount / config.sampleRate;
    SoundWave->SoundGroup = SOUNDGROUP_Default;
    SoundWave->bLooping = false;

    // 3. Calculate the size of the decoded audio buffer in bytes.
    const int32 NumBytes = totalPCMFrameCount * config.channels * sizeof(drmp3_int16);

    // 4. Copy the raw audio data into the Sound Wave's buffer so it can be played.
    SoundWave->QueueAudio(reinterpret_cast<const uint8*>(pDecodedPcmData), NumBytes);

    // 5. The Sound Wave now has its own copy of the data, so we MUST free the temporary memory
    //    that was allocated by the dr_mp3 library to avoid a memory leak.
    drmp3_free(pDecodedPcmData, nullptr);

    // 6. Return the fully created and populated sound wave. It's now ready to be played!
    return SoundWave;
}

// Add this entire new function to the bottom of your AudioImporterLib.cpp file

USoundWaveProcedural* UAudioImporterLib::ImportMp3FromBuffer(const TArray<uint8>& Buffer)
{
    // The API response gives us the buffer directly, so we skip the FFileHelper part.
    // We check if the buffer is empty first.
    if (Buffer.Num() == 0)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Input buffer is empty."));
        return nullptr;
    }

    // The rest of the code is IDENTICAL to the first function.
    drmp3_config config;
    drmp3_uint64 totalPCMFrameCount;
    drmp3_int16* pDecodedPcmData = drmp3_open_memory_and_read_pcm_frames_s16(Buffer.GetData(), Buffer.Num(), &config, &totalPCMFrameCount, nullptr);

    if (pDecodedPcmData == nullptr)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Failed to decode MP3 data from buffer."));
        return nullptr;
    }

    USoundWaveProcedural* SoundWave = NewObject<USoundWaveProcedural>();
    if (!SoundWave)
    {
        drmp3_free(pDecodedPcmData, nullptr);
        return nullptr;
    }

    SoundWave->SetSampleRate(config.sampleRate);
    SoundWave->NumChannels = config.channels;
    SoundWave->Duration = (float)totalPCMFrameCount / config.sampleRate;
    SoundWave->SoundGroup = SOUNDGROUP_Default;
    SoundWave->bLooping = false;

    const int32 NumBytes = totalPCMFrameCount * config.channels * sizeof(drmp3_int16);
    SoundWave->QueueAudio(reinterpret_cast<const uint8*>(pDecodedPcmData), NumBytes);

    drmp3_free(pDecodedPcmData, nullptr);
    return SoundWave;
}

USoundWaveProcedural* UAudioImporterLib::ImportPcmAsSoundWave(const TArray<uint8>& PcmData, int32 SampleRate, int32 NumChannels)
{
    if (PcmData.Num() == 0)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Input PCM data is empty."));
        return nullptr;
    }

    USoundWaveProcedural* SoundWave = NewObject<USoundWaveProcedural>();
    if (!SoundWave)
    {
        return nullptr;
    }

    // Set the audio settings directly from the function inputs.
    SoundWave->SetSampleRate(SampleRate);
    SoundWave->NumChannels = NumChannels;
    SoundWave->SoundGroup = SOUNDGROUP_Voice; // Use the 'Voice' group for dialogue
    SoundWave->bLooping = false;

    // The number of bytes per second is SampleRate * NumChannels * (BitDepth / 8)
    // For 16-bit audio, BitDepth is 16, so we multiply by 2.
    const int32 BytesPerSecond = SampleRate * NumChannels * 2;
    SoundWave->Duration = (float)PcmData.Num() / BytesPerSecond;

    // Queue the raw PCM data directly. No decoding needed!
    SoundWave->QueueAudio(PcmData.GetData(), PcmData.Num());

    return SoundWave;
}


// Helper struct for the WAV file header
struct FWavHeader
{
    // RIFF Header
    char RIFF[4] = { 'R', 'I', 'F', 'F' };
    uint32 ChunkSize;
    char WAVE[4] = { 'W', 'A', 'V', 'E' };
    // Format Header
    char FMT[4] = { 'f', 'm', 't', ' ' };
    uint32 Subchunk1Size = 16;
    uint16 AudioFormat = 1; // 1 for PCM
    uint16 NumChannels;
    uint32 SampleRate;
    uint32 ByteRate;
    uint16 BlockAlign;
    uint16 BitsPerSample = 16;
    // Data Header
    char DATA[4] = { 'd', 'a', 't', 'a' };
    uint32 Subchunk2Size;
};


TArray<uint8> UAudioImporterLib::CreateMultipartWavPayload(const TArray<uint8>& PcmData, int32 SampleRate, int32 NumChannels, const FString& Model, const FString& Task, FString& OutBoundary)
{
    OutBoundary = FGuid::NewGuid().ToString();
    TArray<uint8> Payload;

    // --- Part 1: The Model Field ---
    FString ModelHeaderStr = FString::Printf(TEXT("--%s\r\n"), *OutBoundary);
    ModelHeaderStr += FString::Printf(TEXT("Content-Disposition: form-data; name=\"model\"\r\n\r\n"));
    ModelHeaderStr += Model + TEXT("\r\n");
    Payload.Append((uint8*)TCHAR_TO_UTF8(*ModelHeaderStr), ModelHeaderStr.Len());

    // --- Part 2: The Task Field ---
    FString TaskHeaderStr = FString::Printf(TEXT("--%s\r\n"), *OutBoundary);
    TaskHeaderStr += FString::Printf(TEXT("Content-Disposition: form-data; name=\"task\"\r\n\r\n"));
    TaskHeaderStr += Task + TEXT("\r\n");
    Payload.Append((uint8*)TCHAR_TO_UTF8(*TaskHeaderStr), TaskHeaderStr.Len());

    // --- Part 3: The Audio File ---
    FWavHeader WavHeader;
    WavHeader.NumChannels = NumChannels;
    WavHeader.SampleRate = SampleRate;
    WavHeader.ByteRate = SampleRate * NumChannels * (16 / 8);
    WavHeader.BlockAlign = NumChannels * (16 / 8);
    WavHeader.Subchunk2Size = PcmData.Num();
    WavHeader.ChunkSize = 36 + PcmData.Num();

    TArray<uint8> WavData;
    WavData.Append((uint8*)&WavHeader, sizeof(FWavHeader));
    WavData.Append(PcmData);

    FString FileHeaderStr = FString::Printf(TEXT("--%s\r\n"), *OutBoundary);
    FileHeaderStr += FString::Printf(TEXT("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n"));
    FileHeaderStr += TEXT("Content-Type: audio/wav\r\n\r\n");
    Payload.Append((uint8*)TCHAR_TO_UTF8(*FileHeaderStr), FileHeaderStr.Len());
    Payload.Append(WavData);

    // --- Footer ---
    FString FooterStr = FString::Printf(TEXT("\r\n--%s--\r\n"), *OutBoundary);
    Payload.Append((uint8*)TCHAR_TO_UTF8(*FooterStr), FooterStr.Len());

    return Payload;
}

TArray<uint8> UAudioImporterLib::ConvertFloatSamplesTo16BitPCMUints(const TArray<float>& InSamples)
{
    TArray<uint8> OutPcmData;
    // Reserve memory to avoid reallocations. Each float becomes 2 bytes (int16).
    OutPcmData.Reserve(InSamples.Num() * 2);

    for (const float Sample : InSamples)
    {
        // Clamp the float sample to the -1.0 to 1.0 range to prevent clipping artifacts
        const float ClampedSample = FMath::Clamp(Sample, -1.0f, 1.0f);

        // Scale to the 16-bit integer range and cast
        const int16 PcmSample = static_cast<int16>(ClampedSample * 32767.0f);

        // Add the two bytes of the int16 to the array (little-endian order)
        OutPcmData.Add(PcmSample & 0xFF);         // Low byte
        OutPcmData.Add((PcmSample >> 8) & 0xFF);  // High byte
    }

    return OutPcmData;
}

TArray<float> UAudioImporterLib::Convert16BitPCMUintsToFloatSamples(const TArray<uint8>& InPcmData)
{
    TArray<float> OutFloatSamples;
    // Each 16-bit sample is 2 bytes, so we can pre-allocate the memory needed.
    OutFloatSamples.Reserve(InPcmData.Num() / 2);

    // Ensure we have an even number of bytes to process.
    if (InPcmData.Num() % 2 != 0)
    {
        UE_LOG(LogTemp, Warning, TEXT("Convert16BitPCMUintsToFloatSamples: Input PCM data has an odd number of bytes. The last byte will be ignored."));
    }

    // Iterate through the byte array, taking 2 bytes at a time.
    for (int32 i = 0; i < InPcmData.Num() - 1; i += 2)
    {
        // Reconstruct the 16-bit signed integer from two bytes (little-endian).
        // This is the reverse of what your other conversion function does.
        const int16 PcmSample = static_cast<int16>((InPcmData[i + 1] << 8) | InPcmData[i]);

        // Normalize the int16 sample (from -32768 to 32767) to a float (-1.0 to 1.0)
        // by dividing by the maximum possible value of a 16-bit signed integer.
        const float FloatSample = static_cast<float>(PcmSample) / 32767.0f;

        OutFloatSamples.Add(FloatSample);
    }

    return OutFloatSamples;
}

bool UAudioImporterLib::ImportMp3AndGetFloatSamples(const TArray<uint8>& Mp3Buffer, USoundWaveProcedural*& OutSoundWave, TArray<float>& OutFloatSamples)
{
    // --- 1. Decode the MP3 buffer to 16-bit PCM ---
    drmp3_config config;
    drmp3_uint64 totalPCMFrameCount;
    drmp3_int16* pDecodedPcmData = drmp3_open_memory_and_read_pcm_frames_s16(Mp3Buffer.GetData(), Mp3Buffer.Num(), &config, &totalPCMFrameCount, nullptr);

    if (pDecodedPcmData == nullptr)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Failed to decode MP3 data from buffer."));
        return false;
    }

    // --- 2. Create the playable Sound Wave ---
    OutSoundWave = NewObject<USoundWaveProcedural>();
    if (!OutSoundWave)
    {
        drmp3_free(pDecodedPcmData, nullptr);
        return false;
    }

    OutSoundWave->SetSampleRate(config.sampleRate);
    OutSoundWave->NumChannels = config.channels;
    OutSoundWave->Duration = (float)totalPCMFrameCount / config.sampleRate;
    OutSoundWave->SoundGroup = SOUNDGROUP_Default;
    OutSoundWave->bLooping = false;

    const int32 NumBytes = totalPCMFrameCount * config.channels * sizeof(drmp3_int16);
    OutSoundWave->QueueAudio(reinterpret_cast<const uint8*>(pDecodedPcmData), NumBytes);

    // --- 3. Create the Float Array for LipSync ---
    const int32 NumSamples = totalPCMFrameCount * config.channels;
    OutFloatSamples.Reserve(NumSamples);

    for (int32 i = 0; i < NumSamples; ++i)
    {
        // Normalize the int16 sample to a float (-1.0 to 1.0)
        const float FloatSample = static_cast<float>(pDecodedPcmData[i]) / 32767.0f;
        OutFloatSamples.Add(FloatSample);
    }

    // --- 4. Clean up memory ---
    drmp3_free(pDecodedPcmData, nullptr);

    return true;
}

bool UAudioImporterLib::ImportPcmAndGetFloatSamples(const TArray<uint8>& InPcmData, int32 SampleRate, int32 NumChannels, USoundWaveProcedural*& OutSoundWave, TArray<float>& OutFloatSamples)
{
    if (InPcmData.Num() == 0)
    {
        UE_LOG(LogTemp, Error, TEXT("AudioImporterLib: Input PCM data is empty."));
        return false;
    }

    // --- Part 1: Create the playable Sound Wave ---
    OutSoundWave = NewObject<USoundWaveProcedural>();
    if (!OutSoundWave)
    {
        return false;
    }

    OutSoundWave->SetSampleRate(SampleRate);
    OutSoundWave->NumChannels = NumChannels;
    OutSoundWave->SoundGroup = SOUNDGROUP_Voice;
    OutSoundWave->bLooping = false;

    // The number of bytes per second is SampleRate * NumChannels * (BitDepth / 8)
    // For 16-bit audio, BitDepth is 16, so we multiply by 2.
    const int32 BytesPerSecond = SampleRate * NumChannels * 2;
    if (BytesPerSecond > 0)
    {
        OutSoundWave->Duration = (float)InPcmData.Num() / BytesPerSecond;
    }

    // Queue the raw PCM data directly.
    OutSoundWave->QueueAudio(InPcmData.GetData(), InPcmData.Num());


    // --- Part 2: Create the Float Array for LipSync ---
    // Each 16-bit sample is 2 bytes, so we can pre-allocate the memory needed.
    OutFloatSamples.Reserve(InPcmData.Num() / 2);

    // Iterate through the byte array, taking 2 bytes at a time.
    for (int32 i = 0; i < InPcmData.Num() - 1; i += 2)
    {
        // Reconstruct the 16-bit signed integer from two bytes (little-endian).
        const int16 PcmSample = static_cast<int16>((InPcmData[i + 1] << 8) | InPcmData[i]);

        // Normalize the int16 sample to a float (-1.0 to 1.0)
        const float FloatSample = static_cast<float>(PcmSample) / 32767.0f;
        OutFloatSamples.Add(FloatSample);
    }

    return true;
}