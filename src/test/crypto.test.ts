import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

function base64UrlToBytes(encoded: string) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toLegacyPayload(versionedPayload: string) {
  const [, saltPart, ivPart, ciphertextPart] = versionedPayload.split(".");
  const salt = base64UrlToBytes(saltPart);
  const iv = base64UrlToBytes(ivPart);
  const ciphertext = base64UrlToBytes(ciphertextPart);
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.length);

  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(ciphertext, salt.length + iv.length);

  return bytesToBase64(combined);
}

describe("crypto helpers", () => {
  it("round-trips encrypted text with a password", async () => {
    const plaintext = "Launch notes: AES-GCM handles authenticated encryption. Привет.";
    const password = "correct horse battery staple";

    const ciphertext = await encrypt(plaintext, password);

    expect(ciphertext).toMatch(/^mqb1\./);
    await expect(decrypt(ciphertext, password)).resolves.toBe(plaintext);
  });

  it("uses fresh randomness for each encrypted payload", async () => {
    const plaintext = "same message";
    const password = "same password";

    const first = await encrypt(plaintext, password);
    const second = await encrypt(plaintext, password);

    expect(first).not.toBe(second);
  });

  it("rejects decryption with the wrong password", async () => {
    const ciphertext = await encrypt("private payload", "real password");

    await expect(decrypt(ciphertext, "wrong password")).rejects.toThrow();
  });

  it("rejects malformed encrypted payloads before decrypting", async () => {
    await expect(decrypt("mqb1.not-enough-parts", "password")).rejects.toThrow(
      "Invalid encrypted payload format."
    );
  });

  it("can still decrypt legacy salt+iv+ciphertext Base64 payloads", async () => {
    const plaintext = "legacy compatibility matters";
    const password = "old format password";
    const versionedPayload = await encrypt(plaintext, password);
    const legacyPayload = toLegacyPayload(versionedPayload);

    await expect(decrypt(legacyPayload, password)).resolves.toBe(plaintext);
  });
});
