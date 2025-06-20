// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IIG3Staking {
    function reinvest(address wallet, string calldata serial, uint256 amount) external;
}

contract IG3Reward is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct DeviceReward {
        address wallet;
        string serial;
        uint256 value;
    }

    event RewardAdded(address wallet, string serial, uint256 value, uint256 reinvestAmount);
    event ReinvestPercentageChanged(address wallet, uint8 percentage);
    event Withdrawn(address wallet, uint256 amount, string[] serials);
    event TokenAddressChanged(address tokenAddress);
    event RewardWalletChanged(address wallet);
    event StakingAddressChanged(address stakingAddress);

    address public tokenAddress;
    address public stakingAddress;
    address private _rewardWallet;
    mapping(address => mapping(bytes9 => uint256)) private  _balances; // wallet => serial number => balance
    mapping(address => uint8) public reinvestPercentages; // wallet => reinvest percentage


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, address pauser, address upgrader, address token, address staking)
    public initializer
    {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(UPGRADER_ROLE, upgrader);

        // Token address
        tokenAddress = token;
        stakingAddress = staking;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyRole(UPGRADER_ROLE)
    {}

    // CONFIGURE FUNCTIONS
    /**
    @notice Set token contract address for reward
    @param contractAddress contractAddress
    */
    function setTokenAddress(address contractAddress) onlyRole(DEFAULT_ADMIN_ROLE) external {
        tokenAddress = contractAddress;

        emit TokenAddressChanged(contractAddress);
    }


    /**
    @notice Set wallet address that hold reward fund
    @param wallet wallet address
    */
    function setRewardWallet(address wallet) onlyRole(DEFAULT_ADMIN_ROLE) external {
        _rewardWallet = wallet;

        emit RewardWalletChanged(wallet);
    }

    /**
    @notice Get wallet address that hold reward fund
    */
    function getRewardWallet() onlyRole(DEFAULT_ADMIN_ROLE) public view returns (address) {
        return _rewardWallet;
    }

    /**
    @notice Add rewards for list of devices of specific wallet
    @param rewards array of rewards which contain wallet address, device serial number and value
    */
    function addRewards(DeviceReward[] calldata rewards) onlyRole(DEFAULT_ADMIN_ROLE) external {
        IERC20 token = IERC20(tokenAddress);
        for (uint256 i = 0; i < rewards.length; i++) {
            bytes9 serial = bytes9(bytes(rewards[i].serial));
            // Check reinvest percentage
            uint8 percentage = reinvestPercentages[rewards[i].wallet];
            uint256 reinvestAmount = 0;
            if (percentage > 0) {
                reinvestAmount = rewards[i].value * percentage / 100;
                // Call TOPS contract to transfer
                token.transferFrom(_rewardWallet, stakingAddress, reinvestAmount);
                // Call staking address
                IIG3Staking ig3Staking = IIG3Staking(stakingAddress);
                ig3Staking.reinvest(rewards[i].wallet, rewards[i].serial, reinvestAmount);
            }
            _balances[rewards[i].wallet][serial] += rewards[i].value - reinvestAmount;

            emit RewardAdded(rewards[i].wallet, rewards[i].serial, rewards[i].value, reinvestAmount);
        }
    }

    // PUBLIC FUNCTIONS
    /**
    @notice Set reinvest percentage
    @param percentage Reinvest percentage
    */
    function setReinvestPercentage(uint8 percentage) whenNotPaused nonReentrant external  {
        require(percentage <= 100, "Invalid percentage");
        reinvestPercentages[msg.sender] = percentage;

        emit ReinvestPercentageChanged(msg.sender, percentage);
    }

    /**
    @notice Withdraw reward
    */
    function withdraw(string[] calldata serials) whenNotPaused nonReentrant external {
        uint256 balance = 0;
        // Calculate withdraw request amount
        for (uint256 i = 0; i < serials.length; ++i) {
            bytes9 serial = bytes9(bytes(serials[i]));
            balance += _balances[msg.sender][serial];
            _balances[msg.sender][serial] = 0; // Clear the requested reward balance
        }
        require(balance > 0, "Insufficient balance");

        // Call TOPS contract to transfer
        IERC20 token = IERC20(tokenAddress);
        token.transferFrom(_rewardWallet, msg.sender, balance);

        emit Withdrawn(msg.sender, balance, serials);
    }

    /**
    @notice Get balance
    */
    function getBalance(address wallet, string calldata serial) public view returns (uint256) {
        return _balances[wallet][bytes9(bytes(serial))];
    }

    function setStakingAddress(address staking) onlyRole(DEFAULT_ADMIN_ROLE) external {
        stakingAddress = staking;

        emit StakingAddressChanged(staking);
    }

    function getReinvestPercentage(address wallet) public view returns (uint8) {
        return reinvestPercentages[wallet];
    }

    function getStakingAddress() public view returns (address) {
        return stakingAddress;
    }
}