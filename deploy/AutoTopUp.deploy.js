const { sleep } = require("@gelatonetwork/core");

module.exports = async (hre) => {
  /*if (hre.network.name=='ropsten') {
      return   // dumb hack to deploy after oracle aggregator
  }*/
  if (hre.network.name === "mainnet") {
    console.log("\n\n Deploying GelatoDCA to mainnet. Hit ctrl + c to abort");
    console.log("❗ AutoTopUp DEPLOYMENT: VERIFY");
    await sleep(10000);
  }
  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  await deploy("AutoTopUp", {
    from: deployer,
    args: [hre.network.config.Gelato],
    gasPrice: hre.ethers.utils.parseUnits("10", "gwei"),
    gasLimit: 5000000,
  });
};

module.exports.tags = ["GelatoDCA"];