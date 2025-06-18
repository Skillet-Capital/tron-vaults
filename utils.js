const { TronWeb } = require("tronweb");

const {
  solidityPacked,
  keccak256,
  AbiCoder,
  getAddress,
} = require("ethers");

/**
 * Compute EVM-style CREATE2 address used by VaultFactory on TRON.
 * @param {string} factoryAddress  - ETH-style (0x...) factory address (20 bytes)
 * @param {string} implementationAddress - ETH-style logic address (20 bytes)
 * @param {string} owner - ETH-style owner address (20 bytes)
 * @param {number} nonce - vault nonce (uint64)
 * @returns {string} Ethereum-style 0x-prefixed address (checksummed)
 */
function computeVaultAddress(factoryAddress, implementationAddress, owner, nonce = 0) {
  const logic = implementationAddress.toLowerCase().replace(/^0x/, "");
  if (logic.length !== 40) throw new Error("Invalid logic address length");

  // 1. Construct minimal proxy bytecode
  const initCode = `0x${[
    "3d602d80600a3d3981f3",
    "363d3d373d3d3d363d73",
    logic,
    "5af43d82803e903d91602b57fd5bf3",
  ].join("")}`;

  const initHash = keccak256(initCode);

  // 2. Build salt = keccak256(abi.encode(owner, nonce))
  const salt = keccak256(
    AbiCoder.defaultAbiCoder().encode(["address", "uint64"], [owner, nonce])
  );

  // 3. Build preimage with TRON prefix 0x41 (instead of 0xff)
  const preImage = solidityPacked(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0x41", factoryAddress, salt, initHash]
  );

  const digest = keccak256(preImage); // 32-byte hash

  // 4. Take last 20 bytes and convert to ETH-style address
  const addressBytes = `0x${digest.slice(-40)}`;
  return getAddress(addressBytes); // checksummed ETH-style address
}

function getEpoch() {
  return Math.floor(Date.now() / 1000);
}

function base58ToHexAddr(address) {
  return TronWeb.address.toHex(address);
}

function hexToBase58(hexAddress) {
  // Remove '0x' if present
  if (hexAddress.startsWith('0x')) {
    hexAddress = hexAddress.slice(2);
  }

  // Ensure it starts with '41' (TRON address prefix)
  if (!hexAddress.startsWith('41')) {
    throw new Error('Invalid TRON address: must start with 41');
  }

  // Convert hex to base58 using TronWeb
  return TronWeb.address.fromHex(hexAddress);
}

function toEthAddress(tronHex) {
  if (tronHex.startsWith("0x")) {
    tronHex = tronHex.slice(2);
  }
  if (!tronHex.startsWith("41")) {
    throw new Error("Invalid TRON address prefix");
  }
  return "0x" + tronHex.slice(2); // strip the "41" prefix → 20-byte ETH address
}

function ethToTronHex(ethAddress) {
  return '41' + ethAddress.toLowerCase().replace(/^0x/, '');
}

function ethToBase58(ethAddress) {
  return TronWeb.address.fromHex(ethToTronHex(ethAddress));
}

module.exports = { 
  computeVaultAddress,
  getEpoch,
  base58ToHexAddr,
  hexToBase58,
  toEthAddress,
  ethToTronHex,
  ethToBase58,
}
