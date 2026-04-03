const mongoose = require("mongoose");

const positionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    workStartTime: {
      type: String, // "09:00"
      required: true,
    },
    workEndTime: {
      type: String, // "18:00"
      required: true,
    },
    // Salary
    salary: {
      type: Number,
      default: 0,
    },
    // Penalty for being late
    penaltyPerMinutes: {
      type: Number, // every N minutes late
      default: 10,
    },
    penaltyAmount: {
      type: Number, // amount deducted per N minutes
      default: 0,
    },
    // Premium for staying late (overtime)
    premiumEnabled: {
      type: Boolean,
      default: false,
    },
    premiumPerMinutes: {
      type: Number, // every N minutes overtime
      default: 10,
    },
    premiumAmount: {
      type: Number, // bonus per N minutes
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Position", positionSchema);
