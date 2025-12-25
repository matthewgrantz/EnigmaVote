import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the EncryptedSurvey address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;

  const deployment = await deployments.get("EncryptedSurvey");
  console.log("EncryptedSurvey address is " + deployment.address);
});

task("task:submit-answer", "Submit an encrypted option for a question")
  .addParam("question", "Question id (0-based)")
  .addParam("option", "Option index (0-based)")
  .addOptionalParam("address", "Optionally specify the EncryptedSurvey contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const questionId = parseInt(taskArguments.question);
    const optionIndex = parseInt(taskArguments.option);
    if (!Number.isInteger(questionId) || !Number.isInteger(optionIndex)) {
      throw new Error("question and option must be integers");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EncryptedSurvey");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("EncryptedSurvey", deployment.address);

    const encrypted = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add8(optionIndex)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .submitAnswer(questionId, encrypted.handles[0], encrypted.inputProof);

    console.log(`Submitting question=${questionId} option=${optionIndex} tx=${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:reveal-question", "Make a question's counts publicly decryptable")
  .addParam("question", "Question id (0-based)")
  .addOptionalParam("address", "Optionally specify the EncryptedSurvey contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const questionId = parseInt(taskArguments.question);
    if (!Number.isInteger(questionId)) {
      throw new Error("question must be an integer");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EncryptedSurvey");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("EncryptedSurvey", deployment.address);

    const tx = await contract.connect(signer).requestPublicResults(questionId);
    console.log(`Requesting public results for question ${questionId}, tx=${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:decrypt-counts", "Decrypt counts for a question with your signer (requires ACL or public results)")
  .addParam("question", "Question id (0-based)")
  .addOptionalParam("address", "Optionally specify the EncryptedSurvey contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const questionId = parseInt(taskArguments.question);
    if (!Number.isInteger(questionId)) {
      throw new Error("question must be an integer");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("EncryptedSurvey");

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("EncryptedSurvey", deployment.address);

    const encryptedCounts = await contract.getEncryptedCounts(questionId);
    if (!encryptedCounts.length) {
      console.log(`Question ${questionId} has no options configured`);
      return;
    }

    const clearCounts = [];
    for (const encrypted of encryptedCounts) {
      const clearValue = await fhevm.userDecryptEuint(FhevmType.euint32, encrypted, deployment.address, signer);
      clearCounts.push(clearValue);
    }

    console.log(`Question ${questionId} counts: ${clearCounts.join(", ")}`);
  });
