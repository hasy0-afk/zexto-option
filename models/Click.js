const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema({
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  referralLink: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralLink', default: null },
  ip: { type: String, default: '' },
  country: { type: String, default: '' },
  device: { type: String, default: '' },
  source: { type: String, default: 'direct' },
}, { timestamps: true });

module.exports = mongoose.model('Click', clickSchema);