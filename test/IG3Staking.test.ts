import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("IG3Staking", () => {
    let topsToken: any;
    let ig3Staking: any;
    let owner: any;
    let pauser: any;
    let upgrader: any;
    let addr1: any;
    let addr2: any;
    let snapshotId: string;

    before(async () => {
        [owner, pauser, upgrader, addr1, addr2] = await ethers.getSigners();
    
        // Deploy TOPS token
        const topsTokenFactory = await ethers.getContractFactory("TOPS");
        topsToken = await upgrades.deployProxy(topsTokenFactory, { initializer: "initialize" });
        await topsToken.waitForDeployment(); // <-- Ensure deployment is complete
        await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
    
        // Deploy IG3Staking
        const ig3StakingFactory = await ethers.getContractFactory("IG3Staking");
        const topsTokenAddress = await topsToken.getAddress(); // <-- Use getAddress() for ethers v6
        ig3Staking = await upgrades.deployProxy(
            ig3StakingFactory,
            [owner.address, pauser.address, upgrader.address, topsTokenAddress],
            { initializer: "initialize" }
        );
        await ig3Staking.waitForDeployment();
    });
    
    beforeEach(async () => {
        snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
        await ethers.provider.send("evm_revert", [snapshotId]);
    });

    describe("Initialization", () => {
        it("Should initialize with correct parameters", async () => {
            expect(await ig3Staking.tokenAddress()).to.equal(await topsToken.getAddress());
            expect(await ig3Staking.requestTime()).to.equal(7 * 24 * 60 * 60); // 7 days default
            expect(await ig3Staking.hasRole(await ig3Staking.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
            expect(await ig3Staking.hasRole(await ig3Staking.PAUSER_ROLE(), pauser.address)).to.be.true;
            expect(await ig3Staking.hasRole(await ig3Staking.UPGRADER_ROLE(), upgrader.address)).to.be.true;
        });
    });

    describe("Configuration", () => {
        it("Should set request time", async () => {
            await expect(ig3Staking.setRequestTime(14 * 24 * 60 * 60))
                .to.emit(ig3Staking, "RequestTimeChanged")
                .withArgs(14 * 24 * 60 * 60);
            expect(await ig3Staking.requestTime()).to.equal(14 * 24 * 60 * 60);
        });

        it("Should set token address", async () => {
            const newTokenAddress = addr1.address;
            await expect(ig3Staking.setTokenAddress(newTokenAddress))
                .to.emit(ig3Staking, "TokenAddressChanged")
                .withArgs(newTokenAddress);
            expect(await ig3Staking.tokenAddress()).to.equal(newTokenAddress);
        });

        it("Should revert if setting token address to zero", async () => {
            await expect(ig3Staking.setTokenAddress(ethers.ZeroAddress))
                .to.be.revertedWith("Token address cannot be 0");
        });

        it("Should only allow admin to set config", async () => {
            const DEFAULT_ADMIN_ROLE = await ig3Staking.DEFAULT_ADMIN_ROLE();
            await expect(ig3Staking.connect(addr1).setRequestTime(1))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
            await expect(ig3Staking.connect(addr1).setTokenAddress(addr2.address))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`);
        });
    });

    describe("Deposit Logic", () => {
        beforeEach(async () => {
            // Mint tokens and approve staking contract
            await topsToken.mint(addr1.address, ethers.parseEther("1000"));
            await topsToken.mint(addr2.address, ethers.parseEther("1000"));
            const ig3StakingAddress = await ig3Staking.getAddress();
            await topsToken.connect(addr1).approve(ig3StakingAddress, ethers.parseEther("1000"));
            await topsToken.connect(addr2).approve(ig3StakingAddress, ethers.parseEther("1000"));
        });

        it("Should deposit and emit event", async () => {
            await expect(ig3Staking.connect(addr1).deposit("SERIAL012", ethers.parseEther("500")))
                .to.emit(ig3Staking, "Deposited")
                .withArgs(addr1.address, "SERIAL012", ethers.parseEther("500"));
            
            const balance = await ig3Staking.getBalance(addr1.address, "SERIAL012");
            expect(balance).to.equal(ethers.parseEther("500"));
        });

        it("Should revert deposit with zero amount", async () => {
            await expect(ig3Staking.connect(addr1).deposit("SERIAL001", 0))
                .to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should revert deposit without sufficient approval", async () => {
            await expect(ig3Staking.connect(addr1).deposit("SERIAL001", ethers.parseEther("2000")))
                .to.be.reverted;
        });

        it("Should revert deposit when paused", async () => {
            await ig3Staking.connect(pauser).pause();
            await expect(ig3Staking.connect(addr1).deposit("SERIAL001", ethers.parseEther("100")))
                .to.be.revertedWith("Pausable: paused");
        });

        it("Should accumulate deposits for the same serial", async () => {
            await ig3Staking.connect(addr1).deposit("SERIAL001", ethers.parseEther("100"));
            await ig3Staking.connect(addr1).deposit("SERIAL001", ethers.parseEther("200"));
            
            const balance = await ig3Staking.getBalance(addr1.address, "SERIAL001");
            expect(balance).to.equal(ethers.parseEther("300"));
        });
    });

    describe("Reinvest Logic", () => {
        beforeEach(async () => {
            // Grant reinvest role to owner for testing
            await ig3Staking.grantRole(await ig3Staking.REINVEST_ROLE(), owner.address);
        });

        it("Should reinvest and emit event", async () => {
            await expect(ig3Staking.reinvest(addr1.address, "SERIAL001", ethers.parseEther("100")))
                .to.emit(ig3Staking, "Deposited")
                .withArgs(addr1.address, "SERIAL001", ethers.parseEther("100"));
            
            const balance = await ig3Staking.getBalance(addr1.address, "SERIAL001");
            expect(balance).to.equal(ethers.parseEther("100"));
        });

        it("Should revert reinvest with zero amount", async () => {
            await expect(ig3Staking.reinvest(addr1.address, "SERIAL001", 0))
                .to.be.revertedWith("Amount must be greater than 0");
        });

        it("Should only allow reinvest role", async () => {
            const REINVEST_ROLE = await ig3Staking.REINVEST_ROLE();
            await expect(ig3Staking.connect(addr1).reinvest(addr2.address, "SERIAL001", ethers.parseEther("100")))
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${REINVEST_ROLE}`);
        });

        it("Should accumulate reinvested amounts", async () => {
            await ig3Staking.reinvest(addr1.address, "SERIAL001", ethers.parseEther("100"));
            await ig3Staking.reinvest(addr1.address, "SERIAL001", ethers.parseEther("200"));
            
            const balance = await ig3Staking.getBalance(addr1.address, "SERIAL001");
            expect(balance).to.equal(ethers.parseEther("300"));
        });
    });

    describe("Request-Based Withdraw Logic", () => {
        beforeEach(async () => {
            // Setup initial deposits
            await topsToken.mint(addr1.address, ethers.parseEther("1000"));
            const ig3StakingAddress = await ig3Staking.getAddress();
            await topsToken.connect(addr1).approve(ig3StakingAddress, ethers.parseEther("1000"));
            await ig3Staking.connect(addr1).deposit("SERIAL001", ethers.parseEther("300"));
            await ig3Staking.connect(addr1).deposit("SERIAL002", ethers.parseEther("200"));
        });

        describe("Request", () => {
            it("Should create withdraw request and emit event", async () => {
                const serials = ["SERIAL001", "SERIAL002"];
                const expectedAmount = ethers.parseEther("500");
                
                await expect(ig3Staking.connect(addr1).request(serials))
                    .to.emit(ig3Staking, "WithdrawRequested");
                
                const request = await ig3Staking.withdrawRequests(addr1.address);
                expect(request.amount).to.equal(expectedAmount);
                expect(request.id).to.not.equal(0);
                
                // Balances should be cleared
                expect(await ig3Staking.getBalance(addr1.address, "SERIAL001")).to.equal(0);
                expect(await ig3Staking.getBalance(addr1.address, "SERIAL002")).to.equal(0);
            });

            it("Should revert if already has a waiting request", async () => {
                await ig3Staking.connect(addr1).request(["SERIAL001"]);
                await expect(ig3Staking.connect(addr1).request(["SERIAL002"]))
                    .to.be.revertedWith("Already have a waiting request");
            });

            it("Should revert if insufficient balance", async () => {
                await expect(ig3Staking.connect(addr2).request(["SERIAL001"]))
                    .to.be.revertedWith("Insufficient balance");
            });

            it("Should revert when paused", async () => {
                await ig3Staking.connect(pauser).pause();
                await expect(ig3Staking.connect(addr1).request(["SERIAL001"]))
                    .to.be.revertedWith("Pausable: paused");
            });
        });

        describe("Cancel", () => {
            beforeEach(async () => {
                await ig3Staking.connect(addr1).request(["SERIAL001", "SERIAL002"]);
            });

            it("Should cancel request and restore balances", async () => {
                await ig3Staking.connect(addr1).cancel();
                
                // Request should be cleared
                const request = await ig3Staking.withdrawRequests(addr1.address);
                expect(request.id).to.equal(0);
                expect(request.amount).to.equal(0);
                
                // Balances should be restored
                expect(await ig3Staking.getBalance(addr1.address, "SERIAL001")).to.equal(ethers.parseEther("300"));
                expect(await ig3Staking.getBalance(addr1.address, "SERIAL002")).to.equal(ethers.parseEther("200"));
            });

            it("Should revert if no request found", async () => {
                await expect(ig3Staking.connect(addr2).cancel())
                    .to.be.revertedWith("No request found");
            });

            it("Should revert when paused", async () => {
                await ig3Staking.connect(pauser).pause();
                await expect(ig3Staking.connect(addr1).cancel())
                    .to.be.revertedWith("Pausable: paused");
            });
        });

        describe("Withdraw", () => {
            beforeEach(async () => {
                await ig3Staking.connect(addr1).request(["SERIAL001", "SERIAL002"]);
            });

            it("Should revert if waiting time not over", async () => {
                await expect(ig3Staking.connect(addr1).withdraw())
                    .to.be.revertedWith("Waiting time not over");
            });

            it("Should withdraw after waiting time and emit event", async () => {
                const request = await ig3Staking.withdrawRequests(addr1.address);
                
                // Fast forward time past the request timestamp
                await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(request.timestamp.toString())]);
                await ethers.provider.send("evm_mine", []);
                
                await expect(ig3Staking.connect(addr1).withdraw())
                    .to.emit(ig3Staking, "Withdrawn")
                    .withArgs(request.id, addr1.address, request.amount);
                
                // Request should be cleared
                const clearedRequest = await ig3Staking.withdrawRequests(addr1.address);
                expect(clearedRequest.id).to.equal(0);
                expect(clearedRequest.amount).to.equal(0);
            });

            it("Should revert if no request found", async () => {
                await expect(ig3Staking.connect(addr2).withdraw())
                    .to.be.revertedWith("No request found");
            });

            it("Should revert when paused", async () => {
                await ig3Staking.connect(pauser).pause();
                await expect(ig3Staking.connect(addr1).withdraw())
                    .to.be.revertedWith("Pausable: paused");
            });
        });
    });

    describe("Pause/Unpause", () => {
        it("Should pause and unpause by pauser", async () => {
            await ig3Staking.connect(pauser).pause();
            expect(await ig3Staking.paused()).to.equal(true);
            await ig3Staking.connect(pauser).unpause();
            expect(await ig3Staking.paused()).to.equal(false);
        });

        it("Should not allow non-pauser to pause", async () => {
            const PAUSER_ROLE = await ig3Staking.PAUSER_ROLE();
            await expect(ig3Staking.connect(addr1).pause())
                .to.be.revertedWith(`AccessControl: account ${addr1.address.toLowerCase()} is missing role ${PAUSER_ROLE}`);
        });
    });

    describe("Access Control", () => {
        it("Should have correct role assignments", async () => {
            expect(await ig3Staking.hasRole(await ig3Staking.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
            expect(await ig3Staking.hasRole(await ig3Staking.PAUSER_ROLE(), pauser.address)).to.be.true;
            expect(await ig3Staking.hasRole(await ig3Staking.UPGRADER_ROLE(), upgrader.address)).to.be.true;
        });
    });

    describe("Edge Cases & Integration", () => {
        beforeEach(async () => {
            await topsToken.mint(addr1.address, ethers.parseEther("1000"));
            await topsToken.mint(addr2.address, ethers.parseEther("1000"));
            const ig3StakingAddress = await ig3Staking.getAddress();
            await topsToken.connect(addr1).approve(ig3StakingAddress, ethers.parseEther("1000"));
            await topsToken.connect(addr2).approve(ig3StakingAddress, ethers.parseEther("1000"));
        });

        it("Should return zero balance for non-existent serial", async () => {
            const balance = await ig3Staking.getBalance(addr1.address, "NONEXISTENT");
            expect(balance).to.equal(0);
        });

        it("Should keep balances isolated between users", async () => {
            await ig3Staking.connect(addr1).deposit("SHARED", ethers.parseEther("100"));
            await ig3Staking.connect(addr2).deposit("SHARED", ethers.parseEther("50"));
            
            const bal1 = await ig3Staking.getBalance(addr1.address, "SHARED");
            const bal2 = await ig3Staking.getBalance(addr2.address, "SHARED");
            
            expect(bal1).to.equal(ethers.parseEther("100"));
            expect(bal2).to.equal(ethers.parseEther("50"));
        });

        it("Should handle multiple requests lifecycle", async () => {
            // Initial deposits
            await ig3Staking.connect(addr1).deposit("SERIAL1", ethers.parseEther("100"));
            await ig3Staking.connect(addr1).deposit("SERIAL2", ethers.parseEther("200"));
            
            // Create request
            await ig3Staking.connect(addr1).request(["SERIAL1", "SERIAL2"]);
            let request = await ig3Staking.withdrawRequests(addr1.address);
            expect(request.amount).to.equal(ethers.parseEther("300"));
            
            // Cancel and try again
            await ig3Staking.connect(addr1).cancel();
            expect(await ig3Staking.getBalance(addr1.address, "SERIAL1")).to.equal(ethers.parseEther("100"));
            
            // Create new request and withdraw
            await ig3Staking.connect(addr1).request(["SERIAL1"]);
            request = await ig3Staking.withdrawRequests(addr1.address);
            
            // Fast forward time
            await ethers.provider.send("evm_setNextBlockTimestamp", [parseInt(request.timestamp.toString())]);
            await ethers.provider.send("evm_mine", []);
            
            await ig3Staking.connect(addr1).withdraw();
            
            // Check final state
            expect(await ig3Staking.getBalance(addr1.address, "SERIAL1")).to.equal(0);
            expect(await ig3Staking.getBalance(addr1.address, "SERIAL2")).to.equal(ethers.parseEther("200"));
        });

        it("Should handle request time changes correctly", async () => {
            await ig3Staking.connect(addr1).deposit("TIMETEST", ethers.parseEther("100"));
            
            // Change request time
            await ig3Staking.setRequestTime(1 * 24 * 60 * 60); // 1 day
            
            // Create request with new time
            await ig3Staking.connect(addr1).request(["TIMETEST"]);
            const request = await ig3Staking.withdrawRequests(addr1.address);
            
            const block = await ethers.provider.getBlock('latest');
            const expectedTimestamp = block!.timestamp + (1 * 24 * 60 * 60);
            
            expect(request.timestamp).to.equal(expectedTimestamp);
        });
    });

    describe("View Functions", () => {
        beforeEach(async () => {
            await topsToken.mint(addr1.address, ethers.parseEther("1000"));
            const ig3StakingAddress = await ig3Staking.getAddress();
            await topsToken.connect(addr1).approve(ig3StakingAddress, ethers.parseEther("1000"));
        });

        it("Should return correct balance for existing serial", async () => {
            await ig3Staking.connect(addr1).deposit("TESTSERIAL", ethers.parseEther("500"));
            const balance = await ig3Staking.getBalance(addr1.address, "TESTSERIAL");
            expect(balance).to.equal(ethers.parseEther("500"));
        });

        it("Should return zero balance for non-existent serial", async () => {
            const balance = await ig3Staking.getBalance(addr1.address, "NONEXISTENT");
            expect(balance).to.equal(0);
        });

        it("Should handle special characters in serial", async () => {
            const specialSerial = "TEST-SERIAL_123";
            await ig3Staking.connect(addr1).deposit(specialSerial, ethers.parseEther("100"));
            const balance = await ig3Staking.getBalance(addr1.address, specialSerial);
            expect(balance).to.equal(ethers.parseEther("100"));
        });

        it("Should update balance correctly after multiple deposits", async () => {
            const serial = "MULTIDEPOSIT";
            await ig3Staking.connect(addr1).deposit(serial, ethers.parseEther("200"));
            await ig3Staking.connect(addr1).deposit(serial, ethers.parseEther("300"));
            
            const balance = await ig3Staking.getBalance(addr1.address, serial);
            expect(balance).to.equal(ethers.parseEther("500"));
        });
    });
}); 