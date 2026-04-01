const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const Employee = require("../models/Employee");
const { encrypt } = require("../utils/encryption");

// Get all organizations
const getOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.find().sort({ createdAt: -1 });

    const result = await Promise.all(
      organizations.map(async (org) => {
        const branchCount = await Branch.countDocuments({ organization: org._id });
        const employeeCount = await Employee.countDocuments({ organization: org._id });
        return {
          ...org.toObject(),
          branchCount,
          employeeCount,
        };
      })
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single organization
const getOrganization = async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) {
      return res.status(404).json({ message: "Ұйым табылмады" });
    }
    res.json(org);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create organization
const createOrganization = async (req, res) => {
  try {
    const { name, login, password, phone } = req.body;

    const existing = await Organization.findOne({ login });
    if (existing) {
      return res.status(400).json({ message: "Бұл логин бос емес" });
    }

    const encryptedPassword = encrypt(password);
    const logo = req.file ? `/uploads/${req.file.filename}` : "";

    const org = await Organization.create({
      name,
      login,
      password: encryptedPassword,
      phone,
      logo,
    });

    res.status(201).json(org);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update organization
const updateOrganization = async (req, res) => {
  try {
    const { name, login, password, phone } = req.body;
    const updateData = { name, login, phone };

    if (password) {
      updateData.password = encrypt(password);
    }

    if (req.file) {
      updateData.logo = `/uploads/${req.file.filename}`;
    }

    const org = await Organization.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!org) {
      return res.status(404).json({ message: "Ұйым табылмады" });
    }

    res.json(org);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete organization
const deleteOrganization = async (req, res) => {
  try {
    const org = await Organization.findByIdAndDelete(req.params.id);
    if (!org) {
      return res.status(404).json({ message: "Ұйым табылмады" });
    }

    // Delete related branches and employees
    await Branch.deleteMany({ organization: req.params.id });
    await Employee.deleteMany({ organization: req.params.id });

    res.json({ message: "Ұйым жойылды" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
};
