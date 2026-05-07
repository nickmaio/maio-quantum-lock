const FORMAT_VERSION = "mqb1";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 600000;

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  return cryptoApi;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(encoded) {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("Invalid encrypted payload encoding.");
  }
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

function encodePayload(salt, iv, ciphertext) {
  return [
    FORMAT_VERSION,
    bytesToBase64Url(salt),
    bytesToBase64Url(iv),
    bytesToBase64Url(new Uint8Array(ciphertext)),
  ].join(".");
}

function decodePayload(encoded) {
  if (encoded.startsWith(`${FORMAT_VERSION}.`)) {
    const parts = encoded.split(".");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted payload format.");
    }
    const [, saltPart, ivPart, ciphertextPart] = parts;
    const salt = base64UrlToBytes(saltPart);
    const iv = base64UrlToBytes(ivPart);
    const ciphertext = base64UrlToBytes(ciphertextPart);

    if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || ciphertext.length === 0) {
      throw new Error("Invalid encrypted payload contents.");
    }

    return { salt, iv, ciphertext };
  }

  const legacyPayload = base64ToBytes(encoded);
  if (legacyPayload.length <= SALT_LENGTH + IV_LENGTH) {
    throw new Error("Invalid encrypted payload contents.");
  }

  return {
    salt: legacyPayload.slice(0, SALT_LENGTH),
    iv: legacyPayload.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH),
    ciphertext: legacyPayload.slice(SALT_LENGTH + IV_LENGTH),
  };
}

async function deriveKey(password, salt) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("A non-empty password is required.");
  }

  const cryptoApi = getCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(plaintext, password) {
  const cryptoApi = getCrypto();
  const enc = new TextEncoder();
  const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return encodePayload(salt, iv, ciphertext);
}

export async function decrypt(encoded, password) {
  const cryptoApi = getCrypto();
  const dec = new TextDecoder();
  const { salt, iv, ciphertext } = decodePayload(encoded);
  const key = await deriveKey(password, salt);
  const plaintext = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return dec.decode(plaintext);
}
