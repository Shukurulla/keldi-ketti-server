const router = require("express").Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  viewEmployeePassword,
} = require("../controllers/employeeController");
const authMiddleware = require("../middleware/auth");

router.get("/org/:orgId", authMiddleware(["system_admin"]), getEmployees);
router.get("/", authMiddleware(["org_admin"]), getEmployees);
router.get("/:id", authMiddleware(["system_admin", "org_admin"]), getEmployee);
router.post("/", authMiddleware(["org_admin"]), createEmployee);
router.put("/:id", authMiddleware(["org_admin"]), updateEmployee);
router.delete("/:id", authMiddleware(["org_admin"]), deleteEmployee);
router.get("/:id/password", authMiddleware(["system_admin", "org_admin"]), viewEmployeePassword);

module.exports = router;
