const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const Branch = require("../models/Branch");

// Calculate distance between two coordinates (Haversine formula)
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Check in / Check out
const checkInOut = async (req, res) => {
  try {
    const { type } = req.body;
    const latitude = parseFloat(req.body.latitude);
    const longitude = parseFloat(req.body.longitude);
    const employeeId = req.user.id;

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ message: "Предоставьте доступ к геолокации" });
    }

    const employee = await Employee.findById(employeeId).populate("branch");
    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }

    const branch = employee.branch;

    // Check distance
    const distance = getDistance(latitude, longitude, branch.latitude, branch.longitude);
    if (distance > branch.radius) {
      return res.status(400).json({
        message: "Вы не в рабочей зоне",
        distance: Math.round(distance),
        maxRadius: branch.radius,
      });
    }

    // Check if already checked in/out today
    const today = new Date().toISOString().split("T")[0];
    const lastRecord = await Attendance.findOne({
      employee: employeeId,
      date: today,
    }).sort({ createdAt: -1 });

    if (type === "check_in" && lastRecord?.type === "check_in") {
      return res.status(400).json({ message: "Вы уже отметили приход сегодня" });
    }

    if (type === "check_out" && (!lastRecord || lastRecord.type === "check_out")) {
      return res.status(400).json({ message: "Вы ещё не отмечали приход" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Необходимо сделать селфи" });
    }

    const attendance = await Attendance.create({
      employee: employeeId,
      organization: employee.organization,
      branch: employee.branch._id,
      type,
      photo: `/uploads/${req.file.filename}`,
      latitude,
      longitude,
      date: today,
    });

    // Update employee status
    employee.status = type === "check_in" ? "working" : "not_working";
    await employee.save();

    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get attendance history for employee
const getMyAttendance = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const { startDate, endDate } = req.query;

    const filter = { employee: employeeId };
    if (startDate && endDate) {
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const records = await Attendance.find(filter).sort({ createdAt: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get attendance for admin (by organization)
const getAttendanceByOrg = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { date, branch, employee } = req.query;

    const filter = { organization: orgId };
    if (date) filter.date = date;
    if (branch) filter.branch = branch;
    if (employee) filter.employee = employee;

    const records = await Attendance.find(filter)
      .populate("employee", "firstName lastName phone status")
      .populate("branch", "name")
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get today's summary for admin dashboard
const getTodaySummary = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const today = new Date().toISOString().split("T")[0];

    const totalEmployees = await Employee.countDocuments({ organization: orgId });
    const workingEmployees = await Employee.countDocuments({
      organization: orgId,
      status: "working",
    });

    const todayRecords = await Attendance.find({ organization: orgId, date: today })
      .populate("employee", "firstName lastName phone status")
      .populate("branch", "name")
      .sort({ createdAt: -1 });

    res.json({
      totalEmployees,
      workingEmployees,
      notWorkingEmployees: totalEmployees - workingEmployees,
      todayRecords,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { checkInOut, getMyAttendance, getAttendanceByOrg, getTodaySummary };
