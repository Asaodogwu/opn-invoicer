const { expect }       = require("chai");
const { ethers }       = require("hardhat");
const { time }         = require("@nomicfoundation/hardhat-network-helpers");

describe("OPNInvoicer", function () {
  let contract, owner, creator, payer, other;
  const ONE_OPN  = ethers.parseEther("1");
  const DUE_DAYS = 7;

  beforeEach(async () => {
    [owner, creator, payer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OPNInvoicer");
    contract = await Factory.deploy();
  });

  // ── Deploy ───────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets the deployer as owner", async () => {
      expect(await contract.owner()).to.equal(owner.address);
    });
    it("initialises platform fee at 50 bps (0.5%)", async () => {
      expect(await contract.platformFeeBps()).to.equal(50n);
    });
    it("starts with zero invoices", async () => {
      expect(await contract.totalInvoices()).to.equal(0n);
    });
  });

  // ── Create invoice ───────────────────────────────────────
  describe("createInvoice()", () => {
    it("creates an invoice with correct fields", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS,
        "Web design May 2026", "Kano Digital Co."
      );
      const inv = await contract.getInvoice(1);
      expect(inv.creator).to.equal(creator.address);
      expect(inv.payer).to.equal(payer.address);
      expect(inv.amountWei).to.equal(ONE_OPN);
      expect(inv.status).to.equal(1); // Sent
      expect(inv.clientName).to.equal("Kano Digital Co.");
    });

    it("emits InvoiceCreated event", async () => {
      await expect(
        contract.connect(creator).createInvoice(
          payer.address, ONE_OPN, DUE_DAYS, "Design work", "Client A"
        )
      ).to.emit(contract, "InvoiceCreated")
       .withArgs(1n, creator.address, payer.address, ONE_OPN, anyValue => true);
    });

    it("reverts if payer is zero address", async () => {
      await expect(
        contract.connect(creator).createInvoice(
          ethers.ZeroAddress, ONE_OPN, DUE_DAYS, "desc", "client"
        )
      ).to.be.revertedWith("Invalid payer address");
    });

    it("reverts if creator invoices themselves", async () => {
      await expect(
        contract.connect(creator).createInvoice(
          creator.address, ONE_OPN, DUE_DAYS, "desc", "client"
        )
      ).to.be.revertedWith("Cannot invoice yourself");
    });

    it("reverts if amount is zero", async () => {
      await expect(
        contract.connect(creator).createInvoice(
          payer.address, 0, DUE_DAYS, "desc", "client"
        )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("increments totalInvoices", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
      expect(await contract.totalInvoices()).to.equal(1n);
    });
  });

  // ── Pay invoice ──────────────────────────────────────────
  describe("payInvoice()", () => {
    beforeEach(async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "Design work", "Client A"
      );
    });

    it("transfers net amount to creator and retains fee", async () => {
      const creatorBefore = await ethers.provider.getBalance(creator.address);
      await contract.connect(payer).payInvoice(1, { value: ONE_OPN });
      const creatorAfter = await ethers.provider.getBalance(creator.address);

      const fee    = ONE_OPN * 50n / 10_000n;
      const payout = ONE_OPN - fee;
      expect(creatorAfter - creatorBefore).to.equal(payout);
    });

    it("marks invoice as Paid", async () => {
      await contract.connect(payer).payInvoice(1, { value: ONE_OPN });
      const inv = await contract.getInvoice(1);
      expect(inv.status).to.equal(2); // Paid
    });

    it("emits InvoicePaid event", async () => {
      const fee = ONE_OPN * 50n / 10_000n;
      await expect(
        contract.connect(payer).payInvoice(1, { value: ONE_OPN })
      ).to.emit(contract, "InvoicePaid")
       .withArgs(1n, payer.address, ONE_OPN, fee, anyValue => true);
    });

    it("reverts if wrong amount sent", async () => {
      await expect(
        contract.connect(payer).payInvoice(1, { value: ONE_OPN / 2n })
      ).to.be.revertedWith("Send exact invoice amount");
    });

    it("reverts if non-payer tries to pay", async () => {
      await expect(
        contract.connect(other).payInvoice(1, { value: ONE_OPN })
      ).to.be.revertedWith("Only assigned payer can pay");
    });

    it("reverts if paying a Paid invoice again", async () => {
      await contract.connect(payer).payInvoice(1, { value: ONE_OPN });
      await expect(
        contract.connect(payer).payInvoice(1, { value: ONE_OPN })
      ).to.be.revertedWith("Invoice not payable");
    });
  });

  // ── Cancel ───────────────────────────────────────────────
  describe("cancelInvoice()", () => {
    beforeEach(async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
    });

    it("allows creator to cancel", async () => {
      await contract.connect(creator).cancelInvoice(1);
      expect((await contract.getInvoice(1)).status).to.equal(4); // Cancelled
    });

    it("reverts if non-creator tries to cancel", async () => {
      await expect(
        contract.connect(other).cancelInvoice(1)
      ).to.be.revertedWith("Not invoice creator");
    });

    it("reverts if cancelling a paid invoice", async () => {
      await contract.connect(payer).payInvoice(1, { value: ONE_OPN });
      await expect(
        contract.connect(creator).cancelInvoice(1)
      ).to.be.revertedWith("Cannot cancel a paid invoice");
    });
  });

  // ── Overdue ──────────────────────────────────────────────
  describe("markOverdue()", () => {
    it("marks invoice as overdue after due date", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, 1, "d", "c"
      );
      await time.increase(2 * 24 * 60 * 60); // advance 2 days
      await contract.markOverdue(1);
      expect((await contract.getInvoice(1)).status).to.equal(3); // Overdue
    });

    it("reverts if called before due date", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
      await expect(contract.markOverdue(1)).to.be.revertedWith("Not yet overdue");
    });
  });

  // ── Admin ────────────────────────────────────────────────
  describe("Admin functions", () => {
    it("owner can update fee", async () => {
      await contract.connect(owner).setFee(100); // 1%
      expect(await contract.platformFeeBps()).to.equal(100n);
    });

    it("reverts if fee exceeds 5%", async () => {
      await expect(
        contract.connect(owner).setFee(501)
      ).to.be.revertedWith("Fee cannot exceed 5%");
    });

    it("non-owner cannot update fee", async () => {
      await expect(
        contract.connect(creator).setFee(100)
      ).to.be.revertedWith("Not owner");
    });

    it("owner can withdraw accumulated fees", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
      await contract.connect(payer).payInvoice(1, { value: ONE_OPN });

      const fee = ONE_OPN * 50n / 10_000n;
      expect(await contract.totalPlatformFees()).to.equal(fee);

      const before = await ethers.provider.getBalance(owner.address);
      const tx     = await contract.connect(owner).withdrawFees();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * tx.gasPrice;
      const after  = await ethers.provider.getBalance(owner.address);

      expect(after - before + gasCost).to.equal(fee);
    });
  });

  // ── Query functions ──────────────────────────────────────
  describe("Query functions", () => {
    it("getCreatorInvoices() returns correct IDs", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d2", "c2"
      );
      const ids = await contract.getCreatorInvoices(creator.address);
      expect(ids.map(n => Number(n))).to.deep.equal([1, 2]);
    });

    it("getPaymentAmount() returns correct breakdown", async () => {
      await contract.connect(creator).createInvoice(
        payer.address, ONE_OPN, DUE_DAYS, "d", "c"
      );
      const { total, fee, creatorReceives } = await contract.getPaymentAmount(1);
      const expectedFee = ONE_OPN * 50n / 10_000n;
      expect(total).to.equal(ONE_OPN);
      expect(fee).to.equal(expectedFee);
      expect(creatorReceives).to.equal(ONE_OPN - expectedFee);
    });
  });
});
