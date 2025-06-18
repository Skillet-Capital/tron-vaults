// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vault} from "./Vault.sol";

/// @title VaultFactory
/// @notice Factory for deploying Vault contracts using CREATE2
contract VaultFactory {
    address public immutable implementation;

    mapping(address => uint64) public nonces;

    event VaultDeployed(
        address indexed owner,
        uint64 indexed nonce,
        address vault
    );
    event VaultNonceIncremented(
        address indexed owner,
        uint64 indexed oldNonce,
        uint64 newNonce
    );

    /// @notice Initializes the factory with the implementation address
    /// @dev The implementation is a Vault contract that is deployed with the factory address
    constructor() {
        implementation = address(new Vault(address(this)));
    }

    /// @notice Deploys the caller’s current-nonce Vault
    /// @param owner The vault owner
    /// @return vault The deployed Vault address
    function deploy(address owner) external returns (address vault) {
        require(owner != address(0), "Vault Factory: zero owner");

        uint64 nonce = nonces[owner];
        bytes32 salt = keccak256(abi.encode(owner, nonce));

        address computedAddress = _computeAddress(owner, nonce);
        require(
            computedAddress.code.length == 0,
            "Vault Factory: vault already deployed"
        );

        bytes memory bytecode = _minimalProxyInitCode(implementation);
        vault = _create2(0, bytecode, salt);

        // Initialize the vault
        (bool ok, ) = vault.call(
            abi.encodeWithSignature("initialize(address)", owner)
        );
        require(ok, "VaultFactory: failed to initialize");

        emit VaultDeployed(owner, nonce, vault);
    }

    /// @notice Computes the deterministic Vault address for the owner's current nonce
    /// @param owner The vault owner
    function computeAddress(address owner) external view returns (address) {
        return _computeAddress(owner, nonces[owner]);
    }

    /// @notice Computes the deterministic Vault address for the given nonce
    /// @param owner The vault owner
    /// @param nonce The nonce
    function computeAddress(
        address owner,
        uint64 nonce
    ) external view returns (address) {
        return _computeAddress(owner, nonce);
    }

    function isDeployed(address owner) external view returns (bool) {
        return _isDeployed(_computeAddress(owner, nonces[owner]));
    }

    function isDeployed(
        address owner,
        uint64 nonce
    ) external view returns (bool) {
        return _isDeployed(_computeAddress(owner, nonce));
    }

    /// @notice Returns true if a contract at `computedAddress` matches the expected proxy code
/// @param computedAddress The address to check
function isComputedDeployed(address computedAddress) external view returns (bool) {
    return _isDeployed(computedAddress);
}

    function _isDeployed(address addr) internal view returns (bool) {
        return addr.code.length > 0;
    }

    /// @notice Owner-signed nonce rotation
    /// @param owner The vault owner
    /// @param sig Owner’s signature over keccak256("VaultNonce", owner, newNonce)
    function incrementNonce(address owner, bytes calldata sig) external {
        uint64 oldNonce = nonces[owner];
        bytes32 _hash = keccak256(
            abi.encodePacked("VaultNonce", owner, oldNonce)
        );
        require(
            _recover(_hash, sig) == owner,
            "Vault Factory: invalid signature"
        );
        nonces[owner] = oldNonce + 1;

        emit VaultNonceIncremented(owner, oldNonce, nonces[owner]);
    }

    /* ---------- Internal helpers ---------- */

    /// @notice Computes the deterministic Vault address for the caller’s current nonce
    /// @param owner The vault owner
    function _computeAddress(
        address owner,
        uint64 nonce
    ) internal view returns (address) {
        bytes32 salt = keccak256(abi.encode(owner, nonce));
        bytes32 codeHash = keccak256(_minimalProxyInitCode(implementation));
        return _computeCreate2Address(salt, codeHash);
    }

    function _computeCreate2Address(
        bytes32 salt,
        bytes32 codeHash
    ) internal view returns (address) {
        bytes32 digest = keccak256(
            abi.encodePacked(bytes1(0x41), address(this), salt, codeHash)
        );
        return address(uint160(uint256(digest)));
    }

    function _create2(
        uint256 value,
        bytes memory bytecode,
        bytes32 salt
    ) internal returns (address addr) {
        require(bytecode.length != 0, "Vault Factory: bytecode empty");
        assembly {
            addr := create2(value, add(bytecode, 32), mload(bytecode), salt)
            if iszero(addr) {
                revert(0, 0)
            }
        }
    }

    /// @notice Returns the minimal proxy init code for the given logic contract
    /// @dev https://eips.ethereum.org/EIPS/eip-1167
    /// @dev https://github.com/optionality/clone-factory
    /// @param logic The logic contract address
    /// @return The minimal proxy init code
    function _minimalProxyInitCode(
        address logic
    ) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                hex"3d602d80600a3d3981f3",
                hex"363d3d373d3d3d363d73",
                bytes20(logic),
                hex"5af43d82803e903d91602b57fd5bf3"
            );
    }

    function _recover(
        bytes32 _hash,
        bytes memory sig
    ) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
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
