import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Ensure KEY is 32 bytes. If source is hex string, verify length.
// Docker compose has 64 hex chars = 32 bytes.
const KEY_HEX = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const KEY = Buffer.from(KEY_HEX, 'hex');

export function encrypt(text: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Return Encrypted + AuthTag concatenated
    return {
        encrypted: encrypted + authTag,
        iv: iv.toString('hex')
    };
}

export function decrypt(encryptedWithTagHex: string, ivHex: string) {
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedWithTag = Buffer.from(encryptedWithTagHex, 'hex');

    // Extract Auth Tag (last 16 bytes)
    const authTagLength = 16;
    const authTag = encryptedWithTag.slice(encryptedWithTag.length - authTagLength);
    const encrypted = encryptedWithTag.slice(0, encryptedWithTag.length - authTagLength);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
}

export function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
