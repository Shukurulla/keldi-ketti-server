const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/db");
const { startBackupSchedule } = require("./utils/backup");

const authRoutes = require("./routes/auth");
const organizationRoutes = require("./routes/organization");
const branchRoutes = require("./routes/branch");
const employeeRoutes = require("./routes/employee");
const attendanceRoutes = require("./routes/attendance");
const positionRoutes = require("./routes/position");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/positions", positionRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  startBackupSchedule();

  // Start Telegram bot
  const { startBot } = require("./bot");
  startBot();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
