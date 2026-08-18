const crypto = require('crypto');

/**
 * Encrypts/decrypts secrets (ER:LC server keys, future API credentials)
 * before they touch the database. Never store plaintext secrets in
 * guild_config JSON or any other table — always go through here.
 *
 * Requires ENCRYPTION_KEY in the environment: a 64-char hex string
 * (32 bytes). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY is missing or invalid. Set a 64-char hex string (32 bytes) in your .env — see .env.example.'
    );
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decrypt({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** Masks a secret for display/logging: keeps the last 4 chars only. */
function mask(secret) {
  if (!secret || secret.length < 4) return '••••';
  return `••••••••${secret.slice(-4)}`;
}

module.exports = { encrypt, decrypt, mask };
