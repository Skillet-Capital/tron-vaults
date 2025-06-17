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
    address public immutable owner;
    uint256 public nonce;

    event TokenSent(
        address indexed token,
        address indexed to,
        uint256 amount,
        address feeRecipient,
        uint256 fee,
        uint256 deadline,
        uint256 nonce
    );

    event VaultNonceIncremented(uint256 indexed nonce);

    /// @notice Initializes the vault with the owner's address and the USDT token
    /// @param _owner Address that owns the vault and can authorize sends
    constructor(address _owner) {
        owner = _owner;
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
    ) external {
        require(block.timestamp < deadline, "Vault: deadline exceeded");
        require(fee <= amount, "Vault: fee exceeds amount");

        if (fee > 0) {
            require(feeRecipient != address(0), "Vault: invalid fee recipient");
        }

        bytes32 messageHash = keccak256(
            abi.encodePacked(token, to, amount, feeRecipient, fee, deadline, nonce)
        );

        address recovered = _recover(messageHash, sig);
        require(recovered == owner, "Vault: invalid signature");

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

        nonce++;

        emit TokenSent(token, to, amount, feeRecipient, fee, deadline, nonce);
        emit VaultNonceIncremented(nonce);
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

        bytes memory prefix = "\x19TRON Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, _hash));

        return ecrecover(prefixedHash, v, r, s);
    }
}
