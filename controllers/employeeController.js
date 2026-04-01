const Employee = require("../models/Employee");
const { encrypt, decrypt } = require("../utils/encryption");

// Get employees by organization/branch
const getEmployees = async (req, res) => {
  try {
    const orgId = req.user.role === "system_admin" ? req.params.orgId : req.user.organizationId;
    const filter = { organization: orgId };

    if (req.query.branch) {
      filter.branch = req.query.branch;
    }

    const employees = await Employee.find(filter)
      .populate("branch", "name")
      .sort({ createdAt: -1 });

    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single employee
const getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate("organization branch");
    if (!employee) {
      return res.status(404).json({ message: "Қызметкер табылмады" });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create employee
const createEmployee = async (req, res) => {
  try {
    const { firstName, lastName, phone, password, branch } = req.body;
    const orgId = req.user.organizationId;

    const existing = await Employee.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Бұл телефон нөмірі тіркелген" });
    }

    const encryptedPassword = encrypt(password);

    const employee = await Employee.create({
      organization: orgId,
      branch,
      firstName,
      lastName,
      phone,
      password: encryptedPassword,
    });

    res.status(201).json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update employee
const updateEmployee = async (req, res) => {
  try {
    const { firstName, lastName, phone, password, branch } = req.body;
    const updateData = { firstName, lastName, phone, branch };

    if (password) {
      updateData.password = encrypt(password);
    }

    const employee = await Employee.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!employee) {
      return res.status(404).json({ message: "Қызметкер табылмады" });
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
      return res.status(404).json({ message: "Қызметкер табылмады" });
    }
    res.json({ message: "Қызметкер жойылды" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// View decrypted password
const viewEmployeePassword = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Қызметкер табылмады" });
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
  createEmployee,
  updateEmployee,
  deleteEmployee,
  viewEmployeePassword,
};
