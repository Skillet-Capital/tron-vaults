const { TronWeb } = require("tronweb");
const { ethers } = require("ethers");

const TRC20 = artifacts.require("TRC20");

const VaultFactory = artifacts.require("VaultFactory");
const EntryPoint = artifacts.require("EntryPoint");
const Vault = artifacts.require("Vault");

function getEpoch() {
  return Math.floor(Date.now() / 1000);
}

function base58ToHexAddr(address) {
  return TronWeb.address.toHex(address);
}

function toEthAddress(tronHex) {
  if (tronHex.startsWith("0x")) {
    tronHex = tronHex.slice(2);
  }
  if (!tronHex.startsWith("41")) {
    throw new Error("Invalid TRON address prefix");
  }
  return "0x" + tronHex.slice(2);
}

contract("EntryPoint", async (accounts) => {
  let token;
  let factory;
  let entrypoint;

  let owner;
  let feeRecipient;
  let relayer;

  before(async () => {
    [owner, feeRecipient, relayer] = accounts;
    token = await TRC20.new();
    factory = await VaultFactory.new();
    entrypoint = await EntryPoint.new(factory.address);
  });

  it("transfers TRC20 from the vault using entrypoint", async () => {
    const vaultAddress = await factory.computeAddress(owner);

    await token.mint(vaultAddress, TronWeb.toSun(100));
    const balance = await token.balanceOf(vaultAddress);

    // sign the send transaction
    const nonce = 0; // Vault not deployed yet
    const deadline = getEpoch() + 1000;
    const fee = TronWeb.toSun(1);

    const hash = ethers.solidityPackedKeccak256(
      ["address", "address", "uint256", "address", "uint256", "uint256", "uint256"],
      [
        toEthAddress(token.address),
        toEthAddress(base58ToHexAddr(owner)),
        balance,
        toEthAddress(base58ToHexAddr(feeRecipient)),
        fee,
        deadline,
        nonce
      ]
    );

    const bytes = ethers.getBytes(hash);

    const privateKey = tronWrap._privateKeyByAccount[owner];
    const sig = await tronWrap.trx.signMessageV2(bytes, privateKey);

    await entrypoint.relay(
      owner,
      toEthAddress(token.address),
      toEthAddress(base58ToHexAddr(owner)),
      balance,
      toEthAddress(base58ToHexAddr(feeRecipient)),
      fee,
      deadline,
      sig,
      {
        from: relayer
      }
    );

    assert.equal(await token.balanceOf(vaultAddress), 0, "Vault Balance not transferred");
    assert.equal(await token.balanceOf(owner), BigInt(balance) - BigInt(fee), "Owner Balance not transferred");
    assert.equal(await token.balanceOf(feeRecipient), BigInt(fee), "Fee recipient balance not transferred");

    const vault = await Vault.at(vaultAddress);
    assert.equal(await vault.nonce(), 1n, "Nonce not incremented");
  });
});
