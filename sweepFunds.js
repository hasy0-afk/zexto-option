// ============================================================
// SWEEP SCRIPT — Transfer funds from HD generated addresses
// to your main wallet addresses
// 
// Usage: node sweepFunds.js
// ============================================================

require("dotenv").config();
const { ethers } = require("ethers");
const HDKey = require("hdkey");
const bip39 = require("bip39");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("./models/User");

const MNEMONIC = process.env.HD_MNEMONIC;
if (!MNEMONIC) { console.error("❌ HD_MNEMONIC not set in .env"); process.exit(1); }

// Your main wallet addresses (where funds will be sent)
const MAIN_WALLETS = {
  ETH: process.env.WALLET_ETH,     // Also receives BNB and USDT_BEP20
  BNB: process.env.WALLET_BNB,
  TRX: process.env.WALLET_TRX,     // Also receives USDT_TRC20
  BTC: process.env.WALLET_BTC,
  LTC: process.env.WALLET_LTC,
};

// RPC endpoints (free public RPCs)
const RPC = {
  ETH: "https://eth.llamarpc.com",
  BNB: "https://bsc-dataseed1.binance.org",
};

// USDT contract addresses
const USDT_CONTRACTS = {
  BEP20: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
};

const USDT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function getSeed() {
  return bip39.mnemonicToSeedSync(MNEMONIC);
}

