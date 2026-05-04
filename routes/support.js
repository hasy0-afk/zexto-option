const express = require("express");
const router = express.Router();
const Ticket = require("../models/Ticket");
const { protect } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --- File Upload Setup ---
const uploadDir = path.join(__dirname, "../uploads/tickets");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  }
});

// ========================
// USER ROUTES (require user JWT via protect)
// ========================

router.post("/", protect, upload.array("attachments", 3), async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;
    if (!subject || !message) {
      return res.json({ success: false, error: "Subject and message are required" });
    }
    const attachments = (req.files || []).map(f => `/uploads/tickets/${f.filename}`);
    const ticket = new Ticket({
      userId: req.user._id,
      userName: req.user.name || "",
      userEmail: req.user.email || "",
      subject,
      category: category || "other",
      priority: priority || "medium",
      messages: [{
        sender: "user",
        senderName: req.user.name || req.user.email,
        text: message,
        attachments
      }]
    });
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    console.error("Create ticket error:", err);
    res.json({ success: false, error: "Failed to create ticket" });
  }
});

router.get("/my", protect, async (req, res) => {
  try {
    const tickets = await Ticket.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select("-messages");
    res.json({ success: true, tickets });
  } catch (err) {
    res.json({ success: false, error: "Failed to fetch tickets" });
  }
});

router.get("/:id", protect, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to fetch ticket" });
  }
});

router.post("/:id/reply", protect, upload.array("attachments", 3), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ success: false, error: "Message is required" });
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    if (ticket.status === "closed") return res.json({ success: false, error: "Ticket is closed" });
    const attachments = (req.files || []).map(f => `/uploads/tickets/${f.filename}`);
    ticket.messages.push({
      sender: "user",
      senderName: req.user.name || req.user.email,
      text: message,
      attachments
    });
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = "user";
    if (ticket.status === "awaiting_reply") ticket.status = "in_progress";
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to send reply" });
  }
});

router.post("/:id/close", protect, async (req, res) => {
  try {
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    ticket.status = "closed";
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to close ticket" });
  }
});

module.exports = router;


// ========================
// ADMIN ROUTES — exported separately
// ========================
const adminRouter = express.Router();

// List all tickets
adminRouter.get("/all", async (req, res) => {
  try {
    const { status, category, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    const tickets = await Ticket.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Ticket.countDocuments(filter);
    res.json({ success: true, tickets, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.json({ success: false, error: "Failed to fetch tickets" });
  }
});

// Get single ticket with messages
adminRouter.get("/:id", async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to fetch ticket" });
  }
});

// Admin reply
adminRouter.post("/:id/reply", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.json({ success: false, error: "Message is required" });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    ticket.messages.push({
      sender: "admin",
      senderName: "Support Team",
      text: message
    });
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = "admin";
    ticket.status = "awaiting_reply";
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to send reply" });
  }
});

// Update ticket status/priority
adminRouter.patch("/:id", async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.body;
    const update = { updatedAt: new Date() };
    if (status) update.status = status;
    if (priority) update.priority = priority;
    if (assignedTo !== undefined) update.assignedTo = assignedTo;
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!ticket) return res.json({ success: false, error: "Ticket not found" });
    res.json({ success: true, ticket });
  } catch (err) {
    res.json({ success: false, error: "Failed to update ticket" });
  }
});

module.exports.adminRouter = adminRouter;
