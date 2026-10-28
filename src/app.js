import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { query } from "./db.js";
import analyticsRoutes from "./routes/analytics.js";
import authRoutes from "./routes/auth.js";
import callRoutes from "./routes/calls.js";
import userRoutes from "./routes/users.js";
import { ApiError, asyncHandler, errorBody, notFound } from "./utils/errors.js";

export const app = express();

// behind render/vercel proxies
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || config.clientOrigins.includes(origin)),
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// only accept JSON for requests that change data
app.use((req, res, next) => {
  const changesData = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (changesData && !req.is("application/json")) {
    return next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Requests must be sent as JSON."));
  }
  next();
});

// GET /api/health
app.get(
  "/api/health",
  asyncHandler(async (req, res) => {
    await query("SELECT 1");
    res.json({ status: "ok" });
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);

app.use((req, res, next) => next(notFound(`No endpoint at ${req.method} ${req.path}.`)));

app.use((err, req, res, next) => {
  let error = err;
  if (err.type === "entity.parse.failed") {
    error = new ApiError(400, "INVALID_JSON", "The request body is not valid JSON.");
  } else if (err.type === "entity.too.large") {
    error = new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  } else if (!(err instanceof ApiError)) {
    // log unexpected errors, don't leak details to the client
    console.error(err);
    error = new ApiError(500, "INTERNAL_ERROR", "Something went wrong on the server.");
  }
  res.status(error.status).json(errorBody(error));
});
