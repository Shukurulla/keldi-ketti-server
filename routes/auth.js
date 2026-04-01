const router = require("express").Router();
const { adminLogin, orgLogin, employeeLogin, viewPassword, unifiedAdminLogin } = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/login", unifiedAdminLogin);
router.post("/admin/login", adminLogin);
router.post("/org/login", orgLogin);
router.post("/employee/login", employeeLogin);
router.post("/decrypt-password", authMiddleware(["system_admin", "org_admin"]), viewPassword);

module.exports = router;
