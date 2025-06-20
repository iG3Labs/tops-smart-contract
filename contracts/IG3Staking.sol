// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IG3Staking is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant REINVEST_ROLE = keccak256("REINVEST_ROLE");

    struct DepositInfo {
        string serial;
        uint256 amount;
    }

    struct DeviceBalance {
        bytes9 serial;
        uint256 balance;
    }

    struct WithdrawRequest {
        uint256 id;
        uint256 timestamp;
        uint256 amount;
        DeviceBalance[] deviceBalances;
    }

    event RequestTimeChanged(uint256 time);
    event TokenAddressChanged(address tokenAddress);
    event Deposited(address wallet, string serial, uint256 amount);
    event WithdrawRequested(uint256 requestId, address wallet, string serial, uint256 timestamp, uint256 amount);
    event WithdrawRequestCanceled(uint256 requestId, address wallet, string serial, uint256 timestamp, uint256 amount);
    event Withdrawn(uint256 requestId, address wallet, uint256 amount);


    uint256 public requestTime;
    address public tokenAddress;
    uint256 private _requestId;
    mapping(address => mapping(bytes9 => uint256)) private  _balances; // wallet => serial number => balance
    mapping(address => WithdrawRequest) public withdrawRequests; // wallet => request (each wallet can only have 1 request at a time)

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, address pauser, address upgrader, address token)
    public initializer
    {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(UPGRADER_ROLE, upgrader);

        // Default request time
        requestTime = 7 days;
        // Token address
        tokenAddress = token;
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
    @notice Set request waiting time
    @param time waiting time
    */
    function setRequestTime(uint256 time) onlyRole(DEFAULT_ADMIN_ROLE) external {
        requestTime = time;

        emit RequestTimeChanged(time);
    }

    /**
    @notice Set token contract address for reward
    @param contractAddress contractAddress
    */
    function setTokenAddress(address contractAddress) onlyRole(DEFAULT_ADMIN_ROLE) external {
        if (contractAddress == address(0)) {
            revert("Token address cannot be 0");
        }

        tokenAddress = contractAddress;

        emit TokenAddressChanged(contractAddress);
    }

    /**
    @notice Reinvest reward
    @param serial Serial number of device
    */
    function reinvest(address wallet, string calldata serial, uint256 amount) onlyRole(REINVEST_ROLE) external {
        if (amount == 0) {
            revert("Amount must be greater than 0");
        }

        // Increase balance
        _balances[wallet][bytes9(bytes(serial))] += amount;

        emit Deposited(wallet, serial, amount);
    }

    // PUBLIC FUNCTIONS
    /**
    @notice Deposit staking amount
    @param serial Serial number of device
    */
    function deposit(string calldata serial, uint256 amount) whenNotPaused nonReentrant external {
        require(amount > 0, "Amount must be greater than 0");

        // Transfer token to contract
        IERC20 token = IERC20(tokenAddress);
        token.transferFrom(msg.sender, address(this), amount);
        // Increase balance
        _balances[msg.sender][bytes9(bytes(serial))] += amount;

        emit Deposited(msg.sender, serial, amount);
    }

    /**
    @notice Deposit staking amount for multiple devices
    @param depositInfos list of deposit info with serial and amount
    */
    function bulkDeposit(DepositInfo[] calldata depositInfos) whenNotPaused nonReentrant external {
        IERC20 token = IERC20(tokenAddress);
        for (uint256 i = 0; i < depositInfos.length; i++) {
            DepositInfo memory depositInfo = depositInfos[i];
            require(depositInfo.amount > 0, "Amount must be greater than 0");

            // Transfer token to contract
            token.transferFrom(msg.sender, address(this), depositInfo.amount);
            // Increase balance
            _balances[msg.sender][bytes9(bytes(depositInfo.serial))] += depositInfo.amount;

            emit Deposited(msg.sender, depositInfo.serial, depositInfo.amount);
        }

    }

    /**
    @notice Submit a request to withdraw from list of devices
    @param serials array of device serial numbers
    */
    function request(string[] calldata serials) whenNotPaused nonReentrant external {
        WithdrawRequest storage withdrawRequest = withdrawRequests[msg.sender];
        require(withdrawRequest.id == 0, "Already have a waiting request");

        uint256 balance = 0;
        // Calculate withdraw request amount
        withdrawRequest.id = ++_requestId;
        for (uint256 i = 0; i < serials.length; ++i) {
            bytes9 serial = bytes9(bytes(serials[i]));
            withdrawRequest.deviceBalances.push(DeviceBalance({serial: serial, balance: _balances[msg.sender][serial]}));
            balance += _balances[msg.sender][serial];
            _balances[msg.sender][serial] = 0; // Clear the requested reward balance
            emit WithdrawRequested(withdrawRequest.id, msg.sender, serials[i], withdrawRequest.timestamp, balance);
        }
        require(balance > 0, "Insufficient balance");
        withdrawRequest.timestamp = block.timestamp + requestTime;
        withdrawRequest.amount = balance;
    }

    /**
    @notice Cancel withdraw request
    */
    function cancel() whenNotPaused nonReentrant external {
        WithdrawRequest storage withdrawRequest = withdrawRequests[msg.sender];
        require(withdrawRequest.id > 0, "No request found");
        DeviceBalance[] memory deviceBalances = withdrawRequest.deviceBalances;
        // Return balance to staking amount
        for (uint256 i = 0; i < deviceBalances.length; i++) {
            _balances[msg.sender][deviceBalances[i].serial] += deviceBalances[i].balance;
            emit WithdrawRequestCanceled(withdrawRequest.id, msg.sender, string(abi.encodePacked(deviceBalances[i].serial)), withdrawRequest.timestamp, deviceBalances[i].balance);
        }

        // Clear withdrawn request
        delete withdrawRequests[msg.sender];
    }

    /**
    @notice Withdraw
    */
    function withdraw() whenNotPaused nonReentrant external {
        WithdrawRequest storage withdrawRequest = withdrawRequests[msg.sender];
        require(withdrawRequest.id > 0, "No request found");
        require(block.timestamp >= withdrawRequest.timestamp, "Waiting time not over");

        // Call TOPS contract to transfer
        IERC20 token = IERC20(tokenAddress);
        token.transfer(msg.sender, withdrawRequests[msg.sender].amount);

        emit Withdrawn(withdrawRequest.id, msg.sender, withdrawRequests[msg.sender].amount);

        // Clear withdrawn request
        delete withdrawRequests[msg.sender];
    }

    /**
    @notice Get balance
    */
    function getBalance(address wallet, string calldata serial) public view returns (uint256) {
        return _balances[wallet][bytes9(bytes(serial))];
    }
}