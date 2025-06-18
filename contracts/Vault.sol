// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITRC20 {
    function transfer(
        address recipient,
        uint256 amount
    ) external returns (bool);
}

/// @title Deterministic Vault Contract
/// @notice Ownable, constructor-locked TRC20 vault with meta-tx `send()` support
contract Vault {
    address public immutable factory;

    // keccak256("vault.proxy.owner")
    uint256 private constant _OWNER_SLOT =
        0x3cb08b44d5f655d2aa0e1b56ab7d6a137370c65380d7cc7a5a7b13ef2487b317;

    // keccak256("vault.proxy.nonce")
    uint256 private constant _NONCE_SLOT =
        0xb6f7bff57e56cf4374dc9a470dff4292086e6c153ad51c03361db5d6db3e899d;

    // keccak256("vault.proxy.reentrancy") => avoid collision with future vars
    uint256 private constant _REENTRANCY_LOCK_SLOT =
        0x0f3e2c215f3aa78a86d67e9e27415c9c8c6a5d4890caa013ac10b46ab4e7f8e1;

    event TokenSent(
        address indexed token,
        address indexed to,
        uint256 amount,
        address feeRecipient,
        uint256 fee,
        uint256 deadline,
        uint256 nonce
    );

    /// @notice Initializes the vault with the owner's address and the USDT token
    /// @param _factory Address of the factory that deployed the vault
    constructor(address _factory) {
        require(_factory != address(0), "impl: zero factory");
        factory = _factory;
    }

    /// @notice Initializes the vault with the owner's address
    /// @param _owner Address that owns the vault and can authorize sends
    function initialize(address _owner) external {
        require(msg.sender == factory, "only factory");
        require(_loadOwner() == address(0), "already init");
        _storeOwner(_owner);
    }

    function owner() external view returns (address) {
        return _loadOwner();
    }

    function nonce() external view returns (uint256) {
        return _loadNonce();
    }

    /// @notice Sends TRC20 from the vault to a recipient, authorized by an off-chain signature
    /// @param token Address of the token to be sent
    /// @param to Recipient address
    /// @param amount Amount of token to send
    /// @param feeRecipient Fee recipient
    /// @param fee Fee amount
    /// @param deadline Signature deadline
    /// @param sig EIP-191-style signature from the `owner` authorizing the transfer
    function send(
        address token,
        address to,
        uint256 amount,
        address feeRecipient,
        uint256 fee,
        uint256 deadline,
        bytes calldata sig
    ) external nonReentrant {
        require(block.timestamp < deadline, "Vault: deadline exceeded");
        require(fee <= amount, "Vault: fee exceeds amount");

        if (fee > 0) {
            require(feeRecipient != address(0), "Vault: invalid fee recipient");
        }

        uint256 _nonce = _loadNonce();

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                token,
                to,
                amount,
                feeRecipient,
                fee,
                deadline,
                _nonce
            )
        );

        address recovered = _recover(messageHash, sig);
        require(recovered == _loadOwner(), "Vault: invalid signature");

        _storeNonce(_nonce + 1);

        uint256 netAmount = amount - fee;
        require(
            ITRC20(token).transfer(to, netAmount),
            "Vault: Token transfer failed"
        );

        if (fee > 0) {
            require(
                ITRC20(token).transfer(feeRecipient, fee),
                "Vault: Token transfer failed"
            );
        }

        emit TokenSent(token, to, amount, feeRecipient, fee, deadline, _nonce);
    }

    /// @dev Recovers signer from the hash and signature
    function _recover(
        bytes32 _hash,
        bytes memory sig
    ) internal pure returns (address) {
        require(sig.length == 65, "Vault: invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // Accept both v = 27 or 28
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Vault: invalid v");

        require(
            uint256(s) <=
                0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "Vault: invalid s"
        );

        bytes memory prefix = "\x19TRON Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, _hash));

        return ecrecover(prefixedHash, v, r, s);
    }

    function _loadOwner() internal view returns (address a) {
        assembly {
            a := sload(_OWNER_SLOT)
        }
    }
    function _storeOwner(address a) internal {
        assembly {
            sstore(_OWNER_SLOT, a)
        }
    }

    function _loadNonce() internal view returns (uint256 n) {
        assembly {
            n := sload(_NONCE_SLOT)
        }
    }

    function _storeNonce(uint256 n) internal {
        assembly {
            sstore(_NONCE_SLOT, n)
        }
    }

    function _loadLock() internal view returns (uint256 l) {
        assembly {
            l := sload(_REENTRANCY_LOCK_SLOT)
        }
    }

    function _storeLock(uint256 l) internal {
        assembly {
            sstore(_REENTRANCY_LOCK_SLOT, l)
        }
    }

    modifier nonReentrant() {
        require(_loadLock() == 0, "Vault: reentrant");
        _storeLock(1);
        _;
        _storeLock(0);
    }
}
