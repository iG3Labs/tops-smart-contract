import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";

describe("IG3Reward", () => {
    let topsToken: any;
    let ig3Reward: any;
    let stakingContract: any;
    let owner: any;
    let pauser: any;
    let upgrader: any;
    let rewardWallet: any;
    let addr1: any;
    let addr2: any;
    let snapshotId: string;

    before(async () => {
        [owner, pauser, upgrader, rewardWallet, addr1, addr2] = await ethers.getSigners();

        // Deploy TOPS token
        const topsTokenFactory = await ethers.getContractFactory("TOPS");
        topsToken = await upgrades.deployProxy(topsTokenFactory, { initializer: "initialize" });
        await topsToken.waitForDeployment();
        await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);

        // Deploy IG3Staking contract for testing
        const stakingFactory = await ethers.getContractFactory("IG3Staking");
        stakingContract = await upgrades.deployProxy(
            stakingFactory,
            [owner.address, pauser.address, upgrader.address, await topsToken.getAddress()],
            { initializer: "initialize" }
        );
        await stakingContract.waitForDeployment();

        // Deploy IG3Reward
        const ig3RewardFactory = await ethers.getContractFactory("IG3Reward");
        const topsTokenAddress = await topsToken.getAddress();
        const stakingAddress = await stakingContract.getAddress();
        
        ig3Reward = await upgrades.deployProxy(
            ig3RewardFactory,
            [owner.address, pauser.address, upgrader.address, topsTokenAddress, stakingAddress],
            { initializer: "initialize" }
        );
        await ig3Reward.waitForDeployment();
    });

    beforeEach(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
    });

    describe("Initialization", () => {
        it("Should initialize with correct parameters", async () => {
            expect(await ig3Reward.tokenAddress()).to.equal(await topsToken.getAddress());
            expect(await ig3Reward.stakingAddress()).to.equal(await stakingContract.getAddress());
            expect(await ig3Reward.hasRole(await ig3Reward.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
            expect(await ig3Reward.hasRole(await ig3Reward.PAUSER_ROLE(), pauser.address)).to.be.true;
            expect(await ig3Reward.hasRole(await ig3Reward.UPGRADER_ROLE(), upgrader.address)).to.be.true;
        });
    });

    describe("Configuration", () => {
        it("Should set token address", async () => {
            const newTokenAddress = addr1.address;
            await expect(ig3Reward.setTokenAddress(newTokenAddress))
                .to.emit(ig3Reward, "TokenAddressChanged")
                .withArgs(newTokenAddress);
            expect(await ig3Reward.tokenAddress()).to.equal(newTokenAddress);
        });

        it("Should set reward wallet", async () => {
            await expect(ig3Reward.setRewardWallet(rewardWallet.address))
                .to.emit(ig3Reward, "RewardWalletChanged")
                .withArgs(rewardWallet.address);
            expect(await ig3Reward.getRewardWallet()).to.equal(rewardWallet.address);
        });

        it("Should set staking address", async () => {
            const newStakingAddress = addr1.address;
            await expect(ig3Reward.setStakingAddress(newStakingAddress))
                .to.emit(ig3Reward, "StakingAddressChanged")
                .withArgs(newStakingAddress);
            expect(await ig3Reward.getStakingAddress()).to.equal(newStakingAddress);
        });

        it("Should only allow admin to set config", async () => {
            const DEFAULT_ADMIN_ROLE = await ig3Reward.DEFAULT_ADMIN_ROLE();
            await expect(ig3Reward.connect(addr1).setTokenAddress(addr2.address))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
            await expect(ig3Reward.connect(addr1).setRewardWallet(rewardWallet.address))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
            await expect(ig3Reward.connect(addr1).setStakingAddress(addr2.address))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
        });
    });

    describe("Reinvestment Logic", () => {
        beforeEach(async () => {
            await ig3Reward.setRewardWallet(rewardWallet.address);
        });

        it("Should set reinvest percentage", async () => {
            await expect(ig3Reward.connect(addr1).setReinvestPercentage(50))
                .to.emit(ig3Reward, "ReinvestPercentageChanged")
                .withArgs(addr1.address, 50);
            expect(await ig3Reward.getReinvestPercentage(addr1.address)).to.equal(50);
        });

        it("Should reject invalid percentage", async () => {
            await expect(ig3Reward.connect(addr1).setReinvestPercentage(101))
                .to.be.revertedWith("Invalid percentage");
        });

        it("Should not work when paused", async () => {
            await ig3Reward.connect(pauser).pause();
            await expect(ig3Reward.connect(addr1).setReinvestPercentage(50))
                .to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Reward Logic", () => {
        beforeEach(async () => {
            await ig3Reward.setRewardWallet(rewardWallet.address);
            // Mint tokens to reward wallet
            await topsToken.mint(rewardWallet.address, ethers.parseEther("10000"));
            // Approve ig3Reward to spend tokens
            await topsToken.connect(rewardWallet).approve(ig3Reward.target, ethers.parseEther("10000"));
            // Grant reinvest role to ig3Reward for staking interaction
            await stakingContract.grantRole(await stakingContract.REINVEST_ROLE(), ig3Reward.target);
        });

        it("Should add rewards for devices without reinvestment", async () => {
            const rewards = [
                { wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") },
                { wallet: addr1.address, serial: "SERIAL002", value: ethers.parseEther("200") }
            ];
            
            await expect(ig3Reward.addRewards(rewards))
                .to.emit(ig3Reward, "RewardAdded")
                .withArgs(addr1.address, "SERIAL001", ethers.parseEther("100"), 0);
                
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(ethers.parseEther("100"));
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL002")).to.equal(ethers.parseEther("200"));
        });

        it("Should add rewards with reinvestment", async () => {
            // Set reinvest percentage
            await ig3Reward.connect(addr1).setReinvestPercentage(30);
            
            const rewards = [
                { wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") }
            ];
            
            const expectedReinvestAmount = ethers.parseEther("30"); // 30% of 100
            const expectedBalance = ethers.parseEther("70"); // 70% remains
            
            await expect(ig3Reward.addRewards(rewards))
                .to.emit(ig3Reward, "RewardAdded")
                .withArgs(addr1.address, "SERIAL001", ethers.parseEther("100"), expectedReinvestAmount);
                
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(expectedBalance);
            expect(await stakingContract.getBalance(addr1.address, "SERIAL001")).to.equal(expectedReinvestAmount);
        });

        it("Should accumulate rewards for the same device", async () => {
            const rewards = [ { wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") } ];
            await ig3Reward.addRewards(rewards);
            await ig3Reward.addRewards(rewards);
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(ethers.parseEther("200"));
        });

        it("Should add rewards for multiple wallets and devices", async () => {
            const rewards = [
                { wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") },
                { wallet: addr1.address, serial: "SERIAL002", value: ethers.parseEther("200") },
                { wallet: addr2.address, serial: "SERIAL003", value: ethers.parseEther("300") }
            ];
            await ig3Reward.addRewards(rewards);
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(ethers.parseEther("100"));
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL002")).to.equal(ethers.parseEther("200"));
            expect(await ig3Reward.getBalance(addr2.address, "SERIAL003")).to.equal(ethers.parseEther("300"));
        });

        it("Should only allow admin to add rewards", async () => {
            const rewards = [{ wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") }];
            const DEFAULT_ADMIN_ROLE = await ig3Reward.DEFAULT_ADMIN_ROLE();
            await expect(ig3Reward.connect(addr1).addRewards(rewards))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
        });
    });

    describe("Withdraw Logic", () => {
        beforeEach(async () => {
            await ig3Reward.setRewardWallet(rewardWallet.address);
            // Mint tokens to reward wallet
            await topsToken.mint(rewardWallet.address, ethers.parseEther("10000"));
            // Approve ig3Reward to spend tokens
            await topsToken.connect(rewardWallet).approve(ig3Reward.target, ethers.parseEther("10000"));
            
            // Add rewards for testing
            await ig3Reward.addRewards([
                { wallet: addr1.address, serial: "SERIAL001", value: ethers.parseEther("100") },
                { wallet: addr1.address, serial: "SERIAL002", value: ethers.parseEther("200") }
            ]);
        });

        it("Should allow immediate withdrawal of rewards", async () => {
            const serials = ["SERIAL001", "SERIAL002"];
            const expectedAmount = ethers.parseEther("300");
            
            await expect(ig3Reward.connect(addr1).withdraw(serials))
                .to.emit(ig3Reward, "Withdrawn")
                .withArgs(addr1.address, expectedAmount, serials);
                
            // Check balances are cleared
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(0);
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL002")).to.equal(0);
            
            // Check tokens were transferred
            expect(await topsToken.balanceOf(addr1.address)).to.equal(expectedAmount);
        });

        it("Should allow partial withdrawal", async () => {
            const serials = ["SERIAL001"];
            const expectedAmount = ethers.parseEther("100");
            
            await expect(ig3Reward.connect(addr1).withdraw(serials))
                .to.emit(ig3Reward, "Withdrawn")
                .withArgs(addr1.address, expectedAmount, serials);
                
            // Check only requested balance is cleared
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL001")).to.equal(0);
            expect(await ig3Reward.getBalance(addr1.address, "SERIAL002")).to.equal(ethers.parseEther("200"));
        });

        it("Should revert if insufficient balance", async () => {
            await expect(ig3Reward.connect(addr2).withdraw(["SERIAL001"]))
                .to.be.revertedWith("Insufficient balance");
        });

        it("Should revert if reward wallet has insufficient allowance", async () => {
            // Reset allowance
            await topsToken.connect(rewardWallet).approve(ig3Reward.target, 0);
            
            await expect(ig3Reward.connect(addr1).withdraw(["SERIAL001"]))
                .to.be.reverted;
        });

        it("Should not work when paused", async () => {
            await ig3Reward.connect(pauser).pause();
            await expect(ig3Reward.connect(addr1).withdraw(["SERIAL001"]))
                .to.be.revertedWith("Pausable: paused");
        });
    });

    describe("Pause/Unpause", () => {
        it("Should pause and unpause by pauser", async () => {
            await ig3Reward.connect(pauser).pause();
            expect(await ig3Reward.paused()).to.equal(true);
            await ig3Reward.connect(pauser).unpause();
            expect(await ig3Reward.paused()).to.equal(false);
        });

        it("Should not allow non-pauser to pause", async () => {
            const PAUSER_ROLE = await ig3Reward.PAUSER_ROLE();
            await expect(ig3Reward.connect(addr1).pause())
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${PAUSER_ROLE}`);
        });
    });

    describe("Access Control", () => {
        it("Should have correct role assignments", async () => {
            expect(await ig3Reward.hasRole(await ig3Reward.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
            expect(await ig3Reward.hasRole(await ig3Reward.PAUSER_ROLE(), pauser.address)).to.be.true;
            expect(await ig3Reward.hasRole(await ig3Reward.UPGRADER_ROLE(), upgrader.address)).to.be.true;
        });
    });

    describe("Getters", () => {
        it("Should return correct values", async () => {
            expect(await ig3Reward.tokenAddress()).to.equal(await topsToken.getAddress());
            expect(await ig3Reward.getStakingAddress()).to.equal(await stakingContract.getAddress());
            expect(await ig3Reward.getReinvestPercentage(addr1.address)).to.equal(0);
        });
    });
});