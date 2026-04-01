const router = require("express").Router();
const {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
} = require("../controllers/branchController");
const authMiddleware = require("../middleware/auth");

router.get("/org/:orgId", authMiddleware(["system_admin"]), getBranches);
router.get("/", authMiddleware(["org_admin"]), getBranches);
router.get("/:id", authMiddleware(["system_admin", "org_admin"]), getBranch);
router.post("/", authMiddleware(["org_admin"]), createBranch);
router.put("/:id", authMiddleware(["org_admin"]), updateBranch);
router.delete("/:id", authMiddleware(["org_admin"]), deleteBranch);

module.exports = router;
