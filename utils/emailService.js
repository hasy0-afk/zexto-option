const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

transporter.verify().then(() => console.log("📧 Email service ready")).catch((err) => {
  console.warn("⚠️ Email service not configured:", err.message);
  console.warn("   Set EMAIL_USER and EMAIL_PASS in .env to enable emails");
});

const APP = process.env.APP_NAME || "Zexto Option";
const URL = process.env.APP_URL || "http://localhost:5173";

const base = (title, content) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0c1120;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="text-align:center;padding:30px 20px;background:linear-gradient(135deg,#1a2340,#0f1729);border-radius:16px 16px 0 0;border:1px solid #1e2d4d;border-bottom:none;">
<div style="display:inline-block;width:50px;height:50px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;line-height:50px;font-size:24px;font-weight:900;color:#fff;">Z</div>
<h1 style="color:#fff;font-size:22px;margin:12px 0 0;">${APP}</h1></div>
<div style="background:#141c30;padding:30px 28px;border:1px solid #1e2d4d;border-top:none;border-bottom:none;">
<h2 style="color:#fff;font-size:20px;margin:0 0 20px;">${title}</h2>${content}</div>
<div style="background:#0f1729;padding:20px 28px;border-radius:0 0 16px 16px;border:1px solid #1e2d4d;border-top:none;text-align:center;">
<p style="color:#5a6a8a;font-size:11px;margin:0;">© ${new Date().getFullYear()} ${APP}. All rights reserved.</p></div></div></body></html>`;

const btn = (text, url, color = "#f59e0b") => `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,${color},${color}cc);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">${text}</a></div>`;
const row = (l, v) => `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1e2d4d;"><span style="color:#5a6a8a;font-size:13px;">${l}</span><span style="color:#fff;font-size:13px;font-weight:600;">${v}</span></div>`;
const p = (t) => `<p style="color:#c0c8d8;font-size:14px;line-height:1.7;margin:0 0 16px;">${t}</p>`;
const box = (content) => `<div style="background:#0f1729;border:1px solid #1e2d4d;border-radius:12px;padding:20px;margin:20px 0;">${content}</div>`;

const send = async (to, subject, html) => {
  try {
    await transporter.sendMail({ from: `"${APP}" <${process.env.EMAIL_USER}>`, to, subject, html });
    console.log(`📧 Email sent → ${to}: ${subject}`);
  } catch (err) { console.error(`📧 Email failed → ${to}:`, err.message); }
};

// ═══ 1. WELCOME ═══
const sendWelcomeEmail = (email, name) => send(email, `Welcome to ${APP}! 🚀`, base("Welcome Aboard! 🎉",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Welcome to ${APP}! Your account has been created successfully. Start trading with your demo balance.`) +
  box(row("Demo Balance", "$10,000.00") + row("Trading Pairs", "Crypto + Forex OTC") + row("Max Payout", "Up to 92%")) +
  btn("Start Trading", URL)
));

// ═══ 2. DEPOSIT CONFIRMED ═══
const sendDepositEmail = (email, name, { currency, amount, amountUSD, newBalance }) => send(email,
  `Deposit Confirmed: +$${parseFloat(amountUSD).toFixed(2)} 💰`, base("Deposit Confirmed ✅",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Your deposit has been confirmed and credited to your account.`) +
  `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#22c55e18;border:1px solid #22c55e44;border-radius:12px;"><div style="color:#22c55e;font-size:28px;font-weight:800;">+$${parseFloat(amountUSD).toFixed(2)}</div></div></div>` +
  box(row("Currency", currency) + row("Amount", parseFloat(amount).toFixed(8) + " " + currency) + row("USD Value", "$" + parseFloat(amountUSD).toFixed(2)) + row("New Balance", "$" + parseFloat(newBalance).toFixed(2)) + row("Status", '<span style="color:#22c55e;">✓ Confirmed</span>')) +
  btn("Go to Dashboard", URL)
));

// ═══ 3. WITHDRAWAL REQUEST ═══
const sendWithdrawalEmail = (email, name, { currency, amount, walletAddress, newBalance }) => {
  const masked = walletAddress.slice(0, 8) + "..." + walletAddress.slice(-6);
  return send(email, `Withdrawal Request: $${parseFloat(amount).toFixed(2)} 📤`, base("Withdrawal Requested",
    p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
    p(`Your withdrawal request has been submitted.`) +
    `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#f59e0b18;border:1px solid #f59e0b44;border-radius:12px;"><div style="color:#f59e0b;font-size:28px;font-weight:800;">-$${parseFloat(amount).toFixed(2)}</div></div></div>` +
    box(row("Amount", "$" + parseFloat(amount).toFixed(2)) + row("Currency", currency) + row("Wallet", masked) + row("Status", '<span style="color:#f59e0b;">⏳ Pending</span>')) +
    `<div style="background:#f59e0b11;border:1px solid #f59e0b22;border-radius:8px;padding:14px;margin:16px 0;"><p style="color:#f59e0b;font-size:12px;margin:0;font-weight:600;">⚠️ Didn't request this?</p><p style="color:#5a6a8a;font-size:11px;margin:6px 0 0;">Contact support immediately and change your password.</p></div>`
  ));
};

