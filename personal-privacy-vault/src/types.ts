export const CATEGORIES = [
  '身份资料',
  '账号凭据',
  '财务信息',
  '医疗健康',
  '家庭档案',
  '私密笔记',
] as const

export type Category = (typeof CATEGORIES)[number]

export type VaultField = {
  id: string
  label: string
  value: string
  secret: boolean
}

export type VaultEntry = {
  id: string
  title: string
  category: Category
  favorite: boolean
  notes: string
  fields: VaultField[]
  createdAt: string
  updatedAt: string
}

export type VaultData = {
  version: 1
  entries: VaultEntry[]
  updatedAt: string
}

export type EncryptedPayload = {
  iv: string
  ciphertext: string
}

export type VaultEnvelope = {
  format: 'personal-privacy-vault'
  version: 1
  kdf: {
    name: 'PBKDF2'
    hash: 'SHA-256'
    iterations: number
    salt: string
  }
  verifier: EncryptedPayload
  vault: EncryptedPayload
  updatedAt: string
}
