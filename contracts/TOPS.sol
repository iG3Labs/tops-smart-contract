// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "./interface/IMintableBurnableERC20.sol";
/**
 * @title TOPS
 * @dev Implementation of the TOPS token, tradable token
 */
contract TOPS is ERC20BurnableUpgradeable, ERC20CappedUpgradeable, AccessControlEnumerableUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_SUPPLY = 10_000_000_000; // Max supply of 10,000,000,000 tokens

    function initialize() public initializer {
        __ERC20_init("TOPS", "TOPS");
        __ERC20Capped_init(MAX_SUPPLY * 10 ** decimals());
        __ERC20Burnable_init();
        __AccessControlEnumerable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /*
     * ERC20 FUNCTIONS
     */

    /**
     * @dev Function to mint tokens.
     * See {TOPS-_mint}
     */ 
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @inheritdoc ERC20Upgradeable
     */
    function _mint(address account, uint256 amount) internal override(ERC20Upgradeable, ERC20CappedUpgradeable) {
        ERC20CappedUpgradeable._mint(account, amount);
    }
}