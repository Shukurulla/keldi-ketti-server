const Branch = require("../models/Branch");
const Employee = require("../models/Employee");

// Get branches by organization
const getBranches = async (req, res) => {
  try {
    const orgId = req.user.role === "system_admin" ? req.params.orgId : req.user.organizationId;

    const branches = await Branch.find({ organization: orgId }).sort({ createdAt: -1 });

    const result = await Promise.all(
      branches.map(async (branch) => {
        const employeeCount = await Employee.countDocuments({ branch: branch._id });
        return { ...branch.toObject(), employeeCount };
      })
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single branch
const getBranch = async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал табылмады" });
    }
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create branch
const createBranch = async (req, res) => {
  try {
    const { name, latitude, longitude, radius } = req.body;
    const orgId = req.user.organizationId;

    const branch = await Branch.create({
      organization: orgId,
      name,
      latitude,
      longitude,
      radius: radius || 30,
    });

    res.status(201).json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update branch
const updateBranch = async (req, res) => {
  try {
    const { name, latitude, longitude, radius } = req.body;

    const branch = await Branch.findByIdAndUpdate(
      req.params.id,
      { name, latitude, longitude, radius },
      { new: true }
    );

    if (!branch) {
      return res.status(404).json({ message: "Филиал табылмады" });
    }

    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete branch
const deleteBranch = async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал табылмады" });
    }

    await Employee.deleteMany({ branch: req.params.id });

    res.json({ message: "Филиал жойылды" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getBranches, getBranch, createBranch, updateBranch, deleteBranch };
