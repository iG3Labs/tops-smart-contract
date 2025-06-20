import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TOPS Token", () => {
    let topsToken: any;
    let owner: any;
    let addr1: any;
    let addr2: any;

    before(async () => {
        [owner, addr1, addr2] = await ethers.getSigners();

        const topsTokenFactory = await ethers.getContractFactory("TOPS");
        topsToken = await upgrades.deployProxy(topsTokenFactory, { initializer: "initialize" });
    });

    describe("Basic Token Properties", () => {
        it("Should have correct token name", async () => {
            expect(await topsToken.name()).to.equal("TOPS");
        });

        it("Should have correct token symbol", async () => {
            expect(await topsToken.symbol()).to.equal("TOPS");
        });

        it("Should have correct token decimals", async () => {
            expect(await topsToken.decimals()).to.equal(18);
        });

        it("Should have correct token cap", async () => {
            const cap = await topsToken.cap();
            expect(cap).to.equal(ethers.parseUnits("10000000000", 18));
        });

        it("Should have correct max supply constant", async () => {
            const maxSupply = await topsToken.MAX_SUPPLY();
            expect(maxSupply).to.equal(10000000000n);
        });
    });

    describe("Access Control", () => {
        it("Should set correct admin role", async () => {
            const defaultAdminRole = await topsToken.DEFAULT_ADMIN_ROLE();
            expect(await topsToken.hasRole(defaultAdminRole, owner.address)).to.be.true;
        });

        it("Should grant minter role", async () => {
            const minterRole = await topsToken.MINTER_ROLE();
            await topsToken.grantRole(minterRole, addr1.address);
            expect(await topsToken.hasRole(minterRole, addr1.address)).to.be.true;
        });

        it("Should revoke minter role", async () => {
            const minterRole = await topsToken.MINTER_ROLE();
            await topsToken.revokeRole(minterRole, addr1.address);
            expect(await topsToken.hasRole(minterRole, addr1.address)).to.be.false;
        });

        it("Should fail to mint without minter role", async () => {
            await expect(topsToken.connect(addr1).mint(addr2.address, 1000))
                .to.be.revertedWith(/AccessControl: account .* is missing role .*/);
        });

        it("Should fail to grant role without admin role", async () => {
            const minterRole = await topsToken.MINTER_ROLE();
            await expect(topsToken.connect(addr1).grantRole(minterRole, addr2.address))
                .to.be.revertedWith(/AccessControl: account .* is missing role .*/);
        });
    });

    describe("Minting", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
        });

        it("Should mint TOPS tokens", async () => {
            await topsToken.mint(addr1.address, 1000);
            expect(await topsToken.balanceOf(addr1.address)).to.equal(1000);
        });

        it("Should emit Transfer event when minting", async () => {
            await expect(topsToken.mint(addr1.address, 500))
                .to.emit(topsToken, "Transfer")
                .withArgs(ethers.ZeroAddress, addr1.address, 500);
        });

        it("Should increase total supply when minting", async () => {
            const initialSupply = await topsToken.totalSupply();
            await topsToken.mint(addr1.address, 1000);
            expect(await topsToken.totalSupply()).to.equal(initialSupply + BigInt(1000));
        });

        it("Should not mint beyond max supply", async () => {
            const cap = await topsToken.cap();
            const currentSupply = await topsToken.totalSupply();
            const remainingSupply = cap - currentSupply;
            
            await expect(topsToken.mint(addr1.address, remainingSupply + BigInt(1)))
                .to.be.revertedWith("ERC20Capped: cap exceeded");
        });
    });

    describe("Transfers", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
            await topsToken.mint(addr1.address, 1000);
        });

        it("Should transfer tokens", async () => {
            const initialBalance = await topsToken.balanceOf(addr1.address);
            const initialAddr2Balance = await topsToken.balanceOf(addr2.address);
            
            await topsToken.connect(addr1).transfer(addr2.address, 200);
            
            expect(await topsToken.balanceOf(addr1.address)).to.equal(initialBalance - BigInt(200));
            expect(await topsToken.balanceOf(addr2.address)).to.equal(initialAddr2Balance + BigInt(200));
        });

        it("Should emit Transfer event", async () => {
            await expect(topsToken.connect(addr1).transfer(addr2.address, 200))
                .to.emit(topsToken, "Transfer")
                .withArgs(addr1.address, addr2.address, 200);
        });

        it("Should fail transfer with insufficient balance", async () => {
            const balance = await topsToken.balanceOf(addr1.address);
            await expect(topsToken.connect(addr1).transfer(addr2.address, balance + BigInt(1)))
                .to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("Should fail transfer to zero address", async () => {
            await expect(topsToken.connect(addr1).transfer(ethers.ZeroAddress, 200))
                .to.be.revertedWith("ERC20: transfer to the zero address");
        });
    });

    describe("Approvals and Allowances", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
            await topsToken.mint(addr1.address, 1000);
        });

        it("Should approve spending", async () => {
            await topsToken.connect(addr1).approve(addr2.address, 500);
            expect(await topsToken.allowance(addr1.address, addr2.address)).to.equal(500);
        });

        it("Should emit Approval event", async () => {
            await expect(topsToken.connect(addr1).approve(addr2.address, 500))
                .to.emit(topsToken, "Approval")
                .withArgs(addr1.address, addr2.address, 500);
        });

        it("Should transfer from with allowance", async () => {
            const initialBalance = await topsToken.balanceOf(addr1.address);
            const initialAddr2Balance = await topsToken.balanceOf(addr2.address);
            
            await topsToken.connect(addr1).approve(addr2.address, 500);
            await topsToken.connect(addr2).transferFrom(addr1.address, addr2.address, 300);
            
            expect(await topsToken.balanceOf(addr1.address)).to.equal(initialBalance - BigInt(300));
            expect(await topsToken.balanceOf(addr2.address)).to.equal(initialAddr2Balance + BigInt(300));
            expect(await topsToken.allowance(addr1.address, addr2.address)).to.equal(200);
        });

        it("Should fail transferFrom without allowance", async () => {
            await expect(topsToken.connect(addr2).transferFrom(addr1.address, addr2.address, 300))
                .to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Should fail transferFrom exceeding allowance", async () => {
            await topsToken.connect(addr1).approve(addr2.address, 200);
            await expect(topsToken.connect(addr2).transferFrom(addr1.address, addr2.address, 300))
                .to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("Should handle multiple approvals to same address", async () => {
            await topsToken.connect(addr1).approve(addr2.address, 300);
            await topsToken.connect(addr1).approve(addr2.address, 500);
            
            expect(await topsToken.allowance(addr1.address, addr2.address)).to.equal(500);
        });
    });

    describe("Burning", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
            await topsToken.mint(addr1.address, 1000);
        });

        it("Should burn TOPS tokens", async () => {
            const initialSupply = await topsToken.totalSupply();
            const initialBalance = await topsToken.balanceOf(addr1.address);
            
            await topsToken.connect(addr1).burn(300);

            expect(await topsToken.balanceOf(addr1.address)).to.equal(initialBalance - BigInt(300));
            expect(await topsToken.totalSupply()).to.equal(initialSupply - BigInt(300));
        });

        it("Should emit Transfer event when burning", async () => {
            await expect(topsToken.connect(addr1).burn(300))
                .to.emit(topsToken, "Transfer")
                .withArgs(addr1.address, ethers.ZeroAddress, 300);
        });

        it("Should fail burn with insufficient balance", async () => {
            const balance = await topsToken.balanceOf(addr1.address);
            await expect(topsToken.connect(addr1).burn(balance + BigInt(1)))
                .to.be.revertedWith("ERC20: burn amount exceeds balance");
        });

        it("Should burn from with allowance", async () => {
            const initialBalance = await topsToken.balanceOf(addr1.address);
            
            await topsToken.connect(addr1).approve(addr2.address, 500);
            await topsToken.connect(addr2).burnFrom(addr1.address, 300);

            expect(await topsToken.balanceOf(addr1.address)).to.equal(initialBalance - BigInt(300));
            expect(await topsToken.allowance(addr1.address, addr2.address)).to.equal(200);
        });
    });

    describe("Edge Cases", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
            await topsToken.mint(addr1.address, 1000);
        });

        it("Should handle zero transfers", async () => {
            await expect(topsToken.connect(addr1).transfer(addr2.address, 0))
                .to.emit(topsToken, "Transfer")
                .withArgs(addr1.address, addr2.address, 0);
        });

        it("Should handle self transfers", async () => {
            const initialBalance = await topsToken.balanceOf(addr1.address);
            
            await topsToken.connect(addr1).transfer(addr1.address, 500);
            expect(await topsToken.balanceOf(addr1.address)).to.equal(initialBalance);
        });
    });

    describe("Max Supply Tests", () => {
        beforeEach(async () => {
            await topsToken.grantRole(await topsToken.MINTER_ROLE(), owner.address);
        });

        it("Should mint exactly to max supply", async () => {
            const cap = await topsToken.cap();
            const currentSupply = await topsToken.totalSupply();
            const remainingSupply = cap - currentSupply;
            
            await topsToken.mint(addr1.address, remainingSupply);
            expect(await topsToken.totalSupply()).to.equal(cap);
        });
    });
});