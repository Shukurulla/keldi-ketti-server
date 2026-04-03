const router = require("express").Router();
const {
  checkInOut,
  getMyAttendance,
  getAttendanceByOrg,
  getTodaySummary,
  getChartData,
  getBranchStats,
} = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post("/check", authMiddleware(["employee"]), upload.single("photo"), checkInOut);
router.get("/my", authMiddleware(["employee"]), getMyAttendance);
router.get("/org", authMiddleware(["org_admin"]), getAttendanceByOrg);
router.get("/summary", authMiddleware(["org_admin"]), getTodaySummary);
router.get("/chart", authMiddleware(["org_admin"]), getChartData);
router.get("/branch/:branchId", authMiddleware(["org_admin"]), getBranchStats);

module.exports = router;
