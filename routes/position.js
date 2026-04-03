const router = require("express").Router();
const {
  getPositions,
  getPosition,
  createPosition,
  updatePosition,
  deletePosition,
} = require("../controllers/positionController");
const authMiddleware = require("../middleware/auth");

router.get(
  "/org/:orgId",
  authMiddleware(["system_admin"]),
  getPositions
);
router.get("/", authMiddleware(["org_admin"]), getPositions);
router.get(
  "/:id",
  authMiddleware(["system_admin", "org_admin"]),
  getPosition
);
router.post("/", authMiddleware(["org_admin"]), createPosition);
router.put("/:id", authMiddleware(["org_admin"]), updatePosition);
router.delete("/:id", authMiddleware(["org_admin"]), deletePosition);

module.exports = router;
