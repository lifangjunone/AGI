import { describe, expect, it } from 'vitest'
import { createEnvelope, unlockEnvelope, updateEnvelope } from './crypto'
import type { VaultData } from './types'

const vault: VaultData = {
  version: 1,
  updatedAt: '2026-09-09T00:00:00.000Z',
  entries: [{
    id: 'entry-1',
    title: '测试身份证',
    category: '身份资料',
    favorite: false,
    notes: '敏感备注',
    fields: [{
      id: 'field-1',
      label: '证件号码',
      value: '110101199001011234',
      secret: true,
    }],
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  }],
}

describe('encrypted vault', () => {
  it('round-trips encrypted vault data without plaintext leakage', async () => {
    const { envelope } = await createEnvelope('correct horse battery staple', vault)
    const serialized = JSON.stringify(envelope)

    expect(serialized).not.toContain('110101199001011234')
    expect(serialized).not.toContain('测试身份证')
    expect((await unlockEnvelope('correct horse battery staple', envelope)).vault).toEqual(vault)
  })

  it('rejects an incorrect master password', async () => {
    const { envelope } = await createEnvelope('correct horse battery staple', vault)
    await expect(unlockEnvelope('incorrect-password', envelope)).rejects.toThrow()
  })

  it('re-encrypts mutations with a fresh IV', async () => {
    const { envelope, key } = await createEnvelope('correct horse battery staple', vault)
    const nextVault = { ...vault, updatedAt: '2026-09-09T01:00:00.000Z' }
    const updated = await updateEnvelope(envelope, key, nextVault)

    expect(updated.vault.iv).not.toBe(envelope.vault.iv)
    expect((await unlockEnvelope('correct horse battery staple', updated)).vault).toEqual(nextVault)
  })

  it('rotates the master password without changing vault data', async () => {
    const original = await createEnvelope('current master password', vault)
    const verified = await unlockEnvelope('current master password', original.envelope)
    const rotated = await createEnvelope('replacement master password', verified.vault)

    await expect(unlockEnvelope('current master password', rotated.envelope)).rejects.toThrow()
    expect((await unlockEnvelope('replacement master password', rotated.envelope)).vault).toEqual(vault)
    expect(rotated.envelope.kdf.salt).not.toBe(original.envelope.kdf.salt)
  })
})
