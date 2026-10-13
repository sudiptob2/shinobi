// Email and password accounts with a signed cookie session. No sessions table, no third party.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { ObjectId } from "mongodb";
import { users } from "./db.ts";

const SECRET = process.env.SESSION_SECRET ?? "";
if (!SECRET) throw new Error("SESSION_SECRET is not set");
const COOKIE = "shinobi";
const DAYS = 30;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(scryptSync(pw, salt, 64), Buffer.from(hash, "hex"));
}

const sign = (s: string) => createHmac("sha256", SECRET).update(s).digest("base64url");

export function startSession(c: Context, userId: string) {
  const payload = `${userId}.${Date.now() + DAYS * 864e5}`;
  setCookie(c, COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "Lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: DAYS * 86400 });
}
export function endSession(c: Context) { deleteCookie(c, COOKIE, { path: "/" }); }

/** The signed-in user's id, or null. */
export function sessionUserId(c: Context): string | null {
  const v = getCookie(c, COOKIE);
  if (!v) return null;
  const [userId, exp, sig] = v.split(".");
  if (!userId || !exp || !sig || sign(`${userId}.${exp}`) !== sig || Number(exp) < Date.now()) return null;
  return userId;
}

export async function currentUser(c: Context) {
  const id = sessionUserId(c);
  if (!id) return null;
  return users.findOne({ _id: new ObjectId(id) as any }, { projection: { passwordHash: 0 } });
}

export async function signUp(email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That does not look like an email address");
  if (password.length < 10) throw new Error("Use a password of at least 10 characters");
  if (await users.findOne({ email })) throw new Error("An account with that email already exists. Sign in instead");
  const r = await users.insertOne({ email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
  return String(r.insertedId);
}

export async function signIn(email: string, password: string) {
  const u = await users.findOne({ email: email.trim().toLowerCase() });
  if (!u || !verifyPassword(password, u.passwordHash)) throw new Error("Wrong email or password");
  return String(u._id);
}
