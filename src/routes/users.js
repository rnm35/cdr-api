import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES, listUsers, updateUserRole } from "../services/users.js";
import { asyncHandler, conflict } from "../utils/errors.js";
import { integer, oneOf, required, validate } from "../utils/validate.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));

// GET /api/users
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ data: await listUsers() });
  })
);

// PATCH /api/users/:id  { "role": "admin" | "analyst" }
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = validate(req.params, { id: required(integer({ min: 1, max: 2147483647 })) });
    const { role } = validate(req.body, { role: required(oneOf(ROLES)) });
    // stop admins locking themselves out
    if (id === req.user.id && role !== "admin") {
      throw conflict("You can't remove your own admin role.");
    }
    res.json({ data: await updateUserRole(id, role) });
  })
);

export default router;
