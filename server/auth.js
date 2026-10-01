import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const ROLES = { admin: 'Administrator', call_taker: 'Call Taker' };
export const SESSION_COOKIE = 'lynx_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 10;

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// ---------------------------------------------------------------- hashing
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(key, expected);
}

// A hash of a random password, used to keep login timing uniform for unknown usernames.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyHash);
}

export function passwordProblems(password, { username } = {}) {
  const pw = String(password || '');
  const problems = [];
  if (pw.length < MIN_PASSWORD_LENGTH) problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) problems.push('Password must contain letters and numbers.');
  if (username && pw.toLowerCase().includes(String(username).toLowerCase())) problems.push('Password must not contain the username.');
  return problems;
}

export function generatePassword() {
  // Readable temporary password, e.g. "Kx7m-Pq2r-Tz9w".
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const pick = () => alphabet[crypto.randomInt(alphabet.length)];
  const group = () => Array.from({ length: 4 }, pick).join('');
  let pw;
  do pw = `${group()}-${group()}-${group()}`; while (!/[0-9]/.test(pw) || !/[a-zA-Z]/.test(pw));
  return pw;
}

// --------------------------------------------------------------- sessions
export const newSessionToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(req, token, maxAgeSeconds) {
  const secure = req.secure || process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

// ---------------------------------------------------------------- lockout
// Failed-login tracking per username (in memory; resets on restart).
export function createLockout() {
  const failures = new Map();
  return {
    isLocked(username) {
      const f = failures.get(String(username).toLowerCase());
      return Boolean(f?.lockedUntil && f.lockedUntil > Date.now());
    },
    // Returns true when this failure triggered a lock.
    fail(username) {
      const key = String(username).toLowerCase();
      const f = failures.get(key) || { count: 0, lockedUntil: 0 };
      if (f.lockedUntil && f.lockedUntil <= Date.now()) { f.count = 0; f.lockedUntil = 0; }
      f.count += 1;
      const locked = f.count >= MAX_FAILED_LOGINS;
      if (locked) f.lockedUntil = Date.now() + LOCKOUT_MS;
      failures.set(key, f);
      return locked;
    },
    clear(username) {
      failures.delete(String(username).toLowerCase());
    },
  };
}
