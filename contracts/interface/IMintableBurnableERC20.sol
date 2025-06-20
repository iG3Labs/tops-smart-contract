// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @title IMintableBurnableERC20
 * @dev IMintableBurnableERC20 is an interface for a token contract that can be minted and burned.
 */
interface IMintableBurnableERC20 is IERC20Upgradeable {
    /**
     * @dev Function to mint tokens
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external;

    /**
     * @dev Burns a specific amount of tokens.
     * @param amount The amount of token to be burned.
     */
    function burn(uint256 amount) external;

    /**
     * @dev Burns a specific amount of tokens from the target address and decrements allowance.
     * @param account The account whose tokens will be burned.
     * @param amount The amount of token to be burned.
     */
    function burnFrom(address account, uint256 amount) external;
}
