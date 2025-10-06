import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_UNAUTHORIZED = 1000;
const ERR_NOT_OPEN = 1001;
const ERR_INSUFFICIENT_VOTE = 1002;
const ERR_INVALID_TITLE = 1003;
const ERR_INVALID_DESCRIPTION = 1004;
const ERR_INVALID_LOAN_ID = 1005;
const ERR_PROPOSAL_EXISTS = 1006;
const ERR_PROPOSAL_NOT_FOUND = 1007;
const ERR_ALREADY_VOTED = 1008;
const ERR_PROPOSAL_EXPIRED = 1009;
const ERR_INSUFFICIENT_QUORUM = 1010;
const ERR_ALREADY_EXECUTED = 1011;
const ERR_INVALID_QUORUM = 1012;
const ERR_INVALID_DURATION = 1013;
const ERR_INVALID_TOKEN_CONTRACT = 1014;
const ERR_INVALID_VOTE_AMOUNT = 1015;
const ERR_INSUFFICIENT_BALANCE = 1016;
const ERR_INVALID_START_HEIGHT = 1017;
const ERR_INVALID_END_HEIGHT = 1018;
const ERR_INVALID_EXECUTOR = 1019;

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; value: number };
type Result<T> = Ok<T> | Err;

interface Proposal {
  title: string;
  description: string;
  loanId: number | null;
  proposer: string;
  startHeight: number;
  endHeight: number;
  yesVotes: number;
  noVotes: number;
  executed: boolean;
  executor: string | null;
}

interface Vote {
  votedYes: boolean;
  amount: number;
}

class DAOMock {
  state: {
    proposalCount: number;
    quorumPercent: number;
    proposalDuration: number;
    tokenContract: string;
    totalSupply: number;
    proposals: Map<number, Proposal>;
    votes: Map<string, Vote>;
    proposalIndexByTitle: Map<string, number>;
    balances: Map<string, number>;
  } = {
    proposalCount: 0,
    quorumPercent: 50,
    proposalDuration: 144,
    tokenContract: "SP000000000000000000002Q6VF78",
    totalSupply: 1000,
    proposals: new Map(),
    votes: new Map(),
    proposalIndexByTitle: new Map(),
    balances: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  events: Array<{ event: string; [key: string]: any }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      proposalCount: 0,
      quorumPercent: 50,
      proposalDuration: 144,
      tokenContract: "SP000000000000000000002Q6VF78",
      totalSupply: 1000,
      proposals: new Map(),
      votes: new Map(),
      proposalIndexByTitle: new Map(),
      balances: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.events = [];
    this.state.balances.set("ST1TEST", 1000);
  }

  getProposal(id: number): Result<Proposal | null> {
    return { ok: true, value: this.state.proposals.get(id) || null };
  }

  getVote(proposalId: number, voter: string): Result<Vote | null> {
    const key = `${proposalId}-${voter}`;
    return { ok: true, value: this.state.votes.get(key) || null };
  }

  getQuorumPercent(): Result<number> {
    return { ok: true, value: this.state.quorumPercent };
  }

  getProposalDuration(): Result<number> {
    return { ok: true, value: this.state.proposalDuration };
  }

