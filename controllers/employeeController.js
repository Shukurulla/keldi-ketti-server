const Employee = require("../models/Employee");
const Attendance = require("../models/Attendance");
const Position = require("../models/Position");
const { encrypt, decrypt } = require("../utils/encryption");

// Get employees by organization/branch
const getEmployees = async (req, res) => {
  try {
    const orgId =
      req.user.role === "system_admin"
        ? req.params.orgId
        : req.user.organizationId;
    const filter = { organization: orgId };

    if (req.query.branch) {
      filter.branch = req.query.branch;
    }

    if (req.query.position) {
      filter.position = req.query.position;
    }

    const employees = await Employee.find(filter)
      .populate("branch", "name")
      .populate("position", "name workStartTime workEndTime")
      .sort({ createdAt: -1 });

    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single employee with position info
const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate("organization")
      .populate("branch")
      .populate("position");
    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get employee statistics (late/early/on-time analytics)
const getEmployeeStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    const employee = await Employee.findById(id)
      .populate("branch")
      .populate("position");

    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }

    const hasPosition = !!employee.position;

    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;

    // Get all attendance records for the month
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const records = await Attendance.find({
      employee: id,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ createdAt: 1 });

    // Group records by date
    const byDate = {};
    records.forEach((r) => {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    });

    const workStart = hasPosition ? employee.position.workStartTime : null;
    const workEnd = hasPosition ? employee.position.workEndTime : null;

    let startHour = 0, startMin = 0, endHour = 0, endMin = 0, scheduledMinutes = 0;
    if (hasPosition) {
      [startHour, startMin] = workStart.split(":").map(Number);
      [endHour, endMin] = workEnd.split(":").map(Number);
      scheduledMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
    }

    let totalDays = 0;
    let lateArrivals = 0;
    let earlyArrivals = 0;
    let onTimeArrivals = 0;
    let earlyDepartures = 0;
    let lateDepartures = 0;
    let onTimeDepartures = 0;
    let totalWorkedMinutes = 0;
    let totalLateMinutes = 0;
    let totalEarlyDepartureMinutes = 0;

    const dailyDetails = [];

    Object.entries(byDate).forEach(([date, dayRecords]) => {
      const checkIn = dayRecords.find((r) => r.type === "check_in");
      const checkOut = dayRecords.find((r) => r.type === "check_out");

      if (!checkIn) return;
      totalDays++;

      const checkInTime = new Date(checkIn.createdAt);
      const checkInHour = checkInTime.getHours();
      const checkInMinute = checkInTime.getMinutes();
      const checkInTotalMin = checkInHour * 60 + checkInMinute;

      let arrivalStatus = "no_schedule";
      let arrivalDiffMin = 0;

      if (hasPosition) {
        const scheduledStartMin = startHour * 60 + startMin;
        arrivalDiffMin = checkInTotalMin - scheduledStartMin;

        if (arrivalDiffMin > 5) {
          lateArrivals++;
          arrivalStatus = "late";
          totalLateMinutes += arrivalDiffMin;
        } else if (arrivalDiffMin < -5) {
          earlyArrivals++;
          arrivalStatus = "early";
        } else {
          onTimeArrivals++;
          arrivalStatus = "on_time";
        }
      }

      let departureStatus = "no_checkout";
      let departureDiffMin = 0;
      let workedMinutes = 0;

      if (checkOut) {
        const checkOutTime = new Date(checkOut.createdAt);
        const checkOutHour = checkOutTime.getHours();
        const checkOutMinute = checkOutTime.getMinutes();
        const checkOutTotalMin = checkOutHour * 60 + checkOutMinute;

        workedMinutes = checkOutTotalMin - checkInTotalMin;
        totalWorkedMinutes += workedMinutes;

        if (hasPosition) {
          const scheduledEndMin = endHour * 60 + endMin;
          departureDiffMin = checkOutTotalMin - scheduledEndMin;

          if (departureDiffMin < -5) {
            earlyDepartures++;
            departureStatus = "early";
            totalEarlyDepartureMinutes += Math.abs(departureDiffMin);
          } else if (departureDiffMin > 5) {
            lateDepartures++;
            departureStatus = "late";
          } else {
            onTimeDepartures++;
            departureStatus = "on_time";
          }
        } else {
          departureStatus = "no_schedule";
        }
      }

      dailyDetails.push({
        date,
        checkInTime: checkIn.createdAt,
        checkOutTime: checkOut ? checkOut.createdAt : null,
        checkInPhoto: checkIn.photo,
        checkOutPhoto: checkOut ? checkOut.photo : null,
        arrivalStatus,
        arrivalDiffMin,
        departureStatus,
        departureDiffMin,
        workedMinutes,
      });
    });

    const avgWorkedMinutes = totalDays > 0 ? Math.round(totalWorkedMinutes / totalDays) : 0;

    // Calculate salary, penalty, premium
    let totalPenalty = 0;
    let totalPremium = 0;
    const salary = hasPosition ? (employee.position.salary || 0) : 0;
    const penaltyPerMin = hasPosition ? (employee.position.penaltyPerMinutes || 10) : 10;
    const penaltyAmt = hasPosition ? (employee.position.penaltyAmount || 0) : 0;
    const premiumEnabled = hasPosition ? (employee.position.premiumEnabled || false) : false;
    const premiumPerMin = hasPosition ? (employee.position.premiumPerMinutes || 10) : 10;
    const premiumAmt = hasPosition ? (employee.position.premiumAmount || 0) : 0;

    if (hasPosition && penaltyAmt > 0) {
      // penalty = (totalLateMinutes / penaltyPerMin) * penaltyAmount
      totalPenalty = Math.floor(totalLateMinutes / penaltyPerMin) * penaltyAmt;
    }

    if (hasPosition && premiumEnabled && premiumAmt > 0) {
      // For each day where employee left late (overtime), calculate premium
      dailyDetails.forEach((day) => {
        if (day.departureStatus === "late" && day.departureDiffMin > 0) {
          totalPremium += Math.floor(day.departureDiffMin / premiumPerMin) * premiumAmt;
        }
      });
    }

    const netSalary = salary - totalPenalty + totalPremium;

    res.json({
      employee: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        status: employee.status,
        branch: employee.branch,
        position: employee.position,
      },
      period: {
        year: targetYear,
        month: targetMonth,
        startDate,
        endDate,
      },
      schedule: {
        workStartTime: workStart,
        workEndTime: workEnd,
        scheduledMinutes,
      },
      summary: {
        totalDays,
        lateArrivals,
        earlyArrivals,
        onTimeArrivals,
        earlyDepartures,
        lateDepartures,
        onTimeDepartures,
        totalWorkedMinutes,
        avgWorkedMinutes,
        totalLateMinutes,
        totalEarlyDepartureMinutes,
        scheduledTotalMinutes: totalDays * scheduledMinutes,
      },
      finance: {
        salary,
        totalPenalty,
        totalPremium,
        netSalary,
        penaltyPerMinutes: penaltyPerMin,
        penaltyAmount: penaltyAmt,
        premiumEnabled,
        premiumPerMinutes: premiumPerMin,
        premiumAmount: premiumAmt,
      },
      dailyDetails,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create employee
const createEmployee = async (req, res) => {
  try {
    const { firstName, lastName, phone, password, branch, position } = req.body;
    const orgId = req.user.organizationId;

    const existing = await Employee.findOne({ phone });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Этот номер телефона уже зарегистрирован" });
    }

    const encryptedPassword = encrypt(password);

    const employee = await Employee.create({
      organization: orgId,
      branch,
      position,
      firstName,
      lastName,
      phone,
      password: encryptedPassword,
    });

    const populated = await Employee.findById(employee._id)
      .populate("branch", "name")
      .populate("position", "name workStartTime workEndTime");

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update employee
const updateEmployee = async (req, res) => {
  try {
    const { firstName, lastName, phone, password, branch, position } = req.body;
    const updateData = { firstName, lastName, phone, branch, position };

    if (password) {
      updateData.password = encrypt(password);
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
      .populate("branch", "name")
      .populate("position", "name workStartTime workEndTime");

    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete employee
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }
    res.json({ message: "Сотрудник удалён" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// View decrypted password
const viewEmployeePassword = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }
    const decrypted = decrypt(employee.password);
    res.json({ password: decrypted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getEmployees,
  getEmployee,
  getEmployeeStats,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  viewEmployeePassword,
};
