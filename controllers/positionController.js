const Position = require("../models/Position");
const Employee = require("../models/Employee");

// Get all positions for organization
const getPositions = async (req, res) => {
  try {
    const orgId =
      req.user.role === "system_admin"
        ? req.params.orgId
        : req.user.organizationId;

    const positions = await Position.find({ organization: orgId }).sort({
      createdAt: -1,
    });

    // Count employees per position
    const positionsWithCount = await Promise.all(
      positions.map(async (pos) => {
        const employeeCount = await Employee.countDocuments({
          position: pos._id,
        });
        return { ...pos.toObject(), employeeCount };
      })
    );

    res.json(positionsWithCount);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single position
const getPosition = async (req, res) => {
  try {
    const position = await Position.findById(req.params.id);
    if (!position) {
      return res.status(404).json({ message: "Должность не найдена" });
    }
    res.json(position);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create position
const createPosition = async (req, res) => {
  try {
    const { name, workStartTime, workEndTime } = req.body;
    const orgId = req.user.organizationId;

    const existing = await Position.findOne({
      organization: orgId,
      name: name.trim(),
    });
    if (existing) {
      return res.status(400).json({ message: "Эта должность уже существует" });
    }

    const position = await Position.create({
      organization: orgId,
      name: name.trim(),
      workStartTime,
      workEndTime,
    });

    res.status(201).json(position);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update position
const updatePosition = async (req, res) => {
  try {
    const { name, workStartTime, workEndTime } = req.body;

    const position = await Position.findByIdAndUpdate(
      req.params.id,
      { name: name?.trim(), workStartTime, workEndTime },
      { new: true }
    );

    if (!position) {
      return res.status(404).json({ message: "Должность не найдена" });
    }

    res.json(position);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete position
const deletePosition = async (req, res) => {
  try {
    const employeeCount = await Employee.countDocuments({
      position: req.params.id,
    });
    if (employeeCount > 0) {
      return res.status(400).json({
        message: `В этой должности ${employeeCount} сотрудников. Сначала переведите их на другую должность`,
      });
    }

    const position = await Position.findByIdAndDelete(req.params.id);
    if (!position) {
      return res.status(404).json({ message: "Должность не найдена" });
    }

    res.json({ message: "Должность удалена" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getPositions,
  getPosition,
  createPosition,
  updatePosition,
  deletePosition,
};
