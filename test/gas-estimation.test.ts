import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Gas Estimation for addRewards", () => {
    let topsToken: any;
    let ig3Reward: any;
    let owner: any;
    let addr1: any;
    let addr2: any;

    before(async () => {
        [owner, , , , addr1, addr2] = await ethers.getSigners();

        // Deploy TOPS token
        const topsTokenFactory = await ethers.getContractFactory("TOPS");
        topsToken = await upgrades.deployProxy(topsTokenFactory, { initializer: "initialize" });
        await topsToken.waitForDeployment();

        // Deploy IG3Staking contract for testing
        const stakingFactory = await ethers.getContractFactory("IG3Staking");
        const stakingContract = await upgrades.deployProxy(
            stakingFactory,
            [owner.address, owner.address, owner.address, await topsToken.getAddress()],
            { initializer: "initialize" }
        );
        await stakingContract.waitForDeployment();

        // Deploy IG3Reward
        const ig3RewardFactory = await ethers.getContractFactory("IG3Reward");
        const topsTokenAddress = await topsToken.getAddress();
        const stakingAddress = await stakingContract.getAddress();
        ig3Reward = await upgrades.deployProxy(
            ig3RewardFactory,
            [owner.address, owner.address, owner.address, topsTokenAddress, stakingAddress],
            { initializer: "initialize" }
        );
        await ig3Reward.waitForDeployment();
    });

    it("Should measure gas consumption for different reward array sizes", async () => {
        console.log("\n=== Gas Consumption Analysis ===");
        
        const sizes = [1, 10, 50, 100, 200, 500];
        const gasResults: { size: number; gasUsed: bigint; gasPerReward: number }[] = [];

        for (const size of sizes) {
            const rewards = [];
            for (let i = 0; i < size; i++) {
                rewards.push({
                    wallet: i % 2 === 0 ? addr1.address : addr2.address,
                    serial: `SERIAL${i.toString().padStart(3, '0')}`,
                    value: ethers.parseEther((i + 1).toString())
                });
            }

            try {
                const tx = await ig3Reward.addRewards(rewards);
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed;
                const gasPerReward = Number(gasUsed) / size;
                
                gasResults.push({ size, gasUsed, gasPerReward });
                
                console.log(`Size: ${size.toString().padStart(3)} | Gas: ${gasUsed.toString().padStart(8)} | Per reward: ${gasPerReward.toFixed(0).padStart(6)}`);
            } catch (error) {
                console.log(`Size: ${size.toString().padStart(3)} | FAILED: ${(error as Error).message.split('\n')[0]}`);
                break;
            }
        }

        console.log("\n=== Analysis ===");
        
        // Calculate average gas per reward (excluding first data point which includes setup costs)
        if (gasResults.length > 1) {
            const avgGasPerReward = gasResults.slice(1).reduce((sum, result) => sum + result.gasPerReward, 0) / (gasResults.length - 1);
            console.log(`Average gas per reward: ${avgGasPerReward.toFixed(0)}`);
            
            // Estimate maximum based on typical block gas limits
            const blockGasLimits = {
                "Ethereum": 30000000,
                "Polygon": 30000000,
                "BSC": 140000000,
                "Arbitrum": 1125899906842624, // Much higher
                "PEAQ": 4294967295
            };
            
            console.log("\nEstimated maximum rewards per transaction:");
            Object.entries(blockGasLimits).forEach(([network, gasLimit]) => {
                const maxRewards = Math.floor(gasLimit / avgGasPerReward);
                console.log(`${network.padEnd(10)}: ~${maxRewards.toLocaleString()} rewards`);
            });
            
            // Practical recommendations
            console.log("\n=== Recommendations ===");
            console.log("Conservative batch size (50% of gas limit):");
            Object.entries(blockGasLimits).forEach(([network, gasLimit]) => {
                if (network !== "Arbitrum") { // Skip Arbitrum due to very high limit
                    const conservativeMax = Math.floor((gasLimit * 0.5) / avgGasPerReward);
                    console.log(`${network.padEnd(10)}: ~${conservativeMax.toLocaleString()} rewards`);
                }
            });
        }
    });

    it("Should test edge cases for maximum array length", async () => {
        console.log("\n=== Edge Case Testing ===");
        
        // Test with very large array to find actual limit
        const testSizes = [100, 150, 200, 300, 400, 500];
        
        for (const size of testSizes) {
            const rewards = [];
            for (let i = 0; i < size; i++) {
                rewards.push({
                    wallet: addr1.address,
                    serial: `S${i}`, // Shorter serials to reduce gas
                    value: ethers.parseEther("1")
                });
            }

            try {
                // Estimate gas first
                const gasEstimate = await ig3Reward.addRewards.estimateGas(rewards);
                console.log(`Size ${size}: Estimated gas: ${gasEstimate.toString()}`);
                
                // If gas estimate is reasonable, try actual transaction
                if (gasEstimate < 30000000n) {
                    const tx = await ig3Reward.addRewards(rewards);
                    const receipt = await tx.wait();
                    console.log(`Size ${size}: Actual gas used: ${receipt.gasUsed.toString()}`);
                } else {
                    console.log(`Size ${size}: Too expensive to execute (${gasEstimate.toString()} gas)`);
                }
            } catch (error) {
                console.log(`Size ${size}: Failed - ${(error as Error).message.split('\n')[0]}`);
                break;
            }
        }
    });

    it("Should analyze storage costs (new vs existing serials)", async () => {
        console.log("\n=== Storage Cost Analysis ===");
        
        // Test new serial (cold storage write - 20k gas)
        const newSerial = [{
            wallet: addr1.address,
            serial: "NEWSERIAL",
            value: ethers.parseEther("100")
        }];
        
        const newTx = await ig3Reward.addRewards(newSerial);
        const newReceipt = await newTx.wait();
        console.log(`New serial gas cost: ${newReceipt.gasUsed.toString()}`);
        
        // Test updating same serial (warm storage write - 5k gas)
        const updateSerial = [{
            wallet: addr1.address,
            serial: "NEWSERIAL", // Same serial
            value: ethers.parseEther("50")
        }];
        
        const updateTx = await ig3Reward.addRewards(updateSerial);
        const updateReceipt = await updateTx.wait();
        console.log(`Update serial gas cost: ${updateReceipt.gasUsed.toString()}`);
        
        const difference = newReceipt.gasUsed - updateReceipt.gasUsed;
        console.log(`Difference (new vs update): ${difference.toString()} gas`);
    });
}); 