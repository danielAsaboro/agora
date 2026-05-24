// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AgoraAMM.sol";

/// @title AgoraAMMFactory
/// @notice Deploys AgoraAMM pools via CREATE2. One pool per PYT token.
contract AgoraAMMFactory {
    mapping(address => address) public pools; // pytToken => pool

    event PoolCreated(address indexed pytToken, address indexed usdc, address pool);

    error PoolExists();
    error ZeroAddress();

    /// @notice Deploy a new constant-product pool for pytToken / usdc.
    /// @param pytToken  The PYT-{name} ERC-20 (tokenA).
    /// @param usdc      The quote token (tokenB).
    /// @param nameSuffix Human-readable suffix for LP token symbol (e.g. "apollo").
    function createPool(address pytToken, address usdc, string calldata nameSuffix)
        external
        returns (address pool)
    {
        if (pytToken == address(0) || usdc == address(0)) revert ZeroAddress();
        if (pools[pytToken] != address(0)) revert PoolExists();
        bytes32 salt = keccak256(abi.encodePacked(pytToken));
        pool = address(new AgoraAMM{salt: salt}(pytToken, usdc, nameSuffix));
        pools[pytToken] = pool;
        emit PoolCreated(pytToken, usdc, pool);
    }

    /// @notice Predict the pool address for a given pytToken before deployment.
    function predictPool(address pytToken, address usdc, string calldata nameSuffix)
        external
        view
        returns (address)
    {
        bytes32 salt = keccak256(abi.encodePacked(pytToken));
        bytes memory creationCode = abi.encodePacked(
            type(AgoraAMM).creationCode,
            abi.encode(pytToken, usdc, nameSuffix)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(creationCode))
        );
        return address(uint160(uint256(hash)));
    }

    function getPool(address pytToken) external view returns (address) {
        return pools[pytToken];
    }
}
