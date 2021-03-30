const { expect } = require("chai");
const { ethers, network, deployments, waffle } = require("hardhat");
const { getGasPrice } = require("./helpers/gelatoHelper");
const { utils } = ethers;

const ETH = network.config.ETH;
let owner;
let user;
let receiver;
let ownerAddress;
let userAddress;
let receiverAddress;
let executor;
let executorAddress = network.config.GelatoExecutor;
let autoTopUp;
let gelato;
let gasPrice;

describe("Gelato Auto Top Up Test Suite", function () {
  this.timeout(0);
  before("tests", async () => {
    await deployments.fixture();

    [owner, user, receiver] = await ethers.getSigners();
    userAddress = await user.getAddress();
    ownerAddress = await owner.getAddress();
    receiverAddress = await receiver.getAddress();

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [executorAddress],
    });

    gasPrice = await getGasPrice();

    executor = await ethers.provider.getSigner(executorAddress);

    gelato = await ethers.getContractAt("IGelato", network.config.Gelato);

    autoTopUp = await ethers.getContractAt(
      "AutoTopUp",
      (await deployments.get("AutoTopUp")).address
    );
  });

  it("Admin can deposit funds", async () => {
    const deposit = utils.parseEther("60");

    // Encode Task
    const preBalance = await waffle.provider.getBalance(autoTopUp.address);
    await owner.sendTransaction({
      value: deposit,
      to: autoTopUp.address,
    });
    const postBalance = await waffle.provider.getBalance(autoTopUp.address);

    expect(postBalance.sub(preBalance)).to.be.eq(deposit);
  });

  it("Everyone can deposit funds", async () => {
    const deposit = utils.parseEther("1");

    await expect(
      user.sendTransaction({
        value: deposit,
        to: autoTopUp.address,
      })
    ).to.emit(autoTopUp, "LogFundsDeposited");
  });

  it("Only owner can withdraw funds", async () => {
    const amount = utils.parseEther("10");

    const preBalance = await waffle.provider.getBalance(ownerAddress);
    const txReceipt = await autoTopUp
      .connect(owner)
      .withdraw(amount, ownerAddress, {
        gasPrice: gasPrice,
      });
    const { gasUsed } = await txReceipt.wait();
    const postBalance = await waffle.provider.getBalance(ownerAddress);
    expect(postBalance.sub(preBalance).add(gasUsed.mul(gasPrice))).to.be.eq(
      amount
    );

    await expect(autoTopUp.connect(user).withdraw(amount, userAddress)).to.be
      .reverted;
  });

  it("Only owner should be able to stat an auto pay up", async () => {
    const amount = utils.parseEther("10");
    const balanceThreshold = utils.parseEther("10");

    await expect(
      autoTopUp
        .connect(user)
        .startAutoPay(receiverAddress, amount, balanceThreshold)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      autoTopUp
        .connect(owner)
        .startAutoPay(receiverAddress, amount, balanceThreshold)
    ).to.emit(autoTopUp, "LogTaskSubmitted");
  });

  it("Owner should not be able to schedule 2 auto top ups for the same receiver", async () => {
    const amount = utils.parseEther("10");
    const balanceThreshold = utils.parseEther("10");

    await expect(
      autoTopUp
        .connect(owner)
        .startAutoPay(receiverAddress, amount, balanceThreshold)
    ).to.be.revertedWith("AutoTopUp: startAutoPay: Receiver already assigned");
  });

  it("Owner should be able to stop existing auto top ups", async () => {
    await expect(autoTopUp.connect(owner).stopAutoPay(receiverAddress)).to.emit(
      autoTopUp,
      "LogTaskCancelled"
    );

    // Owner should not be able to cancel again
    await expect(
      autoTopUp.connect(owner).stopAutoPay(receiverAddress)
    ).to.be.revertedWith("AutoTopUp: stopAutoPay: Invalid Autopay");
  });

  it("gelato should only be able to execute auto topup if balance balanceThreshold is met", async () => {
    const amount = utils.parseEther("10");
    const balanceThreshold = utils.parseEther("10");

    // Submit AutoPay task
    await expect(
      autoTopUp
        .connect(owner)
        .startAutoPay(receiverAddress, amount, balanceThreshold)
    ).to.emit(autoTopUp, "LogTaskSubmitted");

    const dummyPayload = autoTopUp.interface.encodeFunctionData("exec", [
      receiverAddress,
      amount,
      balanceThreshold,
      1,
    ]);

    await expect(
      gelato.connect(executor).exec(autoTopUp.address, dummyPayload, ETH)
    ).to.be.revertedWith(
      "ExecFacet.exec:AutoTopUp: exec: Balance not below threshold"
    );

    const wrongAmountPayload = autoTopUp.interface.encodeFunctionData("exec", [
      receiverAddress,
      500000000,
      balanceThreshold,
      1,
    ]);

    await expect(
      gelato.connect(executor).exec(autoTopUp.address, wrongAmountPayload, ETH)
    ).to.be.revertedWith("ExecFacet.exec:AutoTopUp: exec: Hash invalid");

    const preBalance = await waffle.provider.getBalance(receiverAddress);

    expect(preBalance).to.be.gt(amount);

    const withdrawThatTriggersExec = preBalance.sub(amount);

    const txReceipt = await receiver.sendTransaction({
      value: withdrawThatTriggersExec,
      to: userAddress,
      gasPrice: gasPrice,
    });
    const { gasUsed } = await txReceipt.wait();

    const txCosts = gasUsed.mul(gasPrice);

    const [fee] = await gelato
      .connect(executor)
      .callStatic.estimateExecGasDebit(autoTopUp.address, dummyPayload, ETH, {
        gasPrice: gasPrice,
      });

    // console.log(`Fee: ${ethers.utils.formatEther(fee)}`);

    const payload = autoTopUp.interface.encodeFunctionData("exec", [
      receiverAddress,
      amount,
      balanceThreshold,
      fee,
    ]);

    await expect(
      gelato.connect(executor).exec(autoTopUp.address, payload, ETH, {
        gasPrice: gasPrice,
      })
    ).to.emit(gelato, "LogExecSuccess");

    const postBalance = await waffle.provider.getBalance(receiverAddress);
    expect(postBalance).to.be.eq(
      preBalance.sub(withdrawThatTriggersExec).add(amount).sub(txCosts)
    );
  });

  it("Receiver should be querieable off-chain", async () => {
    const currentReceivers = await autoTopUp.getReceivers();

    expect(currentReceivers[0]).to.be.eq(receiverAddress);
  });
});
