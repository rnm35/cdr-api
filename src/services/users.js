import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { query } from "../db.js";
import { conflict, notFound, unauthorized } from "../utils/errors.js";
import { toUser } from "../utils/format.js";

const BCRYPT_ROUNDS = 12;
export const ROLES = ["admin", "analyst"];

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function createUser({ name, email, password, role = "analyst" }) {
  const passwordHash = await hashPassword(password);
  try {
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, email, passwordHash, role]
    );
    return toUser(rows[0]);
  } catch (error) {
    // 23505 = unique violation (email taken)
    if (error.code === "23505") throw conflict("An account with this email already exists.");
    throw error;
  }
}

// dummy hash so unknown emails take as long to check as real ones
let dummyHash;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash("not-a-real-password", BCRYPT_ROUNDS));

export async function authenticate(email, password) {
  const { rows } = await query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
  const user = rows[0];
  const matches = await bcrypt.compare(password, user ? user.password_hash : await getDummyHash());
  if (!user || !matches) throw unauthorized("Incorrect email or password.");
  return toUser(user);
}

export async function findUserById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers() {
  const { rows } = await query("SELECT * FROM users ORDER BY created_at, id");
  return rows.map(toUser);
}

export async function updateUserRole(id, role) {
  const { rows } = await query("UPDATE users SET role = $2 WHERE id = $1 RETURNING *", [id, role]);
  if (!rows[0]) throw notFound("User not found.");
  return toUser(rows[0]);
}

// token only holds the user id; the role is looked up on each request
export function signToken(user) {
  return jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
}
