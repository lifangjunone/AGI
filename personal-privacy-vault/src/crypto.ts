import type { EncryptedPayload, VaultData, VaultEnvelope } from './types'

export const KDF_ITERATIONS = 310_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptValue(
  key: CryptoKey,
  value: unknown,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptValue<T>(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.ciphertext),
  )
  return JSON.parse(decoder.decode(plaintext)) as T
}

export async function createEnvelope(
  password: string,
  vault: VaultData,
): Promise<{ envelope: VaultEnvelope; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  const [verifier, encryptedVault] = await Promise.all([
    encryptValue(key, { marker: 'vault-ok' }),
    encryptValue(key, vault),
  ])

  return {
    key,
    envelope: {
      format: 'personal-privacy-vault',
      version: 1,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: KDF_ITERATIONS,
        salt: toBase64(salt),
      },
      verifier,
      vault: encryptedVault,
      updatedAt: new Date().toISOString(),
    },
  }
}

export async function unlockEnvelope(
  password: string,
  envelope: VaultEnvelope,
): Promise<{ key: CryptoKey; vault: VaultData }> {
  const key = await deriveKey(
    password,
    fromBase64(envelope.kdf.salt),
    envelope.kdf.iterations,
  )
  const verifier = await decryptValue<{ marker: string }>(key, envelope.verifier)
  if (verifier.marker !== 'vault-ok') throw new Error('INVALID_PASSWORD')
  return { key, vault: await decryptValue<VaultData>(key, envelope.vault) }
}

export async function updateEnvelope(
  envelope: VaultEnvelope,
  key: CryptoKey,
  vault: VaultData,
): Promise<VaultEnvelope> {
  return {
    ...envelope,
    vault: await encryptValue(key, vault),
    updatedAt: new Date().toISOString(),
  }
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VaultEnvelope>
  return candidate.format === 'personal-privacy-vault'
    && candidate.version === 1
    && candidate.kdf?.name === 'PBKDF2'
    && typeof candidate.vault?.ciphertext === 'string'
}
