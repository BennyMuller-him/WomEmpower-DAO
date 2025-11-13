// tests/treasury.test.ts
import { describe, it, expect, beforeEach } from "vitest";

interface TreasuryState {
  treasuryBalance: bigint;
  totalDeposited: bigint;
  totalDisbursed: bigint;
  totalRepaid: bigint;
  yieldAccrued: bigint;
  lastYieldBlock: bigint;
  yieldRate: bigint;
  admin: string;
  loanContract: string | null;
  repaymentContract: string | null;
  initialized: boolean;
  locked: boolean;
  depositors: Map<string, { amount: bigint; block: bigint }>;
  yieldClaims: Map<string, { claimed: bigint; lastBlock: bigint }>;
}

class TreasuryMock {
  state: TreasuryState;
  blockHeight: bigint;
  caller: string;
  stxTransfers: Array<{ from: string; to: string; amount: bigint }>;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      treasuryBalance: 0n,
      totalDeposited: 0n,
      totalDisbursed: 0n,
      totalRepaid: 0n,
      yieldAccrued: 0n,
      lastYieldBlock: 0n,
      yieldRate: 500n,
      admin: "",
      loanContract: null,
      repaymentContract: null,
      initialized: false,
      locked: false,
      depositors: new Map(),
      yieldClaims: new Map(),
    };
    this.blockHeight = 100n;
    this.caller = "ST1USER";
    this.stxTransfers = [];
  }

  advanceBlocks(blocks: bigint) {
    this.blockHeight += blocks;
  }

  setCaller(caller: string) {
    this.caller = caller;
  }

  private assertInitialized(): boolean {
    return this.state.initialized;
  }

  private assertNotLocked(): boolean {
    return !this.state.locked;
  }

  private validateAmount(amount: bigint): boolean {
    return amount > 0n;
  }

  initializeTreasury(
    admin: string,
    loanContract: string,
    repaymentContract: string,
    yieldRate: bigint
  ): { success: boolean; value?: any; error?: number } {
    if (this.state.initialized) return { success: false, error: 108 };
    if (admin === "SP000000000000000000002Q6VF78") return { success: false, error: 107 };
    if (loanContract === "SP000000000000000000002Q6VF78") return { success: false, error: 107 };
    if (repaymentContract === "SP000000000000000000002Q6VF78") return { success: false, error: 107 };
    if (yieldRate < 100n || yieldRate > 2000n) return { success: false, error: 110 };

    this.state.admin = admin;
    this.state.loanContract = loanContract;
    this.state.repaymentContract = repaymentContract;
    this.state.yieldRate = yieldRate;
    this.state.lastYieldBlock = this.blockHeight;
    this.state.initialized = true;
    return { success: true, value: true };
  }

  deposit(amount: bigint): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (!this.assertNotLocked()) return { success: false, error: 105 };
    if (!this.validateAmount(amount)) return { success: false, error: 102 };

    this.stxTransfers.push({ from: this.caller, to: "treasury", amount });
    this.state.treasuryBalance += amount;
    this.state.totalDeposited += amount;

    const existing = this.state.depositors.get(this.caller);
    if (existing) {
      this.state.depositors.set(this.caller, {
        amount: existing.amount + amount,
        block: this.blockHeight,
      });
    } else {
      this.state.depositors.set(this.caller, { amount, block: this.blockHeight });
    }

    return { success: true, value: true };
  }

  withdraw(amount: bigint): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (!this.assertNotLocked()) return { success: false, error: 105 };
    if (!this.validateAmount(amount)) return { success: false, error: 102 };

    const depositor = this.state.depositors.get(this.caller);
    if (!depositor || depositor.amount < amount) return { success: false, error: 101 };
    if (this.state.treasuryBalance < amount) return { success: false, error: 101 };

    this.state.treasuryBalance -= amount;
    this.state.depositors.set(this.caller, {
      amount: depositor.amount - amount,
      block: this.blockHeight,
    });
    this.stxTransfers.push({ from: "treasury", to: this.caller, amount });

    return { success: true, value: true };
  }

  disburseLoan(to: string, amount: bigint): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.loanContract) return { success: false, error: 100 };
    if (!this.validateAmount(amount)) return { success: false, error: 102 };
    if (this.state.treasuryBalance < amount) return { success: false, error: 101 };

    this.state.treasuryBalance -= amount;
    this.state.totalDisbursed += amount;
    this.stxTransfers.push({ from: "treasury", to: to, amount });

    return { success: true, value: true };
  }

  receiveRepayment(from: string, principal: bigint, interest: bigint): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.repaymentContract) return { success: false, error: 100 };
    if (!this.validateAmount(principal)) return { success: false, error: 102 };

    this.stxTransfers.push({ from, to: "treasury", amount: principal });
    this.stxTransfers.push({ from, to: "treasury", amount: interest });

    this.state.treasuryBalance += principal + interest;
    this.state.totalRepaid += principal;
    this.state.yieldAccrued += interest;

    return { success: true, value: true };
  }

  accrueYield(): { success: boolean; value: bigint; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };

    const blocksPassed = this.blockHeight - this.state.lastYieldBlock;
    if (blocksPassed <= 0n) return { success: true, value: 0n };

    const yieldEarned =
      (this.state.treasuryBalance * this.state.yieldRate * blocksPassed) /
      (10000n * 525600n);

    this.state.yieldAccrued += yieldEarned;
    this.state.lastYieldBlock = this.blockHeight;

    return { success: true, value: yieldEarned };
  }

  claimYield(): { success: boolean; value: bigint; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };

    const result = this.accrueYield();
    if (!result.success) return result;

    const claimInfo = this.state.yieldClaims.get(this.caller) || { claimed: 0n, lastBlock: 0n };
    const userDeposit = this.state.depositors.get(this.caller);
    if (!userDeposit || userDeposit.amount === 0n) return { success: true, value: 0n };

    const userShare =
      this.state.treasuryBalance > 0n
        ? (userDeposit.amount * this.state.yieldAccrued) / this.state.treasuryBalance
        : 0n;

    const unclaimed = userShare - claimInfo.claimed;
    if (unclaimed <= 0n) return { success: true, value: 0n };

    this.state.yieldClaims.set(this.caller, {
      claimed: claimInfo.claimed + unclaimed,
      lastBlock: this.blockHeight,
    });
    this.stxTransfers.push({ from: "treasury", to: this.caller, amount: unclaimed });

    return { success: true, value: unclaimed };
  }

  setYieldRate(newRate: bigint): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.admin) return { success: false, error: 100 };
    if (newRate < 100n || newRate > 2000n) return { success: false, error: 110 };

    const accrue = this.accrueYield();
    if (!accrue.success) return accrue;

    this.state.yieldRate = newRate;
    return { success: true, value: true };
  }

  lockTreasury(): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.admin) return { success: false, error: 100 };
    this.state.locked = true;
    return { success: true, value: true };
  }

  unlockTreasury(): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.admin) return { success: false, error: 100 };
    this.state.locked = false;
    return { success: true, value: true };
  }

  transferAdmin(newAdmin: string): { success: boolean; value?: any; error?: number } {
    if (!this.assertInitialized()) return { success: false, error: 109 };
    if (this.caller !== this.state.admin) return { success: false, error: 100 };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { success: false, error: 107 };
    this.state.admin = newAdmin;
    return { success: true, value: true };
  }
}

