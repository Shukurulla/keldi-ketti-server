require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const { encrypt } = require("./utils/encryption");

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await Admin.findOne({ login: "admin" });
  if (!existing) {
    await Admin.create({
      login: "admin",
      password: encrypt("admin123"),
      role: "system_admin",
    });
    console.log("System admin created: login=admin, password=admin123");
  } else {
    console.log("System admin already exists");
  }

  await mongoose.disconnect();
};

seed();