// Derive ETH/BNB private key for given index
function deriveEVMKey(index) {
  const seed = getSeed();
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/60'/0'/0/${index}`);
  return "0x" + Buffer.from(child.privateKey).toString("hex");
}

// ============================================================
// SWEEP ETH
// ============================================================
async function sweepETH(index) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC.ETH);
    const privateKey = deriveEVMKey(index);
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);
    
    if (balance === 0n) return { address: wallet.address, swept: false, reason: "zero balance" };

    // Calculate gas cost
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;
    const sendAmount = balance - gasCost;

    if (sendAmount <= 0n) return { address: wallet.address, swept: false, reason: "balance too low for gas" };

    const tx = await wallet.sendTransaction({
      to: MAIN_WALLETS.ETH,
      value: sendAmount,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
    });
    await tx.wait();
    console.log(`✅ ETH Swept: ${ethers.formatEther(sendAmount)} ETH from ${wallet.address} → ${MAIN_WALLETS.ETH} (tx: ${tx.hash})`);
    return { address: wallet.address, swept: true, amount: ethers.formatEther(sendAmount), tx: tx.hash };
  } catch (err) {
    return { address: `index-${index}`, swept: false, reason: err.message };
  }
}

// ============================================================
// SWEEP BNB (BSC)
// ============================================================
async function sweepBNB(index) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC.BNB);
    const privateKey = deriveEVMKey(index);
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);

    if (balance === 0n) return { address: wallet.address, swept: false, reason: "zero balance" };

    const gasPrice = (await provider.getFeeData()).gasPrice;
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;
    const sendAmount = balance - gasCost;

    if (sendAmount <= 0n) return { address: wallet.address, swept: false, reason: "balance too low for gas" };

    const tx = await wallet.sendTransaction({
      to: MAIN_WALLETS.BNB,
      value: sendAmount,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
    });
    await tx.wait();
    console.log(`✅ BNB Swept: ${ethers.formatEther(sendAmount)} BNB from ${wallet.address} → ${MAIN_WALLETS.BNB} (tx: ${tx.hash})`);
    return { address: wallet.address, swept: true, amount: ethers.formatEther(sendAmount), tx: tx.hash };
  } catch (err) {
    return { address: `index-${index}`, swept: false, reason: err.message };
  }
}

// ============================================================
// SWEEP USDT BEP20 (BSC)
// ============================================================
async function sweepUSDT_BEP20(index) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC.BNB);
    const privateKey = deriveEVMKey(index);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const usdt = new ethers.Contract(USDT_CONTRACTS.BEP20, USDT_ABI, wallet);
    const balance = await usdt.balanceOf(wallet.address);

    if (balance === 0n) return { address: wallet.address, swept: false, reason: "zero USDT balance" };

    // Check if wallet has enough BNB for gas
    const bnbBalance = await provider.getBalance(wallet.address);
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const estimatedGas = 60000n; // Token transfer gas
    const gasCost = gasPrice * estimatedGas;

    if (bnbBalance < gasCost) {
      return { address: wallet.address, swept: false, reason: `Need ~${ethers.formatEther(gasCost)} BNB for gas, has ${ethers.formatEther(bnbBalance)}` };
    }

    const tx = await usdt.transfer(MAIN_WALLETS.BNB, balance);
    await tx.wait();
    const amt = ethers.formatUnits(balance, 18);
    console.log(`✅ USDT(BEP20) Swept: ${amt} USDT from ${wallet.address} → ${MAIN_WALLETS.BNB} (tx: ${tx.hash})`);
    return { address: wallet.address, swept: true, amount: amt + " USDT", tx: tx.hash };
  } catch (err) {
    return { address: `index-${index}`, swept: false, reason: err.message };
  }
}

// ============================================================
// MAIN SWEEP FUNCTION
// ============================================================
async function main() {
  console.log("🧹 Starting fund sweep...\n");
  console.log("Main wallets:");
  console.log(`  ETH/BNB: ${MAIN_WALLETS.ETH}`);
  console.log(`  TRX:     ${MAIN_WALLETS.TRX}`);
  console.log(`  BTC:     ${MAIN_WALLETS.BTC}`);
  console.log(`  LTC:     ${MAIN_WALLETS.LTC}\n`);

  // Connect to DB to get all users with deposit addresses
  await mongoose.connect(process.env.MONGO_URI);
  console.log("📦 Connected to MongoDB\n");

  const users = await User.find({
    "depositAddresses.ETH": { $exists: true, $ne: "" }
  }).select("name email walletIndex depositAddresses");

  console.log(`Found ${users.length} users with deposit addresses\n`);

  const results = { swept: 0, skipped: 0, errors: 0 };

  for (const user of users) {
    const idx = user.walletIndex || 0;
    console.log(`\n👤 ${user.name} (${user.email}) — Index: ${idx}`);
    console.log(`   ETH/BNB: ${user.depositAddresses.ETH}`);

    // Sweep ETH
    const ethResult = await sweepETH(idx);
    if (ethResult.swept) { results.swept++; } else { results.skipped++; console.log(`   ETH: ${ethResult.reason}`); }

    // Sweep BNB
    const bnbResult = await sweepBNB(idx);
    if (bnbResult.swept) { results.swept++; } else { results.skipped++; console.log(`   BNB: ${bnbResult.reason}`); }

    // Sweep USDT BEP20
    const usdtResult = await sweepUSDT_BEP20(idx);
    if (usdtResult.swept) { results.swept++; } else { results.skipped++; console.log(`   USDT(BEP20): ${usdtResult.reason}`); }

    // Small delay
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n════════════════════════════");
  console.log(`✅ Swept: ${results.swept}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`❌ Errors: ${results.errors}`);
  console.log("════════════════════════════\n");

  // NOTE: BTC, LTC, and TRX sweeping requires different libraries
  // (bitcoinjs-lib for BTC/LTC, tronweb for TRX)
  // For now, these chains need manual transfer or additional setup
  console.log("⚠️  BTC, LTC, TRX sweep requires additional libraries.");
  console.log("   For these chains, use wallet software to import private keys:");
  console.log("   Run: node -e \"require('dotenv').config();const HDKey=require('hdkey');const bip39=require('bip39');const seed=bip39.mnemonicToSeedSync(process.env.HD_MNEMONIC);const root=HDKey.fromMasterSeed(seed);const INDEX=1;console.log('BTC key:','0x'+Buffer.from(root.derive(\\\"m/44'/0'/0'/0/\\\"+INDEX).privateKey).toString('hex'));console.log('TRX key:','0x'+Buffer.from(root.derive(\\\"m/44'/195'/0'/0/\\\"+INDEX).privateKey).toString('hex'));console.log('LTC key:','0x'+Buffer.from(root.derive(\\\"m/44'/2'/0'/0/\\\"+INDEX).privateKey).toString('hex'));\"");
  console.log("\n   Import these keys into Trust Wallet / Electrum to access funds.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Sweep error:", err);
  process.exit(1);
});
