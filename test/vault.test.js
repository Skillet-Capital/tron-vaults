const { TronWeb } = require("tronweb");
const { ethers } = require("ethers");

const TRC20 = artifacts.require("TRC20");

const Vault = artifacts.require("Vault");
const VaultFactory = artifacts.require("VaultFactory");

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
  return "0x" + tronHex.slice(2); // strip the "41" prefix → 20-byte ETH address
}

function tronPrefixedMessage(messageHex) {
  const raw = ethers.getBytes(messageHex);
  const prefix = `\x19TRON Signed Message:\n${raw.length}`;
  const fullMessage = ethers.toUtf8Bytes(prefix).concat(raw);
  return ethers.keccak256(fullMessage);
}

contract("Vault", async (accounts) => {
  let token;
  let factory;

  let owner;
  let relayer;

  before(async () => {
    [owner, relayer] = accounts;
    token = await TRC20.new();
    factory = await VaultFactory.new();
  });

  it("deploys a vault to the correct address and checks the owner", async () => {
    const computedAddress = await factory.computeAddress(owner);

    // deploy the vault
    await factory.deploy(owner);
    const vault = await Vault.at(computedAddress);
    assert.equal(computedAddress, vault.address, "Vault is not the correct address");

    // check the user vault
    const userVault = await factory.userVault(owner);
    assert.equal(userVault, vault.address, "Vault is not the correct address");

    // check the vault owner
    assert.equal(await vault.owner(), base58ToHexAddr(owner), "Vault owner is not the correct address");
  });

  it("transfers TRC20 from the vault", async () => {
    const vaultAddress = await factory.computeAddress(owner);
    const vault = await Vault.at(vaultAddress);

    await token.mint(vaultAddress, TronWeb.toSun(100));
    const balance = await token.balanceOf(vaultAddress);

    // sign the send transaction
    const nonce = await vault.nonce();
    const deadline = getEpoch() + 1000;

    const hash = ethers.solidityPackedKeccak256(
      ["address", "address", "uint256", "uint256", "uint256"],
      [
        toEthAddress(token.address),
        toEthAddress(base58ToHexAddr(owner)),
        balance,
        deadline,
        nonce
      ]
    );

    const bytes = ethers.getBytes(hash);

    const privateKey = tronWrap._privateKeyByAccount[owner];
    const sig = await tronWrap.trx.signMessageV2(bytes, privateKey);


    const recovered = await tronWeb.trx.verifyMessageV2(bytes, sig);
    assert.equal(recovered, owner);

    await vault.send(
      toEthAddress(token.address),
      toEthAddress(base58ToHexAddr(owner)),
      balance,
      deadline,
      sig,
      {
        from: relayer
      }
    );

    assert.equal(await token.balanceOf(vaultAddress), 0, "Vault Balance not transferred");
    assert.equal(await token.balanceOf(owner), balance, "Owner Balance not transferred");
    assert.equal(await vault.nonce(), nonce + 1n, "Nonce not incremented");
  });

  it("should increment nonce of vault with signed message", async () => {
    const nonce = await factory.nonces(owner);
    assert.equal(nonce, 0n, "Initial nonce should be 0");

    const hash = ethers.solidityPackedKeccak256(
      ["string", "address", "uint64"],
      ["VaultNonce", toEthAddress(base58ToHexAddr(owner)), nonce]
    );

    const bytes = ethers.getBytes(hash);

    // Sign using TronWrap
    const privateKey = tronWrap._privateKeyByAccount[owner];
    const sig = await tronWrap.trx.signMessageV2(bytes, privateKey);

    // Confirm the signature verifies correctly
    const recovered = await tronWeb.trx.verifyMessageV2(bytes, sig);
    assert.equal(recovered, owner, "Signature recovery failed");

    // Increment the nonce using relayer
    await factory.incrementNonce(owner, sig, { from: relayer });

    const newNonce = await factory.nonces(owner);
    assert.equal(newNonce, 1n, "Nonce should increment to 1");
  })
});
