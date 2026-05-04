const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["user", "admin"], required: true },
  senderName: { type: String, default: "" },
  text: { type: String, required: true },
  attachments: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  ticketId: { type: String, unique: true },
  subject: { type: String, required: true, maxlength: 200 },
  category: {
    type: String,
    enum: ["deposit", "withdrawal", "trading", "account", "kyc", "technical", "other"],
    default: "other"
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium"
  },
  status: {
    type: String,
    enum: ["open", "in_progress", "awaiting_reply", "resolved", "closed"],
    default: "open"
  },
  messages: [messageSchema],
  lastReplyAt: { type: Date, default: Date.now },
  lastReplyBy: { type: String, enum: ["user", "admin"], default: "user" },
  assignedTo: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ticketSchema.pre("save", async function (next) {
  if (!this.ticketId) {
    const count = await mongoose.model("Ticket").countDocuments();
    this.ticketId = "ZXT-" + String(count + 1).padStart(6, "0");
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Ticket", ticketSchema);