// ═══ 4. WITHDRAWAL PROCESSING ═══
const sendWithdrawalProcessingEmail = (email, name, { amount, currency }) => send(email,
  `Withdrawal Processing: $${parseFloat(amount).toFixed(2)} ⏳`, base("Withdrawal Being Processed",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Your withdrawal of <strong style="color:#f59e0b;">$${parseFloat(amount).toFixed(2)}</strong> in ${currency} is now being processed.`) +
  `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#3b82f618;border:1px solid #3b82f644;border-radius:12px;"><div style="color:#3b82f6;font-size:28px;font-weight:800;">$${parseFloat(amount).toFixed(2)}</div><div style="color:#5a6a8a;font-size:12px;margin-top:4px;">Processing</div></div></div>` +
  p(`This usually takes 1-24 hours. You will receive another email once the transfer is complete.`) +
  btn("Check Status", URL)
));

// ═══ 5. WITHDRAWAL COMPLETED ═══
const sendWithdrawalCompletedEmail = (email, name, { amount, currency, walletAddress }) => {
  const masked = walletAddress ? walletAddress.slice(0, 8) + "..." + walletAddress.slice(-6) : "—";
  return send(email, `Withdrawal Completed: $${parseFloat(amount).toFixed(2)} ✅`, base("Withdrawal Completed!",
    p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
    p(`Your withdrawal has been completed successfully.`) +
    `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#22c55e18;border:1px solid #22c55e44;border-radius:12px;"><div style="color:#22c55e;font-size:28px;font-weight:800;">$${parseFloat(amount).toFixed(2)}</div><div style="color:#5a6a8a;font-size:12px;margin-top:4px;">Sent Successfully</div></div></div>` +
    box(row("Amount", "$" + parseFloat(amount).toFixed(2)) + row("Currency", currency) + row("Sent To", masked) + row("Status", '<span style="color:#22c55e;">✓ Completed</span>')) +
    p(`The funds should appear in your wallet shortly.`) +
    btn("Go to Dashboard", URL)
  ));
};

// ═══ 6. WITHDRAWAL REJECTED ═══
const sendWithdrawalRejectedEmail = (email, name, { amount, currency, reason }) => send(email,
  `Withdrawal Rejected: $${parseFloat(amount).toFixed(2)} ❌`, base("Withdrawal Rejected",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Your withdrawal request of <strong style="color:#ef4444;">$${parseFloat(amount).toFixed(2)}</strong> in ${currency} has been rejected.`) +
  `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#ef444418;border:1px solid #ef444444;border-radius:12px;"><div style="color:#ef4444;font-size:28px;font-weight:800;">$${parseFloat(amount).toFixed(2)}</div><div style="color:#5a6a8a;font-size:12px;margin-top:4px;">Rejected</div></div></div>` +
  box(row("Amount", "$" + parseFloat(amount).toFixed(2)) + row("Currency", currency) + row("Reason", reason || "Policy violation") + row("Status", '<span style="color:#ef4444;">✗ Rejected</span>')) +
  p(`The amount has been refunded to your trading balance. If you believe this is an error, please contact support.`) +
  btn("Contact Support", URL)
));

// ═══ 7. KYC SUBMITTED ═══
const sendKycSubmittedEmail = (email, name) => send(email,
  `KYC Verification Submitted 📋`, base("KYC Submitted",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Your identity verification documents have been submitted successfully.`) +
  `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#3b82f618;border:1px solid #3b82f644;border-radius:12px;"><div style="color:#3b82f6;font-size:20px;font-weight:700;">📋 Under Review</div></div></div>` +
  p(`Our team will review your documents within <strong style="color:#fff;">24-48 hours</strong>. You will receive an email once the review is complete.`) +
  box(row("Status", '<span style="color:#f59e0b;">⏳ Pending Review</span>') + row("Expected Time", "24-48 hours")) +
  btn("Check Status", URL)
));

// ═══ 8. KYC APPROVED ═══
const sendKycApprovedEmail = (email, name) => send(email,
  `KYC Verified Successfully ✅`, base("Identity Verified! 🎉",
  p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
  p(`Congratulations! Your identity has been verified successfully. You now have full access to all platform features.`) +
  `<div style="text-align:center;margin:20px 0;"><div style="display:inline-block;padding:16px 40px;background:#22c55e18;border:1px solid #22c55e44;border-radius:12px;"><div style="color:#22c55e;font-size:20px;font-weight:700;">✓ Verified</div></div></div>` +
  box(row("Status", '<span style="color:#22c55e;">✓ Approved</span>') + row("Withdrawals", "Enabled") + row("Deposit Limits", "Increased")) +
  btn("Start Trading", URL, "#22c55e")
));

// ═══ 9. PASSWORD RESET ═══
const sendPasswordResetEmail = (email, name, resetToken) => {
  const resetUrl = `${URL}/#/reset-password?token=${resetToken}`;
  return send(email, `Password Reset Request 🔒`, base("Reset Your Password",
    p(`Hi <strong style="color:#fff;">${name}</strong>,`) +
    p(`We received a request to reset your password. Click the button below to create a new password.`) +
    btn("Reset Password", resetUrl, "#3b82f6") +
    `<div style="background:#3b82f611;border:1px solid #3b82f622;border-radius:8px;padding:14px;margin:16px 0;"><p style="color:#5a6a8a;font-size:11px;margin:0;">This link expires in <strong style="color:#fff;">1 hour</strong>. If you didn't request this, ignore this email.</p></div>`
  ));
};

module.exports = {
  sendWelcomeEmail,
  sendDepositEmail,
  sendWithdrawalEmail,
  sendWithdrawalProcessingEmail,
  sendWithdrawalCompletedEmail,
  sendWithdrawalRejectedEmail,
  sendKycSubmittedEmail,
  sendKycApprovedEmail,
  sendPasswordResetEmail,
};
