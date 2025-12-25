import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedSurvey = await deploy("EncryptedSurvey", {
    from: deployer,
    log: true,
    gasLimit: 8_000_000,
  });

  console.log(`EncryptedSurvey contract: `, deployedSurvey.address);
};
export default func;
func.id = "deploy_encryptedSurvey"; // id required to prevent reexecution
func.tags = ["EncryptedSurvey"];
