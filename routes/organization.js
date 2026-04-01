const router = require("express").Router();
const {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} = require("../controllers/organizationController");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");

router.use(authMiddleware(["system_admin"]));

router.get("/", getOrganizations);
router.get("/:id", getOrganization);
router.post("/", upload.single("logo"), createOrganization);
router.put("/:id", upload.single("logo"), updateOrganization);
router.delete("/:id", deleteOrganization);

module.exports = router;
