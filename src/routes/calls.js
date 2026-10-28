import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { SORT_COLUMNS, getCall, listCalls } from "../services/calls.js";
import { parseFilters } from "../services/filters.js";
import { asyncHandler, notFound } from "../utils/errors.js";
import { integer, oneOf, required, validate, withDefault } from "../utils/validate.js";

const router = Router();

// admin only (full phone numbers)
router.use(requireAuth, requireRole("admin"));

// GET /api/calls
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const options = validate(req.query, {
      page: withDefault(1, integer({ min: 1, max: 100000 })),
      limit: withDefault(20, integer({ min: 1, max: 100 })),
      sort: withDefault("startTime", oneOf(Object.keys(SORT_COLUMNS))),
      order: withDefault("desc", oneOf(["asc", "desc"])),
    });
    const filters = parseFilters(req.query);
    res.json(await listCalls({ ...options, filters }));
  })
);

// GET /api/calls/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(req.params, { id: required(integer({ min: 1, max: 2147483647 })) });
    const call = await getCall(id);
    if (!call) throw notFound(`Call ${id} was not found.`);
    res.json({ data: call });
  })
);

export default router;
