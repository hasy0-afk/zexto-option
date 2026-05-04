const jwt = require('jsonwebtoken');
const Partner = require('../models/Partner');
const JWT_SECRET = process.env.JWT_SECRET || 'zexto-partner-secret-key-change-in-production';

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

const protectPartner = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.partner = await Partner.findById(decoded.id).select('-password');
      if (!req.partner) return res.status(401).json({ success: false, message: 'Partner not found' });
      if (!req.partner.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });
      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  }
  if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });
};

module.exports = { generateToken, protectPartner, JWT_SECRET };