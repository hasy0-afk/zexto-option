const jwt = require("jsonwebtoken");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const ADMIN_SECRET = process.env.JWT_SECRET || "admin-secret-fallback";

// Generate admin JWT token
function generateAdminToken() {
  return jwt.sign({ role: "admin", user: ADMIN_USER }, ADMIN_SECRET, {
    expiresIn: "24h",
  });
}

// Verify admin JWT token
function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    return decoded.role === "admin";
  } catch {
    return false;
  }
}

// Middleware: protect admin panel HTML page
function protectAdminPage(req, res, next) {
  // Allow login page and login API
  if (req.path === "/admin-login" || req.path === "/admin-login.html") {
    return next();
  }

  // Check for admin token in cookie or query
  const token =
    req.cookies?.admin_token ||
    req.query?.admin_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (token && verifyAdminToken(token)) {
    return next();
  }

  // Not authenticated — redirect to login page
  res.redirect("/admin-login");
}

// Middleware: protect admin API routes
function protectAdminAPI(req, res, next) {
  const token =
    req.cookies?.admin_token ||
    req.query?.admin_token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);

  if (token && verifyAdminToken(token)) {
    return next();
  }

  res.status(401).json({ success: false, message: "Admin authentication required" });
}

module.exports = {
  ADMIN_USER,
  ADMIN_PASS,
  generateAdminToken,
  verifyAdminToken,
  protectAdminPage,
  protectAdminAPI,
};
