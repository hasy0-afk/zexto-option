const bip39 = require("bip39");
const HDKey = require("hdkey");
const crypto = require("crypto");
const { ethers } = require("ethers");

const MNEMONIC = process.env.HD_MNEMONIC || "";

function getSeed() {
  if (!MNEMONIC) throw new Error("HD_MNEMONIC not set in .env");
  return bip39.mnemonicToSeedSync(MNEMONIC);
}

function generateMnemonic() {
  return bip39.generateMnemonic(128);
}

// Helper: double SHA256 checksum
function addChecksum(payload) {
  const h1 = crypto.createHash("sha256").update(payload).digest();
  const h2 = crypto.createHash("sha256").update(h1).digest();
  return Buffer.concat([payload, h2.slice(0, 4)]);
}

// Helper: Base58 encode
function base58Encode(buffer) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + buffer.toString("hex"));
  let str = "";
  while (num > 0n) {
    str = ALPHABET[Number(num % 58n)] + str;
    num = num / 58n;
  }
  // Leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    str = "1" + str;
  }
  return str;
}

// BTC — m/44'/0'/0'/0/{index}
function deriveBTC(index) {
  const seed = getSeed();
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/0'/0'/0/${index}`);
  const sha = crypto.createHash("sha256").update(child.publicKey).digest();
  const ripemd = crypto.createHash("ripemd160").update(sha).digest();
  const versioned = Buffer.concat([Buffer.from([0x00]), ripemd]);
  const withChecksum = addChecksum(versioned);
  return base58Encode(withChecksum);
}

// LTC — m/44'/2'/0'/0/{index}
function deriveLTC(index) {
  const seed = getSeed();
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/2'/0'/0/${index}`);
  const sha = crypto.createHash("sha256").update(child.publicKey).digest();
  const ripemd = crypto.createHash("ripemd160").update(sha).digest();
  const versioned = Buffer.concat([Buffer.from([0x30]), ripemd]);
  const withChecksum = addChecksum(versioned);
  return base58Encode(withChecksum);
}

// ETH/BNB — m/44'/60'/0'/0/{index}
function deriveETH(index) {
  const seed = getSeed();
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/60'/0'/0/${index}`);
  const wallet = new ethers.Wallet(Buffer.from(child.privateKey).toString("hex"));
  return wallet.address;
}

// TRX — m/44'/195'/0'/0/{index}
function deriveTRX(index) {
  const seed = getSeed();
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive(`m/44'/195'/0'/0/${index}`);
  const wallet = new ethers.Wallet(Buffer.from(child.privateKey).toString("hex"));
  const ethAddr = wallet.address.slice(2);
  const tronHex = "41" + ethAddr;
  const tronBytes = Buffer.from(tronHex, "hex");
  const withChecksum = addChecksum(tronBytes);
  return base58Encode(withChecksum);
}

// Generate all addresses for a user index
function generateAddresses(index) {
  try {
    return {
      BTC: deriveBTC(index),
      ETH: deriveETH(index),
      BNB: deriveETH(index),
      TRX: deriveTRX(index),
      LTC: deriveLTC(index),
      USDT_TRC20: deriveTRX(index),
      USDT_BEP20: deriveETH(index),
    };
  } catch (err) {
    console.error("HD Wallet address generation error:", err.message);
    return null;
  }
}

module.exports = { generateMnemonic, generateAddresses, deriveBTC, deriveETH, deriveTRX, deriveLTC };
