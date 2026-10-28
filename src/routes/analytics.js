import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getCallTypes,
  getCities,
  getDashboard,
  getDurations,
  getSummary,
  getTimeline,
  getTopCallers,
} from "../services/analytics.js";
import { filtersKey, parseFilters } from "../services/filters.js";
import { cached } from "../utils/cache.js";
import { asyncHandler } from "../utils/errors.js";
import { integer, oneOf, validate, withDefault } from "../utils/validate.js";

const router = Router();

// admins and analysts (analysts get masked numbers)
router.use(requireAuth, requireRole("admin", "analyst"));

// validates filters/options, caches per role and filters, sends { data }
function analyticsRoute(name, compute, optionRules = {}) {
  return asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const options = validate(req.query, optionRules);
    const key = [name, req.user.role, filtersKey(filters), filtersKey(options)].join("|");
    const data = await cached(key, () => compute(filters, options, req.user.role));
    res.json({ data, filters });
  });
}

// GET /api/analytics/dashboard
router.get("/dashboard", analyticsRoute("dashboard", (filters, _options, role) => getDashboard(filters, role)));

// GET /api/analytics/summary
router.get("/summary", analyticsRoute("summary", (filters) => getSummary(filters)));

// GET /api/analytics/call-types
router.get("/call-types", analyticsRoute("call-types", (filters) => getCallTypes(filters)));

// GET /api/analytics/top-callers?by=duration|cost|calls&limit=10
router.get(
  "/top-callers",
  analyticsRoute("top-callers", (filters, options, role) => getTopCallers(filters, options, role), {
    by: withDefault("duration", oneOf(["duration", "cost", "calls"])),
    limit: withDefault(10, integer({ min: 1, max: 50 })),
  })
);

// GET /api/analytics/timeline?interval=auto|hour|day|week|month
router.get(
  "/timeline",
  analyticsRoute("timeline", (filters, options) => getTimeline(filters, options), {
    interval: withDefault("auto", oneOf(["auto", "hour", "day", "week", "month"])),
  })
);

// GET /api/analytics/cities?limit=10
router.get(
  "/cities",
  analyticsRoute("cities", (filters, options) => getCities(filters, options), {
    limit: withDefault(10, integer({ min: 1, max: 50 })),
  })
);

// GET /api/analytics/durations
router.get("/durations", analyticsRoute("durations", (filters) => getDurations(filters)));

export default router;
