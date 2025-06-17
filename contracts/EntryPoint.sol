// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vault} from "./Vault.sol";
import {VaultFactory} from "./VaultFactory.sol";

/// @title EntryPoint
/// @notice A relayer contract that deploys vaults and forwards meta-transactions
contract EntryPoint {
    VaultFactory public factory;

    event MetaTransactionExecuted(
        address indexed relayer, 
        address indexed owner, 
        address vault, 
        address token, 
        address to, 
        uint256 amount, 
        address feeRecipient, 
        uint256 fee, 
        uint256 deadline
    );

    constructor(address _factory) {
        require(_factory != address(0), "EntryPoint: zero factory address");
        factory = VaultFactory(_factory);
    }

    /// @notice Relays a signed send() call, deploying the Vault if necessary
    /// @param owner Vault owner
    /// @param token TRC20 token to transfer
    /// @param to Recipient
    /// @param amount Token amount
    /// @param feeRecipient Fee recipient
    /// @param fee Fee amount
    /// @param deadline Signature deadline
    /// @param sig Signature from owner
    function relay(
        address owner,
        address token,
        address to,
        uint256 amount,
        address feeRecipient,
        uint256 fee,
        uint256 deadline,
        bytes calldata sig
    ) external {
        if (!factory.isDeployed(owner)) factory.deploy(owner);

        // Forward the call
        address vaultAddress = factory.userVault(owner);
        Vault vault = Vault(vaultAddress);

        vault.send(token, to, amount, feeRecipient, fee, deadline, sig);

        emit MetaTransactionExecuted(msg.sender, owner, vaultAddress, token, to, amount, feeRecipient, fee, deadline);
    }
}
