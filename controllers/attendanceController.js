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
      .populate({
        path: "employee",
        select: "firstName lastName phone status position",
        populate: { path: "position", select: "workStartTime workEndTime" },
      })
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
      .populate({
        path: "employee",
        select: "firstName lastName phone status position",
        populate: { path: "position", select: "workStartTime workEndTime" },
      })
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

// Get weekly/monthly chart data for dashboard
const getChartData = async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const { days = 7 } = req.query;
    const numDays = parseInt(days);

    const Position = require("../models/Position");

    const dates = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const records = await Attendance.find({
      organization: orgId,
      date: { $gte: startDate, $lte: endDate },
    });

    const employees = await Employee.find({ organization: orgId }).populate("position");

    // Per-day stats
    const dailyStats = dates.map((date) => {
      const dayRecords = records.filter((r) => r.date === date);
      const checkIns = dayRecords.filter((r) => r.type === "check_in");
      const checkOuts = dayRecords.filter((r) => r.type === "check_out");

      let lateCount = 0;
      let onTimeCount = 0;
      let earlyCount = 0;

      checkIns.forEach((ci) => {
        const emp = employees.find((e) => e._id.toString() === ci.employee.toString());
        if (!emp?.position) { onTimeCount++; return; }
        const [sh, sm] = emp.position.workStartTime.split(":").map(Number);
        const ciTime = new Date(ci.createdAt);
        const diff = (ciTime.getHours() * 60 + ciTime.getMinutes()) - (sh * 60 + sm);
        if (diff > 5) lateCount++;
        else if (diff < -5) earlyCount++;
        else onTimeCount++;
      });

      const d = new Date(date + "T00:00:00");
      const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

      return {
        date,
        label,
        checkIns: checkIns.length,
        checkOuts: checkOuts.length,
        late: lateCount,
        onTime: onTimeCount,
        early: earlyCount,
      };
    });

    // Per-branch stats
    const branches = await Branch.find({ organization: orgId });
    const branchStats = branches.map((br) => {
      const brRecords = records.filter(
        (r) => r.branch.toString() === br._id.toString() && r.type === "check_in"
      );
      let late = 0, onTime = 0;
      brRecords.forEach((ci) => {
        const emp = employees.find((e) => e._id.toString() === ci.employee.toString());
        if (!emp?.position) { onTime++; return; }
        const [sh, sm] = emp.position.workStartTime.split(":").map(Number);
        const ciTime = new Date(ci.createdAt);
        const diff = (ciTime.getHours() * 60 + ciTime.getMinutes()) - (sh * 60 + sm);
        if (diff > 5) late++;
        else onTime++;
      });
      const empCount = employees.filter((e) => e.branch?.toString() === br._id.toString()).length;
      return { name: br.name, empCount, late, onTime, total: brRecords.length };
    });

    res.json({ dailyStats, branchStats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get stats for a specific branch (chart + employee list with stats)
const getBranchStats = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { days = 7 } = req.query;
    const numDays = parseInt(days);

    const branch = await Branch.findById(branchId);
    if (!branch) return res.status(404).json({ message: "Филиал не найден" });

    const employees = await Employee.find({ branch: branchId }).populate("position");

    const dates = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const records = await Attendance.find({
      branch: branchId,
      date: { $gte: startDate, $lte: endDate },
    });

    // Daily chart
    const dailyStats = dates.map((date) => {
      const dayRecs = records.filter((r) => r.date === date);
      const checkIns = dayRecs.filter((r) => r.type === "check_in");
      let late = 0, onTime = 0, early = 0;
      checkIns.forEach((ci) => {
        const emp = employees.find((e) => e._id.toString() === ci.employee.toString());
        if (!emp?.position) { onTime++; return; }
        const [sh, sm] = emp.position.workStartTime.split(":").map(Number);
        const t = new Date(ci.createdAt);
        const diff = (t.getHours() * 60 + t.getMinutes()) - (sh * 60 + sm);
        if (diff > 5) late++; else if (diff < -5) early++; else onTime++;
      });
      const d = new Date(date + "T00:00:00");
      return {
        date, label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        checkIns: checkIns.length, late, onTime, early,
      };
    });

    // Per-employee stats
    const employeeStats = employees.map((emp) => {
      const empRecs = records.filter((r) => r.employee.toString() === emp._id.toString());
      const byDate = {};
      empRecs.forEach((r) => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });

      let totalDays = 0, late = 0, onTime = 0, early = 0, totalWorked = 0;
      const hasPos = !!emp.position;
      const sh = hasPos ? parseInt(emp.position.workStartTime.split(":")[0]) : 0;
      const sm = hasPos ? parseInt(emp.position.workStartTime.split(":")[1]) : 0;

      Object.values(byDate).forEach((dayRecs) => {
        const ci = dayRecs.find((r) => r.type === "check_in");
        const co = dayRecs.find((r) => r.type === "check_out");
        if (!ci) return;
        totalDays++;
        if (hasPos) {
          const t = new Date(ci.createdAt);
          const diff = (t.getHours() * 60 + t.getMinutes()) - (sh * 60 + sm);
          if (diff > 5) late++; else if (diff < -5) early++; else onTime++;
        }
        if (ci && co) {
          const ciT = new Date(ci.createdAt);
          const coT = new Date(co.createdAt);
          totalWorked += (coT.getHours() * 60 + coT.getMinutes()) - (ciT.getHours() * 60 + ciT.getMinutes());
        }
      });

      return {
        _id: emp._id, firstName: emp.firstName, lastName: emp.lastName,
        phone: emp.phone, status: emp.status,
        position: emp.position ? { name: emp.position.name, workStartTime: emp.position.workStartTime, workEndTime: emp.position.workEndTime } : null,
        totalDays, late, onTime, early, totalWorked,
        avgWorked: totalDays > 0 ? Math.round(totalWorked / totalDays) : 0,
      };
    });

    const totalLate = dailyStats.reduce((s, d) => s + d.late, 0);
    const totalOnTime = dailyStats.reduce((s, d) => s + d.onTime, 0);
    const totalEarly = dailyStats.reduce((s, d) => s + d.early, 0);

    res.json({
      branch: { _id: branch._id, name: branch.name, radius: branch.radius },
      totals: { employees: employees.length, working: employees.filter((e) => e.status === "working").length, late: totalLate, onTime: totalOnTime, early: totalEarly },
      dailyStats,
      employeeStats,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { checkInOut, getMyAttendance, getAttendanceByOrg, getTodaySummary, getChartData, getBranchStats };
