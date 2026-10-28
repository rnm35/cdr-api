import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { findUserById, verifyToken } from "../services/users.js";
import { asyncHandler, forbidden, unauthorized } from "../utils/errors.js";

export const TOKEN_COOKIE = "cdr_token";

export function setTokenCookie(res, token) {
  const { exp } = jwt.decode(token);
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true, // JavaScript in the browser can't read it, which protects it from XSS
    secure: config.isProduction, // HTTPS only in production
    sameSite: "lax", // not sent on cross-site form posts, which blocks CSRF
    path: "/",
    maxAge: exp * 1000 - Date.now(),
  });
}

export function clearTokenCookie(res) {
  res.clearCookie(TOKEN_COOKIE, { httpOnly: true, secure: config.isProduction, sameSite: "lax", path: "/" });
}

// cookie from the web app, or a bearer token from api tools
function readToken(req) {
  if (req.cookies?.[TOKEN_COOKIE]) return req.cookies[TOKEN_COOKIE];
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") throw unauthorized("Your session has expired. Please sign in again.");
    throw unauthorized("Your session is not valid. Please sign in again.");
  }

  const user = await findUserById(Number(payload.sub));
  if (!user) throw unauthorized("This account no longer exists.");

  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(forbidden());
    next();
  };
