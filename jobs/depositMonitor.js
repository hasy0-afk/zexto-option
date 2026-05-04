const Deposit = require("../models/Deposit");
const User = require("../models/User");
const { ethers } = require("ethers");
const { sendDepositEmail } = require("../utils/emailService");

let priceCache = {};

async function fetchPrices() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price");
    const data = await res.json();
    const find = (sym) => { const t = data.find(d => d.symbol === sym); return t ? parseFloat(t.price) : 0; };
    priceCache = { BTC: find("BTCUSDT"), ETH: find("ETHUSDT"), BNB: find("BNBUSDT"), TRX: find("TRXUSDT"), LTC: find("LTCUSDT"), USDT_TRC20: 1, USDT_BEP20: 1 };
  } catch (e) { console.error("Price fetch error:", e.message); }
}

const RPC = { BSC: "https://bsc-dataseed1.binance.org", ETH: "https://eth.llamarpc.com" };
const USDT_ABI = ["function balanceOf(address) view returns (uint256)"];
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

async function checkBNBBalance(address) { try { const p = new ethers.JsonRpcProvider(RPC.BSC); const b = await p.getBalance(address); return parseFloat(ethers.formatEther(b)); } catch (e) { return 0; } }
async function checkUSDT_BEP20Balance(address) { try { const p = new ethers.JsonRpcProvider(RPC.BSC); const c = new ethers.Contract(USDT_BSC, USDT_ABI, p); const b = await c.balanceOf(address); return parseFloat(ethers.formatUnits(b, 18)); } catch (e) { return 0; } }
async function checkETHBalance(address) { try { const p = new ethers.JsonRpcProvider(RPC.ETH); const b = await p.getBalance(address); return parseFloat(ethers.formatEther(b)); } catch (e) { return 0; } }
async function checkTRXBalance(address) { try { const r = await fetch(`https://api.trongrid.io/v1/accounts/${address}`); if (!r.ok) return 0; const d = await r.json(); return d.data?.[0] ? (d.data[0].balance || 0) / 1e6 : 0; } catch (e) { return 0; } }
async function checkUSDT_TRC20Balance(address) { try { const r = await fetch(`https://api.trongrid.io/v1/accounts/${address}/tokens?limit=20`); if (!r.ok) return 0; const d = await r.json(); const u = d.data?.find(t => t.tokenAbbr === "USDT"); return u ? parseFloat(u.balance) / (10 ** (u.tokenDecimal || 6)) : 0; } catch (e) { return 0; } }
async function checkBTCBalance(address) { try { const r = await fetch(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`); if (!r.ok) return 0; const d = await r.json(); return (d.balance || 0) / 1e8; } catch (e) { return 0; } }
async function checkLTCBalance(address) { try { const r = await fetch(`https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`); if (!r.ok) return 0; const d = await r.json(); return (d.balance || 0) / 1e8; } catch (e) { return 0; } }

async function scanUserDeposits(user) {
  if (!user.depositAddresses) return;
  const checks = [
    { currency: "USDT_BEP20", fn: () => checkUSDT_BEP20Balance(user.depositAddresses.USDT_BEP20) },
    { currency: "BNB", fn: () => checkBNBBalance(user.depositAddresses.BNB) },
    { currency: "ETH", fn: () => checkETHBalance(user.depositAddresses.ETH) },
    { currency: "TRX", fn: () => checkTRXBalance(user.depositAddresses.TRX) },
    { currency: "USDT_TRC20", fn: () => checkUSDT_TRC20Balance(user.depositAddresses.USDT_TRC20) },
    { currency: "BTC", fn: () => checkBTCBalance(user.depositAddresses.BTC) },
    { currency: "LTC", fn: () => checkLTCBalance(user.depositAddresses.LTC) },
  ];

  for (const check of checks) {
    try {
      const balance = await check.fn();
      if (balance <= 0) continue;
      const price = priceCache[check.currency] || 0;
      const amountUSD = check.currency.startsWith("USDT") ? balance : balance * price;
      if (amountUSD < 7) continue;
      const totalCredited = await Deposit.aggregate([{ $match: { userId: user._id, currency: check.currency, status: "completed" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
      const alreadyCredited = totalCredited[0]?.total || 0;
      const newAmount = balance - alreadyCredited;
      if (newAmount < 0.000001) continue;
      const newAmountUSD = check.currency.startsWith("USDT") ? newAmount : newAmount * price;
      if (newAmountUSD < 7) continue;
      const network = check.currency === "BTC" ? "bitcoin" : check.currency === "LTC" ? "litecoin" : check.currency === "ETH" ? "ethereum" : (check.currency === "BNB" || check.currency === "USDT_BEP20") ? "bsc" : "tron";
      const deposit = new Deposit({ userId: user._id, userName: user.name, userEmail: user.email, currency: check.currency, network, depositAddress: user.depositAddresses[check.currency], txHash: `auto_${Date.now()}_${check.currency}`, amount: newAmount, amountUSD: newAmountUSD, confirmations: 20, requiredConfirmations: 1, status: "completed", creditedToUser: true, detectedAt: new Date(), completedAt: new Date() });
      await deposit.save();
      const freshUser = await User.findById(user._id);
      if (freshUser) {
        freshUser.realBalance = (freshUser.realBalance || 0) + newAmountUSD;
        await freshUser.save();
        console.log(`✅ Auto-deposit: ${check.currency} ${newAmount} ($${newAmountUSD.toFixed(2)}) → ${user.email}`);

        // Send deposit confirmation email
        sendDepositEmail(user.email, user.name, { currency: check.currency, amount: newAmount, amountUSD: newAmountUSD, newBalance: freshUser.realBalance }).catch(() => {});
      }
    } catch (err) {}
    await new Promise(r => setTimeout(r, 800));
  }
}

async function runDepositMonitor() {
  try {
    await fetchPrices();
    const users = await User.find({ "depositAddresses.BTC": { $exists: true, $ne: "" } }).select("_id name email depositAddresses realBalance").limit(50);
    if (users.length === 0) return;
    console.log(`🔍 Scanning deposits for ${users.length} users...`);
    for (const user of users) { await scanUserDeposits(user); await new Promise(r => setTimeout(r, 1000)); }
  } catch (err) { console.error("Deposit monitor error:", err.message); }
}

function startDepositMonitor() {
  console.log("💰 Deposit monitor started (every 30s)");
  setTimeout(runDepositMonitor, 5000);
  setInterval(runDepositMonitor, 30000);
}

module.exports = { startDepositMonitor };
