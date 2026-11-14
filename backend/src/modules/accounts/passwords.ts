
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const HASH_LENGTH = 64;

async function calculateHash(password: string, salt: string): Promise<Buffer> {
  return (await scryptAsync(password, salt, HASH_LENGTH)) as Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await calculateHash(password, salt);
  return salt + ":" + hash.toString("hex");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, storedHash] = stored.split(":");
  const hash = await calculateHash(password, salt);
  return timingSafeEqual(hash, Buffer.from(storedHash, "hex"));
}
