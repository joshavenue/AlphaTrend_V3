import { hash, verify } from "@node-rs/argon2";

const DENIED_PASSWORDS = new Set(["admin", "password", "password123"]);

export function validateAdminPassword(password: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim().toLowerCase();

  if (password.length < 14) {
    return "Password must be at least 14 characters.";
  }

  if (normalizedPassword === normalizedEmail) {
    return "Password must not equal the admin email.";
  }

  if (DENIED_PASSWORDS.has(normalizedPassword)) {
    return "Password is too common.";
  }

  return null;
}

export async function hashAdminPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
  });
}

export async function verifyAdminPassword(hashValue: string, password: string) {
  return verify(hashValue, password);
}
