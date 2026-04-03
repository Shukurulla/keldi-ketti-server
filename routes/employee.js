const router = require("express").Router();
const {
  getEmployees,
  getEmployee,
  getEmployeeStats,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  viewEmployeePassword,
} = require("../controllers/employeeController");
const authMiddleware = require("../middleware/auth");

router.get("/org/:orgId", authMiddleware(["system_admin"]), getEmployees);
router.get("/", authMiddleware(["org_admin"]), getEmployees);
router.get("/:id", authMiddleware(["system_admin", "org_admin", "employee"]), getEmployee);
router.get("/:id/stats", authMiddleware(["system_admin", "org_admin"]), getEmployeeStats);
router.get("/:id/password", authMiddleware(["system_admin", "org_admin"]), viewEmployeePassword);
router.post("/", authMiddleware(["org_admin"]), createEmployee);
router.put("/:id", authMiddleware(["org_admin"]), updateEmployee);
router.delete("/:id", authMiddleware(["org_admin"]), deleteEmployee);

module.exports = router;