  getTokenContract(): Result<string> {
    return { ok: true, value: this.state.tokenContract };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getProposalCount(): Result<number> {
    return { ok: true, value: this.state.proposalCount };
  }

  hasVoted(proposalId: number, voter: string): Result<boolean> {
    const key = `${proposalId}-${voter}`;
    return { ok: true, value: this.state.votes.has(key) };
  }

  getTotalVotes(id: number): Result<number> {
    const prop = this.state.proposals.get(id);
    if (!prop) return { ok: true, value: 0 };
    return { ok: true, value: prop.yesVotes + prop.noVotes };
  }

  setQuorumPercent(newPercent: number): Result<boolean> {
    if (this.caller !== this.state.tokenContract) return { ok: false, value: ERR_UNAUTHORIZED };
    if (newPercent <= 0 || newPercent > 100) return { ok: false, value: ERR_INVALID_QUORUM };
    this.state.quorumPercent = newPercent;
    return { ok: true, value: true };
  }

  setProposalDuration(newDur: number): Result<boolean> {
    if (this.caller !== this.state.tokenContract) return { ok: false, value: ERR_UNAUTHORIZED };
    if (newDur <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    this.state.proposalDuration = newDur;
    return { ok: true, value: true };
  }

  setTokenContract(newContract: string): Result<boolean> {
    if (this.caller !== this.state.tokenContract) return { ok: false, value: ERR_UNAUTHORIZED };
    if (newContract === this.caller) return { ok: false, value: ERR_INVALID_TOKEN_CONTRACT };
    this.state.tokenContract = newContract;
    return { ok: true, value: true };
  }

  setTotalSupply(newSupply: number): Result<boolean> {
    if (this.caller !== this.state.tokenContract) return { ok: false, value: ERR_UNAUTHORIZED };
    if (newSupply <= 0) return { ok: false, value: ERR_INVALID_VOTE_AMOUNT };
    this.state.totalSupply = newSupply;
    return { ok: true, value: true };
  }

  proposeLoan(
    title: string,
    description: string,
    loanId: number | null,
    executor: string | null
  ): Result<number> {
    if (!title || title.length > 128) return { ok: false, value: ERR_INVALID_TITLE };
    if (!description || description.length > 512) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (loanId !== null && loanId <= 0) return { ok: false, value: ERR_INVALID_LOAN_ID };
    const start = this.blockHeight;
    const end = this.blockHeight + this.state.proposalDuration;
    if (start < this.blockHeight) return { ok: false, value: ERR_INVALID_START_HEIGHT };
    if (end <= start) return { ok: false, value: ERR_INVALID_END_HEIGHT };
    if (executor !== null && executor === this.caller) return { ok: false, value: ERR_INVALID_EXECUTOR };
    if (this.state.proposalIndexByTitle.has(title)) return { ok: false, value: ERR_PROPOSAL_EXISTS };
    const newId = this.state.proposalCount;
    const proposal: Proposal = {
      title,
      description,
      loanId,
      proposer: this.caller,
      startHeight: start,
      endHeight: end,
      yesVotes: 0,
      noVotes: 0,
      executed: false,
      executor,
    };
    this.state.proposals.set(newId, proposal);
    this.state.proposalIndexByTitle.set(title, newId);
    this.state.proposalCount++;
    this.events.push({ event: "proposal-created", id: newId, title });
    return { ok: true, value: newId };
  }

  vote(proposalId: number, voteYes: boolean, amount: number): Result<boolean> {
    const prop = this.state.proposals.get(proposalId);
    if (!prop) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight > prop.endHeight) return { ok: false, value: ERR_PROPOSAL_EXPIRED };
    const key = `${proposalId}-${this.caller}`;
    if (this.state.votes.has(key)) return { ok: false, value: ERR_ALREADY_VOTED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_VOTE_AMOUNT };
    const balance = this.state.balances.get(this.caller) || 0;
    if (amount > balance) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.state.votes.set(key, { votedYes: voteYes, amount });
    if (voteYes) {
      prop.yesVotes += amount;
    } else {
      prop.noVotes += amount;
    }
    this.state.proposals.set(proposalId, prop);
    this.events.push({ event: "vote-cast", proposalId, voter: this.caller, yes: voteYes, amount });
    return { ok: true, value: true };
  }

  executeProposal(proposalId: number): Result<boolean> {
    const prop = this.state.proposals.get(proposalId);
    if (!prop) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.blockHeight <= prop.endHeight) return { ok: false, value: ERR_NOT_OPEN };
    if (prop.executed) return { ok: false, value: ERR_ALREADY_EXECUTED };
    const totalVotes = prop.yesVotes + prop.noVotes;
    const quorumRequired = (this.state.totalSupply * this.state.quorumPercent) / 100;
    if (totalVotes < quorumRequired) return { ok: false, value: ERR_INSUFFICIENT_QUORUM };
    if (prop.yesVotes <= prop.noVotes) return { ok: false, value: ERR_INSUFFICIENT_VOTE };
    if (prop.loanId !== null) {
    }
    prop.executed = true;
    this.state.proposals.set(proposalId, prop);
    this.events.push({ event: "proposal-executed", id: proposalId });
    return { ok: true, value: true };
  }
}

