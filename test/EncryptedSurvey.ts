import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { EncryptedSurvey, EncryptedSurvey__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedSurvey")) as EncryptedSurvey__factory;
  const survey = (await factory.deploy()) as EncryptedSurvey;
  const surveyAddress = await survey.getAddress();

  return { survey, surveyAddress };
}

describe("EncryptedSurvey", function () {
  let signers: Signers;
  let survey: EncryptedSurvey;
  let surveyAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ survey, surveyAddress } = await deployFixture());
  });

  it("exposes five configured questions and option counts", async function () {
    const total = await survey.getQuestionCount();
    expect(total).to.eq(5);

    const firstQuestion = await survey.getQuestion(0);
    expect(firstQuestion[0]).to.contain("Zama");
    expect(firstQuestion[1].length).to.eq(4);

    const optionCount = await survey.getOptionCount(4);
    expect(optionCount).to.eq(3);
  });

  it("records an encrypted vote and updates the matching option only", async function () {
    const encryptedChoice = await fhevm
      .createEncryptedInput(surveyAddress, signers.alice.address)
      .add8(1)
      .encrypt();

    const tx = await survey
      .connect(signers.alice)
      .submitAnswer(0, encryptedChoice.handles[0], encryptedChoice.inputProof);
    await tx.wait();

    const revealTx = await survey.connect(signers.alice).requestPublicResults(0);
    await revealTx.wait();

    const encryptedCounts = await survey.getEncryptedCounts(0);
    expect(encryptedCounts.length).to.eq(4);

    const clearCounts: bigint[] = [];
    for (const count of encryptedCounts) {
      const clear = await fhevm.publicDecryptEuint(FhevmType.euint32, count);
      clearCounts.push(clear);
    }

    expect(clearCounts[0]).to.eq(0);
    expect(clearCounts[1]).to.eq(1);
    expect(clearCounts[2]).to.eq(0);
    expect(clearCounts[3]).to.eq(0);
  });

  it("makes results publicly decryptable when requested", async function () {
    const encryptedChoice = await fhevm
      .createEncryptedInput(surveyAddress, signers.alice.address)
      .add8(2)
      .encrypt();

    const tx = await survey
      .connect(signers.alice)
      .submitAnswer(1, encryptedChoice.handles[0], encryptedChoice.inputProof);
    await tx.wait();

    const revealTx = await survey.connect(signers.bob).requestPublicResults(1);
    await revealTx.wait();
    await ethers.provider.send("evm_mine", []);

    const encryptedCounts = await survey.getEncryptedCounts(1);
    const clearCountsForBob: bigint[] = [];
    for (const count of encryptedCounts) {
      const clear = await fhevm.publicDecryptEuint(FhevmType.euint32, count);
      clearCountsForBob.push(clear);
    }

    expect(clearCountsForBob[0]).to.eq(0);
    expect(clearCountsForBob[1]).to.eq(0);
    expect(clearCountsForBob[2]).to.eq(1);
    expect(clearCountsForBob[3]).to.eq(0);
  });
});
