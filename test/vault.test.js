const { TronWeb } = require("tronweb");
const { ethers } = require("ethers");

const TRC20 = artifacts.require("TRC20");

const Vault = artifacts.require("Vault");
const VaultFactory = artifacts.require("VaultFactory");

const { computeVaultAddress, base58ToHexAddr, hexToBase58, toEthAddress, getEpoch } = require('../utils');

contract("Vault", accounts => {
  let token;
  let factory;
  let owner;
  let relayer;
  let feeRecipient;

  before(async () => {
    [owner, feeRecipient, relayer] = accounts;
    token = await TRC20.new();
    console.log("Token deployed at:", token.address);

    // Deploy factory and check implementation
    factory = await VaultFactory.new();
    console.log("Factory deployed at:", factory.address);

    const implementation = await factory.implementation();
    console.log("Implementation address:", implementation);

    // Check if implementation has code
    const implCode = await tronWeb.trx.getContract(implementation);
    console.log("Implementation has code:", implCode ? true : false);
  });

  it("deploys a vault to the correct address and checks the owner", async () => {
    const computedAddress = await factory.computeAddress(owner);
    console.log("Computed address:", hexToBase58(computedAddress));

    const syncCompute = computeVaultAddress(
      toEthAddress(factory.address),
      toEthAddress(await factory.implementation()),
      toEthAddress(base58ToHexAddr(owner))
    );

    assert.equal(toEthAddress(computedAddress).toLowerCase(), syncCompute.toLowerCase(), "Computed address does not match");

    // deploy the vault and wait for it
    const deployTx = await factory.deploy(owner);
    console.log("Deployment tx:", deployTx.tx);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // check the vault is deployed
    const isDeployed = await factory.isDeployed(owner);
    console.log("Is deployed:", isDeployed);
    assert.equal(isDeployed, true, "Vault is not deployed");

    // Try to get the contract code at the address
    const code = await tronWeb.trx.getContract(computedAddress);
    console.log("Contract code at address:", code);

    // get the vault instance
    try {
        const vault = await Vault.at(computedAddress);
        console.log("Vault instance created successfully");
        assert.equal(computedAddress, vault.address, "Vault is not the correct address");
    } catch (error) {
        console.error("Error creating vault instance:", error);
        throw error;
    }
  });

  it("transfers TRC20 from the vault", async () => {
    const vaultAddress = await factory.computeAddress(owner);
    const vault = await Vault.at(vaultAddress);

    await token.mint(vaultAddress, TronWeb.toSun(100));
    const balance = await token.balanceOf(vaultAddress);

    // sign the send transaction
    const nonce = await vault.nonce();
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


    const recovered = await tronWeb.trx.verifyMessageV2(bytes, sig);
    assert.equal(recovered, owner);

    await vault.send(
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