describe("DAOMock", () => {
  let dao: DAOMock;

  beforeEach(() => {
    dao = new DAOMock();
    dao.reset();
  });

  it("creates a proposal successfully", () => {
    const result = dao.proposeLoan("Test Title", "Test Description", 1, null);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposalResult = dao.getProposal(0);
    expect(proposalResult.ok).toBe(true);
    const prop = proposalResult.value as Proposal;
    expect(prop.title).toBe("Test Title");
    expect(prop.description).toBe("Test Description");
    expect(prop.loanId).toBe(1);
    expect(prop.proposer).toBe("ST1TEST");
    expect(prop.startHeight).toBe(0);
    expect(prop.endHeight).toBe(144);
    expect(prop.yesVotes).toBe(0);
    expect(prop.noVotes).toBe(0);
    expect(prop.executed).toBe(false);
    expect(prop.executor).toBe(null);
    expect(dao.events[0].event).toBe("proposal-created");
  });

  it("rejects duplicate proposal title", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    const result = dao.proposeLoan("Test Title", "New Description", null, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_EXISTS);
  });

  it("rejects invalid title", () => {
    const longTitle = "a".repeat(129);
    const result = dao.proposeLoan(longTitle, "Test Description", null, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects invalid description", () => {
    const longDesc = "a".repeat(513);
    const result = dao.proposeLoan("Test Title", longDesc, null, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it("rejects invalid loan id", () => {
    const result = dao.proposeLoan("Test Title", "Test Description", 0, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LOAN_ID);
  });

  it("votes successfully", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    const result = dao.vote(0, true, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposalResult = dao.getProposal(0);
    expect(proposalResult.ok).toBe(true);
    const prop = proposalResult.value as Proposal;
    expect(prop.yesVotes).toBe(500);
    expect(dao.events[1].event).toBe("vote-cast");
  });

  it("rejects vote on expired proposal", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.blockHeight = 145;
    const result = dao.vote(0, true, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_EXPIRED);
  });

  it("rejects double vote", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 500);
    const result = dao.vote(0, false, 300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("rejects insufficient balance for vote", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    const result = dao.vote(0, true, 1500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("executes proposal successfully", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 600);
    dao.blockHeight = 145;
    const result = dao.executeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposalResult = dao.getProposal(0);
    expect(proposalResult.ok).toBe(true);
    const prop = proposalResult.value as Proposal;
    expect(prop.executed).toBe(true);
    expect(dao.events[2].event).toBe("proposal-executed");
  });

  it("rejects execution before end", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 600);
    const result = dao.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_OPEN);
  });

  it("rejects execution without quorum", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 400);
    dao.blockHeight = 145;
    const result = dao.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_QUORUM);
  });

  it("rejects execution if no wins", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, false, 600);
    dao.blockHeight = 145;
    const result = dao.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_VOTE);
  });

  it("rejects already executed proposal", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 600);
    dao.blockHeight = 145;
    dao.executeProposal(0);
    const result = dao.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_EXECUTED);
  });

  it("sets quorum percent successfully", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setQuorumPercent(60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(dao.state.quorumPercent).toBe(60);
  });

  it("rejects unauthorized quorum set", () => {
    const result = dao.setQuorumPercent(60);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });

  it("rejects invalid quorum percent", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setQuorumPercent(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUORUM);
  });

  it("sets proposal duration successfully", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setProposalDuration(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(dao.state.proposalDuration).toBe(200);
  });

  it("rejects invalid proposal duration", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setProposalDuration(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DURATION);
  });

  it("sets token contract successfully", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setTokenContract("ST2NEW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(dao.state.tokenContract).toBe("ST2NEW");
  });

  it("rejects invalid token contract", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setTokenContract(dao.caller);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TOKEN_CONTRACT);
  });

  it("sets total supply successfully", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setTotalSupply(2000000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(dao.state.totalSupply).toBe(2000000);
  });

  it("rejects invalid total supply", () => {
    dao.caller = dao.state.tokenContract;
    const result = dao.setTotalSupply(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTE_AMOUNT);
  });

  it("gets total votes correctly", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 300);
    dao.caller = "ST2OTHER";
    dao.state.balances.set("ST2OTHER", 400);
    dao.vote(0, false, 400);
    const result = dao.getTotalVotes(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(700);
  });

  it("checks has voted correctly", () => {
    dao.proposeLoan("Test Title", "Test Description", null, null);
    dao.vote(0, true, 500);
    const result = dao.hasVoted(0, "ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = dao.hasVoted(0, "ST2OTHER");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses Clarity types correctly", () => {
    const count = uintCV(10);
    expect(count.value).toEqual(BigInt(10));
  });
});