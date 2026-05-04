const mongoose = require('mongoose');

const referralLinkSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  name: { type: String, trim: true, default: '' },
  campaignName: { type: String, trim: true, default: '' },
  source: { type: String, default: 'Direct' },
  url: { type: String, required: true },
  clicks: { type: Number, default: 0 },
  signups: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

referralLinkSchema.index({ partner: 1 });

module.exports = mongoose.model('ReferralLink', referralLinkSchema);
