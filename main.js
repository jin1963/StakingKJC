let web3;
let stakingContract;
let kjcToken;
let userAddress;

window.addEventListener("load", async () => {
  if (window.ethereum) {
    web3 = new Web3(window.ethereum);
    await connectWallet();
  } else {
    alert("Please install MetaMask or Bitget Wallet to use this DApp.");
  }
});

document.getElementById("connectWallet").onclick = async () => {
  await connectWallet();
};

async function connectWallet() {
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    userAddress = accounts[0];
    const networkId = await web3.eth.getChainId();
    if (networkId !== chainId) {
      alert("Please switch to BNB Smart Chain.");
      return;
    }

    document.getElementById("status").innerText = `✅ Connected: ${userAddress}`;

    stakingContract = new web3.eth.Contract(stakingABI, contractAddress);
    kjcToken = new web3.eth.Contract(erc20ABI, tokenAddress);

    loadStakes();
  } catch (err) {
    console.error(err);
    alert("Failed to connect wallet.");
  }
}

document.getElementById("stakeButton").onclick = async () => {
  const amount = document.getElementById("stakeAmount").value;
  const tierDays = document.getElementById("stakeTier").value;
  if (!amount || amount <= 0) return alert("Enter amount to stake");

  const decimals = await kjcToken.methods.decimals().call();
  const amountInWei = web3.utils.toBN(amount * (10 ** decimals));

  try {
    await kjcToken.methods.approve(contractAddress, amountInWei).send({ from: userAddress });
    await stakingContract.methods.stake(amountInWei, tierDays).send({ from: userAddress });
    alert("Stake successful!");
    loadStakes();
  } catch (err) {
    console.error(err);
    alert("Staking failed.");
  }
};

async function loadStakes() {
  const container = document.getElementById("stakesContainer");
  container.innerHTML = "Loading...";
  try {
    const stakeCount = await stakingContract.methods.getStakeCount(userAddress).call();
    container.innerHTML = "";

    for (let i = 0; i < stakeCount; i++) {
      const stake = await stakingContract.methods.stakes(userAddress, i).call();
      const now = Math.floor(Date.now() / 1000);

      const reward = await stakingContract.methods.pendingReward(userAddress, i).call();
      const canClaim = now - stake.lastClaimTime >= 15 * 24 * 60 * 60;
      const canUnstake = now >= (parseInt(stake.startTime) + parseInt(stake.lockPeriod));

      const amount = web3.utils.fromWei(stake.amount, "ether");
      const rewardFormatted = web3.utils.fromWei(reward, "ether");

      const stakeItem = document.createElement("div");
      stakeItem.className = "stake-item";
      stakeItem.innerHTML = `
        <p><strong>Stake #${i + 1}</strong></p>
        <p>Amount: ${amount} KJC</p>
        <p>Locked for: ${stake.lockPeriod / (24 * 60 * 60)} days</p>
        <p>Start: ${new Date(stake.startTime * 1000).toLocaleString()}</p>
        <p>Next claim: ${new Date((parseInt(stake.lastClaimTime) + 15 * 24 * 60 * 60) * 1000).toLocaleString()}</p>
        <p>Reward: ${rewardFormatted} KJC</p>
      `;

      if (reward > 0 && canClaim && !stake.claimed) {
        const claimBtn = document.createElement("button");
        claimBtn.innerText = "Claim";
        claimBtn.onclick = async () => {
          try {
            await stakingContract.methods.claim(i).send({ from: userAddress });
            alert("Claimed successfully.");
            loadStakes();
          } catch (err) {
            console.error(err);
            alert("Claim failed.");
          }
        };
        stakeItem.appendChild(claimBtn);
      }

      if (canUnstake && !stake.claimed) {
        const unstakeBtn = document.createElement("button");
        unstakeBtn.innerText = "Unstake";
        unstakeBtn.onclick = async () => {
          try {
            await stakingContract.methods.unstake(i).send({ from: userAddress });
            alert("Unstaked successfully.");
            loadStakes();
          } catch (err) {
            console.error(err);
            alert("Unstake failed.");
          }
        };
        stakeItem.appendChild(unstakeBtn);
      }

      container.appendChild(stakeItem);
    }

    if (stakeCount == 0) {
      container.innerHTML = `<p>No stakes found.</p>`;
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = "Failed to load stakes.";
  }
}
