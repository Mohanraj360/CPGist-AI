import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key() {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY
  if (!raw) throw new Error('CONNECTOR_ENCRYPTION_KEY is not configured.')
  const bytes = Buffer.from(raw, /^[0-9a-f]{64}$/i.test(raw) ? 'hex' : 'base64')
  if (bytes.length !== 32) throw new Error('CONNECTOR_ENCRYPTION_KEY must decode to 32 bytes.')
  return bytes
}

export function encryptSecret(value: string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv)
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}
export function decryptSecret(value: string) {
  const [iv,tag,data]=value.split('.')
  if(!iv||!tag||!data)throw new Error('Invalid encrypted connector secret.')
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8')
}