describe("treasury.clar - WomEmpower Treasury Core", () => {
  let mock: TreasuryMock;

  beforeEach(() => {
    mock = new TreasuryMock();
    mock.reset();
  });

  describe("Initialization", () => {
    it("should initialize with valid parameters", () => {
      const result = mock.initializeTreasury(
        "ST1ADMIN",
        "ST1LOAN",
        "ST1REPAY",
        750n
      );
      expect(result.success).toBe(true);
      expect(mock.state.initialized).toBe(true);
      expect(mock.state.admin).toBe("ST1ADMIN");
      expect(mock.state.yieldRate).toBe(750n);
    });

    it("should reject reinitialization", () => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
      const result = mock.initializeTreasury("ST2ADMIN", "ST2LOAN", "ST2REPAY", 600n);
      expect(result.success).toBe(false);
      expect(result.error).toBe(108);
    });

    it("should reject zero address admin", () => {
      const result = mock.initializeTreasury(
        "SP000000000000000000002Q6VF78",
        "ST1LOAN",
        "ST1REPAY",
        500n
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe(107);
    });

    it("should reject invalid yield rate", () => {
      const result = mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 50n);
      expect(result.success).toBe(false);
      expect(result.error).toBe(110);
    });
  });

  describe("Deposits", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
    });

    it("should accept valid deposit", () => {
      const result = mock.deposit(1000n);
      expect(result.success).toBe(true);
      expect(mock.state.treasuryBalance).toBe(1000n);
      expect(mock.state.totalDeposited).toBe(1000n);
      const depositor = mock.state.depositors.get("ST1USER");
      expect(depositor?.amount).toBe(1000n);
    });

    it("should accumulate multiple deposits", () => {
      mock.deposit(500n);
      mock.setCaller("ST2USER");
      mock.deposit(300n);
      expect(mock.state.treasuryBalance).toBe(800n);
      expect(mock.state.depositors.get("ST1USER")?.amount).toBe(500n);
      expect(mock.state.depositors.get("ST2USER")?.amount).toBe(300n);
    });
  });

  describe("Withdrawals", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
      mock.deposit(1000n);
    });

    it("should allow full withdrawal", () => {
      const result = mock.withdraw(1000n);
      expect(result.success).toBe(true);
      expect(mock.state.treasuryBalance).toBe(0n);
      expect(mock.state.depositors.get("ST1USER")?.amount).toBe(0n);
    });

    it("should allow partial withdrawal", () => {
      const result = mock.withdraw(400n);
      expect(result.success).toBe(true);
      expect(mock.state.treasuryBalance).toBe(600n);
      expect(mock.state.depositors.get("ST1USER")?.amount).toBe(600n);
    });

    it("should reject insufficient balance", () => {
      const result = mock.withdraw(2000n);
      expect(result.success).toBe(false);
      expect(result.error).toBe(101);
    });
  });

  describe("Loan Disbursement", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
      mock.deposit(5000n);
      mock.setCaller("ST1LOAN");
    });

    it("should disburse loan from authorized contract", () => {
      const result = mock.disburseLoan("ST1BORROWER", 2000n);
      expect(result.success).toBe(true);
      expect(mock.state.treasuryBalance).toBe(3000n);
      expect(mock.state.totalDisbursed).toBe(2000n);
    });

    it("should reject from unauthorized caller", () => {
      mock.setCaller("ST1HACKER");
      const result = mock.disburseLoan("ST1VICTIM", 1000n);
      expect(result.success).toBe(false);
      expect(result.error).toBe(100);
    });
  });

  describe("Repayments", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
      mock.setCaller("ST1REPAY");
    });

    it("should accept repayment with interest", () => {
      const result = mock.receiveRepayment("ST1BORROWER", 1000n, 50n);
      expect(result.success).toBe(true);
      expect(mock.state.treasuryBalance).toBe(1050n);
      expect(mock.state.totalRepaid).toBe(1000n);
      expect(mock.state.yieldAccrued).toBe(50n);
    });

    it("should reject from unauthorized contract", () => {
      mock.setCaller("ST1FAKE");
      const result = mock.receiveRepayment("ST1BORROWER", 1000n, 50n);
      expect(result.success).toBe(false);
      expect(result.error).toBe(100);
    });
  });

  describe("Yield Management", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
      mock.deposit(10000n);
      mock.advanceBlocks(5256n);
    });

    it("should accrue yield over time", () => {
      const result = mock.accrueYield();
      expect(result.success).toBe(true);
      expect(result.value).toBeGreaterThan(0n);
      expect(mock.state.yieldAccrued).toBeGreaterThan(0n);
    });

    it("should allow depositor to claim yield", () => {
      mock.accrueYield();
      const claim = mock.claimYield();
      expect(claim.success).toBe(true);
      expect(claim.value).toBeGreaterThan(0n);
    });

    it("should update yield rate by admin", () => {
      mock.setCaller("ST1ADMIN");
      const result = mock.setYieldRate(1000n);
      expect(result.success).toBe(true);
      expect(mock.state.yieldRate).toBe(1000n);
    });
  });

  describe("Admin Controls", () => {
    beforeEach(() => {
      mock.initializeTreasury("ST1ADMIN", "ST1LOAN", "ST1REPAY", 500n);
    });

    it("should lock and unlock treasury", () => {
      mock.setCaller("ST1ADMIN");
      mock.lockTreasury();
      expect(mock.state.locked).toBe(true);
      mock.unlockTreasury();
      expect(mock.state.locked).toBe(false);
    });

    it("should transfer admin", () => {
      mock.setCaller("ST1ADMIN");
      const result = mock.transferAdmin("ST2ADMIN");
      expect(result.success).toBe(true);
      expect(mock.state.admin).toBe("ST2ADMIN");
    });
  });
});