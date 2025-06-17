// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vault} from "./Vault.sol";

/// @title AccountFactory
/// @notice Factory for deploying Account contracts using CREATE2
contract VaultFactory {

    mapping(address => uint64) public nonces;
    mapping(address => mapping(uint64 => address)) public vaults;

    event VaultDeployed(address indexed owner, uint64 indexed nonce, address vault);
    event VaultNonceIncremented(address indexed owner, uint64 indexed oldNonce, uint64 newNonce);

    function userVault(address owner) external view returns (address) {
        return vaults[owner][nonces[owner]];
    }

    function userVault(address owner, uint64 nonce) external view returns (address) {
        return vaults[owner][nonce];
    }

    /// @notice Deploys the caller’s current-nonce Vault
    /// @param owner The vault owner
    /// @return vault The deployed Vault address
    function deploy(address owner) external returns (address vault) {
        uint64 nonce = nonces[owner];
        bytes32 salt = keccak256(abi.encode(owner, nonce));

        address computedAddress = _computeAddress(owner);
        require(computedAddress.code.length == 0, "Vault Factory: vault already deployed");

        bytes memory bytecode = abi.encodePacked(
            type(Vault).creationCode,
            abi.encode(owner)
        );
        vault = _create2(0, bytecode, salt);
        vaults[owner][nonce] = vault;

        emit VaultDeployed(owner, nonce, vault);
    }

    function computeAddress(address owner) external view returns (address) {
        return _computeAddress(owner);
    }

    /// @notice Computes the deterministic Vault address for the caller’s current nonce
    /// @param owner The vault owner
    function _computeAddress(address owner) internal view returns (address) {
        uint64 nonce = nonces[owner];
        bytes32 salt = keccak256(abi.encode(owner, nonce));
        bytes32 codeHash = keccak256(
            abi.encodePacked(type(Vault).creationCode, abi.encode(owner))
        );
        return _computeCreate2Address(salt, codeHash);
    }

    /// @notice True if the current-nonce Vault is already deployed
    function isDeployed(address owner) external view returns (bool) {
        return _computeAddress(owner).code.length > 0;
    }

    /// @notice Owner-signed nonce rotation
    /// @param owner The vault owner
    /// @param sig Owner’s signature over keccak256("VaultNonce", owner, newNonce)
    function incrementNonce(address owner, bytes calldata sig) external {
        uint64 oldNonce = nonces[owner];
        bytes32 _hash = keccak256(abi.encodePacked("VaultNonce", owner, oldNonce));
        require(_recover(_hash, sig) == owner, "Vault Factory: invalid signature");
        nonces[owner] = oldNonce + 1;

        emit VaultNonceIncremented(owner, oldNonce, nonces[owner]);
    }

    /* ---------- Internal helpers ---------- */

    function _create2(uint256 value, bytes memory bytecode, bytes32 salt)
        internal returns (address addr)
    {
        require(bytecode.length != 0, "Vault Factory: bytecode empty");
        assembly {
            addr := create2(value, add(bytecode, 32), mload(bytecode), salt)
            if iszero(addr) { revert(0, 0) }
        }
    }

    function _computeCreate2Address(bytes32 salt, bytes32 codeHash)
        internal view returns (address)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(bytes1(0x41), address(this), salt, codeHash)
        );
        return address(uint160(uint256(digest)));
    }

    function _recover(bytes32 _hash, bytes memory sig) internal pure returns (address) {
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Vault Factory: invalid v");

        bytes memory prefix = "\x19TRON Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, _hash));

        return ecrecover(prefixedHash, v, r, s);
    }
}
