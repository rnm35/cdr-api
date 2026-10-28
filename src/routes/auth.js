import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { clearTokenCookie, requireAuth, setTokenCookie } from "../middleware/auth.js";
import { authenticate, createUser, signToken } from "../services/users.js";
import { ApiError, asyncHandler, errorBody } from "../utils/errors.js";
import { email, password, required, text, validate } from "../utils/validate.js";

const router = Router();

// 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    const error = new ApiError(429, "TOO_MANY_REQUESTS", "Too many attempts. Please wait 15 minutes and try again.");
    res.status(429).json(errorBody(error));
  },
});

function sendSession(res, status, user) {
  const token = signToken(user);
  setTokenCookie(res, token);
  // token also returned for api tools (bearer header)
  res.status(status).json({ user, token });
}

// POST /api/auth/signup (new accounts are analysts)
router.post(
  "/signup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = validate(req.body, {
      name: required(text({ min: 1, max: 80 })),
      email: required(email()),
      password: required(password()),
    });
    const user = await createUser({ ...body, role: "analyst" });
    sendSession(res, 201, user);
  })
);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = validate(req.body, {
      email: required(email()),
      password: required(text({ min: 1, max: 200 })),
    });
    const user = await authenticate(body.email, body.password);
    sendSession(res, 200, user);
  })
);

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  clearTokenCookie(res);
  res.status(204).end();
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
