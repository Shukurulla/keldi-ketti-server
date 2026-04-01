const { exec } = require("child_process");
const path = require("path");
const cron = require("node-cron");

const startBackupSchedule = () => {
  // Every 6 hours: 0 */6 * * *
  cron.schedule("0 */6 * * *", () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(
      process.env.BACKUP_DIR || "./backups",
      `backup-${timestamp}`
    );

    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/keldi-ketti";

    const cmd = `mongodump --uri="${uri}" --out="${backupDir}"`;

    console.log(`[Backup] Starting backup at ${new Date().toISOString()}`);

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Backup] Error: ${error.message}`);
        return;
      }
      console.log(`[Backup] Completed: ${backupDir}`);
    });
  });

  console.log("[Backup] Scheduled every 6 hours");
};

module.exports = { startBackupSchedule };
