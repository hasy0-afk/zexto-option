const KYC = require("../models/KYC");
const User = require("../models/User");
const { sendKycSubmittedEmail } = require("../utils/emailService");

// GET /api/kyc/me — get current user's KYC status
exports.getMyKYC = async (req, res, next) => {
  try {
    const kyc = await KYC.findOne({ user: req.user._id });
    if (!kyc) {
      return res.json({
        success: true,
        kyc: null,
        status: "not_submitted",
      });
    }
    res.json({
      success: true,
      kyc: {
        _id: kyc._id,
        fullName: kyc.fullName,
        dateOfBirth: kyc.dateOfBirth,
        nationality: kyc.nationality,
        addressLine: kyc.addressLine,
        city: kyc.city,
        country: kyc.country,
        postalCode: kyc.postalCode,
        documents: kyc.documents.map((d) => ({
          type: d.type,
          uploadedAt: d.uploadedAt,
          hasFile: !!d.url,
        })),
        status: kyc.status,
        rejectionReason: kyc.rejectionReason,
        reviewedAt: kyc.reviewedAt,
        submittedAt: kyc.submittedAt,
      },
      status: kyc.status,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/kyc — submit KYC
exports.submitKYC = async (req, res, next) => {
  try {
    const {
      fullName,
      dateOfBirth,
      nationality,
      addressLine,
      city,
      country,
      postalCode,
      documents, // array of { type, url (base64 or URL) }
    } = req.body;

    // Validate required fields
    if (!fullName || !dateOfBirth || !nationality || !country) {
      return res.status(400).json({
        success: false,
        message: "Full name, date of birth, nationality, and country are required",
      });
    }
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one document is required",
      });
    }

    // Validate each document has type + url
    for (const doc of documents) {
      if (!doc.type || !doc.url) {
        return res.status(400).json({
          success: false,
          message: "Each document must have type and file data",
        });
      }
      // Size check: base64 string length * 0.75 ≈ bytes. Limit to 5MB per doc
      if (doc.url.length > 7_000_000) {
        return res.status(400).json({
          success: false,
          message: `Document "${doc.type}" is too large (max 5MB each)`,
        });
      }
    }

    // Check if user already has a KYC
    let kyc = await KYC.findOne({ user: req.user._id });

    if (kyc) {
      // Only allow re-submit if previous was rejected OR still pending
      if (kyc.status === "approved") {
        return res.status(400).json({
          success: false,
          message: "Your KYC is already approved",
        });
      }
      // Update existing — reset to pending
      kyc.fullName = fullName;
      kyc.dateOfBirth = new Date(dateOfBirth);
      kyc.nationality = nationality;
      kyc.addressLine = addressLine || "";
      kyc.city = city || "";
      kyc.country = country;
      kyc.postalCode = postalCode || "";
      kyc.documents = documents.map((d) => ({
        type: d.type,
        url: d.url,
        uploadedAt: new Date(),
      }));
      kyc.status = "pending";
      kyc.rejectionReason = "";
      kyc.submittedAt = new Date();
      kyc.reviewedAt = null;
      kyc.reviewedBy = "";
      await kyc.save();
    } else {
      kyc = await KYC.create({
        user: req.user._id,
        fullName,
        dateOfBirth: new Date(dateOfBirth),
        nationality,
        addressLine: addressLine || "",
        city: city || "",
        country,
        postalCode: postalCode || "",
        documents: documents.map((d) => ({
          type: d.type,
          url: d.url,
          uploadedAt: new Date(),
        })),
        status: "pending",
        submittedAt: new Date(),
      });
    }

    res.status(201).json({
      success: true,
      message: "KYC submitted successfully — awaiting review",
      status: kyc.status,
    });

    // Send KYC submitted email (non-blocking)
    const user = await User.findById(req.user._id);
    if (user) sendKycSubmittedEmail(user.email, user.name).catch(() => {});
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "KYC already submitted for this user",
      });
    }
    next(err);
  }
};

// GET /api/admin/kyc/:id/document/:docIndex — admin views a document
exports.getDocument = async (req, res, next) => {
  try {
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC not found" });
    }
    const idx = parseInt(req.params.docIndex);
    const doc = kyc.documents[idx];
    if (!doc) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }
    res.json({
      success: true,
      document: {
        type: doc.type,
        url: doc.url, // base64 data URI
        uploadedAt: doc.uploadedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
