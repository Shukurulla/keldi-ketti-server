const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Organization = require("../models/Organization");
const Employee = require("../models/Employee");
const { encrypt, decrypt } = require("../utils/encryption");

// System Admin login
const adminLogin = async (req, res) => {
  try {
    const { login, password } = req.body;
    const admin = await Admin.findOne({ login });

    if (!admin) {
      return res.status(401).json({ message: "Логин немесе құпия сөз қате" });
    }

    const decryptedPassword = decrypt(admin.password);
    if (decryptedPassword !== password) {
      return res.status(401).json({ message: "Логин немесе құпия сөз қате" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "system_admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, role: "system_admin", user: { id: admin._id, login: admin.login } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Organization Admin login
const orgLogin = async (req, res) => {
  try {
    const { login, password } = req.body;
    const org = await Organization.findOne({ login });

    if (!org) {
      return res.status(401).json({ message: "Логин немесе құпия сөз қате" });
    }

    const decryptedPassword = decrypt(org.password);
    if (decryptedPassword !== password) {
      return res.status(401).json({ message: "Логин немесе құпия сөз қате" });
    }

    const token = jwt.sign(
      { id: org._id, role: "org_admin", organizationId: org._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      role: "org_admin",
      user: { id: org._id, name: org.name, login: org.login },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Employee login
const employeeLogin = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const employee = await Employee.findOne({ phone }).populate("organization branch");

    if (!employee) {
      return res.status(401).json({ message: "Телефон немесе құпия сөз қате" });
    }

    const decryptedPassword = decrypt(employee.password);
    if (decryptedPassword !== password) {
      return res.status(401).json({ message: "Телефон немесе құпия сөз қате" });
    }

    const token = jwt.sign(
      {
        id: employee._id,
        role: "employee",
        organizationId: employee.organization._id,
        branchId: employee.branch._id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      role: "employee",
      user: {
        id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        status: employee.status,
        organization: employee.organization,
        branch: employee.branch,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unified Admin Panel login (system_admin + org_admin)
const unifiedAdminLogin = async (req, res) => {
  try {
    const { login, password } = req.body;

    // First try Admin collection (system_admin)
    const admin = await Admin.findOne({ login });
    if (admin) {
      const decryptedPassword = decrypt(admin.password);
      if (decryptedPassword === password) {
        const token = jwt.sign(
          { id: admin._id, role: "system_admin" },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.json({
          token,
          role: "system_admin",
          user: { id: admin._id, login: admin.login },
        });
      }
    }

    // Then try Organization collection (org_admin)
    const org = await Organization.findOne({ login });
    if (org) {
      const decryptedPassword = decrypt(org.password);
      if (decryptedPassword === password) {
        const token = jwt.sign(
          { id: org._id, role: "org_admin", organizationId: org._id },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.json({
          token,
          role: "org_admin",
          user: { id: org._id, name: org.name, login: org.login },
        });
      }
    }

    return res.status(401).json({ message: "Неверный логин или пароль" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Decrypt password (for admin view)
const viewPassword = async (req, res) => {
  try {
    const { encryptedPassword } = req.body;
    const decrypted = decrypt(encryptedPassword);
    res.json({ password: decrypted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { adminLogin, orgLogin, employeeLogin, viewPassword, unifiedAdminLogin };
