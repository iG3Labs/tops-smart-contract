# TOPS Smart Contracts

> **Staking and Rewards System for IG3 Ecosystem**

A comprehensive smart contract system for TOPS token staking, reward distribution, and automated reinvestment with device-specific tracking and time-locked security mechanisms.

## 🏗️ Architecture

```
TOPS Tokens → IG3Staking → Withdrawal Requests → Time-locked Claims
           ↗ IG3Reward → Reinvestment → IG3Staking
                      ↘ Direct Withdrawal
```

## 📋 Contracts

| Contract | Description | Key Features |
|----------|-------------|--------------|
| **TOPS.sol** | Main ERC20 token | Capped supply (10B), role-based minting/burning |
| **IG3Staking.sol** | Staking mechanism | Device-specific balances, time-locked withdrawals |
| **IG3Reward.sol** | Reward distribution | Automated reinvestment, cross-contract integration |
| **IMintableBurnableERC20.sol** | Token interface | Standard interface for mintable/burnable tokens |

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- pnpm package manager

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd tops-smart-contract

# Install dependencies
pnpm install

# Compile contracts
npx hardhat compile

# Generate TypeChain types
npx hardhat typechain
```

### Testing

```bash
# Run all tests
npx hardhat test

# Run with coverage
npx hardhat coverage

# Check contract sizes
npx hardhat size-contracts

# Run gas estimation tests
npx hardhat test test/gas-estimation.test.ts
```

### Local Development

```bash
# Start local Hardhat node
pnpm run local

# In another terminal, deploy contracts (if you have deployment scripts)
# npx hardhat run scripts/deploy.js --network localhost
```

## 🔧 Contract Details

### TOPS Token Contract
- **Type**: ERC20 with OpenZeppelin upgradeable patterns
- **Max Supply**: 10,000,000,000 tokens
- **Roles**: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`
- **Security**: Capped supply, role-based access control

### IG3Staking Contract
- **Pattern**: Time-locked withdrawal requests
- **Device Tracking**: Uses `bytes9` serial numbers for device-specific balances
- **Security Features**:
  - Single active withdrawal request per wallet
  - Configurable time lock (default: 7 days)
  - Reentrancy protection
  - Emergency pause functionality
- **Roles**: `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `UPGRADER_ROLE`, `REINVEST_ROLE`

### IG3Reward Contract
- **Features**: Automated percentage-based reinvestment (0-100%)
- **Integration**: Cross-contract calls to IG3Staking via `IIG3Staking` interface
- **Administration**: Bulk reward processing, reward wallet management
- **Security**: Role-based access, reentrancy protection

## 🔐 Security Features

- **OpenZeppelin Security**: Battle-tested security libraries
- **Upgradeable Contracts**: UUPS proxy pattern for future improvements
- **Role-Based Access Control**: Granular permissions for different operations
- **Pausable Functionality**: Emergency stop capabilities
- **Reentrancy Protection**: All state-changing functions protected
- **Time-Lock Mechanisms**: Prevents rapid drainage attacks

## 🌐 Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| Hardhat Local | 1 | Development |
| Localhost | 1337 | Development |
| Peaq Network | 3338 | Mainnet |

## 📚 Usage Examples

### For Users

**Stake Tokens:**
```solidity
// Single device staking
IG3Staking.deposit("DEVICE123", 1000 * 10**18);

// Bulk staking for multiple devices
DepositInfo[] memory deposits = [
    DepositInfo("DEVICE123", 500 * 10**18),
    DepositInfo("DEVICE456", 500 * 10**18)
];
IG3Staking.bulkDeposit(deposits);
```

**Request Withdrawal:**
```solidity
// Request withdrawal for specific devices
string[] memory serials = ["DEVICE123", "DEVICE456"];
IG3Staking.request(serials);
```

**Configure Reinvestment:**
```solidity
// Set 25% of rewards to auto-reinvest
IG3Reward.setReinvestPercentage(25);
```

### For Administrators

**Add Rewards:**
```solidity
DeviceReward[] memory rewards = [
    DeviceReward(userAddress, "DEVICE123", 100 * 10**18)
];
IG3Reward.addRewards(rewards);
```

**Emergency Controls:**
```solidity
// Pause system
IG3Staking.pause();
IG3Reward.pause();

// Unpause when ready
IG3Staking.unpause();
IG3Reward.unpause();
```

## 🧪 Testing

The project includes comprehensive test coverage:

- **TOPS.test.ts**: Token functionality, role management
- **IG3Staking.test.ts**: Staking, withdrawal requests, time locks
- **IG3Reward.test.ts**: Reward distribution, reinvestment
- **gas-estimation.test.ts**: Gas usage optimization

### Test Categories
- ✅ Role-based access control
- ✅ Time-locked withdrawal mechanisms  
- ✅ Reentrancy attack prevention
- ✅ Pause/unpause functionality
- ✅ Cross-contract interactions
- ✅ Gas optimization validation

## 🔍 Monitoring & Debugging

### View Functions
```solidity
// Check staking balance
uint256 balance = IG3Staking.getBalance(userAddress, "DEVICE123");

// Check withdrawal request
WithdrawRequest memory request = IG3Staking.withdrawRequests(userAddress);

// Check reward balance
uint256 rewards = IG3Reward.getBalance(userAddress, "DEVICE123");

// Check reinvestment percentage
uint8 percentage = IG3Reward.getReinvestPercentage(userAddress);
```

## 📦 Dependencies

### Core Dependencies
- `@openzeppelin/contracts`: 4.9.6
- `@openzeppelin/contracts-upgradeable`: 4.9.6
- `@openzeppelin/hardhat-upgrades`: 2.3.3
- `ethers`: 6.13.2
- `hardhat`: 2.19.1

### Development Dependencies
- `@nomicfoundation/hardhat-toolbox`: 3.0.0
- `hardhat-contract-sizer`: 2.10.0
- `chai`: 4.3.10

## 🛠️ Development Scripts

```bash
# Basic commands
pnpm run local          # Start local node
npx hardhat compile     # Compile contracts
npx hardhat typechain   # Generate TypeChain types
npx hardhat test        # Run tests
npx hardhat coverage    # Test coverage
npx hardhat size-contracts  # Check contract sizes

# Cleanup
npx hardhat clean       # Clean artifacts and cache
```

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

---

**⚡ Built for the IG3 Ecosystem on Peaq** 