

let web3;
let contract; // สำหรับ Staking contract
let tokenContract; // สำหรับ KJC Token contract
let user;

// ตัวแปรเหล่านี้จะถูกโหลดจาก config.js
// const contractAddress = "0xb3F2f75C5278E3a98c3E6b69F73768B7bd337421"; // Staking Contract Address
// const tokenAddress = "0xd479ae350dc24168e8db863c5413c35fb2044ecd"; // KJC Token Address
// const chainId = 56; // Binance Smart Chain Mainnet

window.addEventListener("load", async () => {
  if (window.ethereum) {
    web3 = new Web3(window.ethereum);
    // ตรวจสอบว่า abi.js และ config.js โหลดมาถูกต้อง
    if (typeof stakingABI === 'undefined' || typeof erc20ABI === 'undefined') {
        document.getElementById("status").innerText = "❌ ABI files not loaded correctly. Check console for errors.";
        console.error("Error: stakingABI or erc20ABI is undefined. Make sure abi.js is loaded correctly.");
        return;
    }
    if (typeof contractAddress === 'undefined' || typeof tokenAddress === 'undefined' || typeof chainId === 'undefined') {
        document.getElementById("status").innerText = "❌ Config files not loaded correctly. Check console for errors.";
        console.error("Error: contractAddress, tokenAddress, or chainId is undefined. Make sure config.js is loaded correctly.");
        return;
    }

    contract = new web3.eth.Contract(stakingABI, contractAddress);
    tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress); // สร้าง instance สำหรับ KJC Token

    // ตรวจสอบว่าผู้ใช้เชื่อมต่อกระเป๋าแล้วหรือไม่ (ถ้า refresh หน้า)
    const accounts = await web3.eth.getAccounts();
    if (accounts.length > 0) {
      user = accounts[0];
      document.getElementById("status").innerText = "✅ Connected: " + user;
      await checkAndSwitchNetwork(); // ตรวจสอบและสลับเชนเมื่อเชื่อมต่อแล้ว
      loadStakes();
    } else {
      document.getElementById("status").innerText = "❌ Wallet not connected";
    }

  } else {
    document.getElementById("status").innerText = "❌ No wallet (MetaMask) detected. Please install MetaMask.";
  }
});

document.getElementById("connectWallet").onclick = async () => {
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    user = accounts[0];
    document.getElementById("status").innerText = "✅ Connected: " + user;
    await checkAndSwitchNetwork(); // ตรวจสอบและสลับเชนทันทีเมื่อเชื่อมต่อ
    loadStakes();
  } catch (err) {
    document.getElementById("status").innerText = "❌ Connection rejected or error. Check console.";
    console.error("Wallet connection error:", err);
  }
};

async function checkAndSwitchNetwork() {
  if (!web3 || !user) return; // ต้องมี web3 และ user ถึงจะตรวจสอบได้

  try {
    const currentChainId = await web3.eth.getChainId();
    // web3.utils.toHex(chainId) ใช้สำหรับแปลง Chain ID ให้เป็นรูปแบบ Hex ที่ MetaMask ต้องการ
    if (currentChainId !== chainId) {
      document.getElementById("status").innerText = `⚠️ Wrong Network! Please switch to Binance Smart Chain.`;
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: web3.utils.toHex(chainId) }],
        });
        // ถ้าสลับสำเร็จ MetaMask จะ reload หน้าเอง หรือคุณต้องจัดการโหลดข้อมูลใหม่
        document.getElementById("status").innerText = "✅ Connected and Switched to BSC: " + user;
      } catch (switchError) {
        if (switchError.code === 4902) { // Error code for chain not added
          alert('Binance Smart Chain is not added to your MetaMask. Please add it manually or allow the DApp to add it.');
          // คุณสามารถเพิ่มโค้ดที่นี่เพื่อเสนอให้ DApp เพิ่มเชนให้โดยอัตโนมัติได้
          // ตัวอย่าง: https://docs.metamask.io/wallet/reference/wallet_addethereumchain/
        } else {
          console.error("Failed to switch network:", switchError);
          alert("Could not switch to Binance Smart Chain. Please switch manually in MetaMask.");
        }
        throw switchError; // Propagate the error to prevent further execution on wrong chain
      }
    }
  } catch (error) {
    console.error("Error checking network:", error);
    document.getElementById("status").innerText = "❌ Error checking network. Please refresh.";
    throw error;
  }
}

document.getElementById("stakeButton").onclick = async () => {
  if (!user) {
    alert("Please connect your wallet first.");
    return;
  }

  const amount = document.getElementById("stakeAmount").value;
  const tier = document.getElementById("stakeTier").value; // Tier in days (e.g., 120, 180, 270)

  if (!amount || parseFloat(amount) <= 0) {
    alert("Please enter a valid amount to stake.");
    return;
  }
  if (!tier) {
    alert("Please select a staking tier.");
    return;
  }

  try {
    // ดึงค่า decimals ของ KJC Token
    const decimals = await tokenContract.methods.decimals().call();
    // แปลง amount ที่ผู้ใช้ป้อน (เช่น "1.5") ให้เป็นหน่วยที่ถูกต้องของสัญญา (เช่น 1.5 * 10^18)
    const amountWithDecimals = web3.utils.toBN(web3.utils.toWei(amount, 'ether')); // ใช้ 'ether' ถ้า KJC มี 18 decimals
    // หาก KJC มี decimals อื่นที่ไม่ใช่ 18 คุณต้องปรับโค้ดนี้:
    // const amountWithDecimals = web3.utils.toBN(amount).mul(web3.utils.toBN(10).pow(web3.utils.toBN(decimals)));


    // ตรวจสอบ Allowance ก่อน
    const allowance = await tokenContract.methods.allowance(user, contractAddress).call();
    if (web3.utils.toBN(allowance).lt(amountWithDecimals)) {
        // ถ้า Allowance ไม่เพียงพอ ให้ทำการ Approve ก่อน
        document.getElementById("status").innerText = "Approving KJC tokens...";
        await tokenContract.methods.approve(contractAddress, web3.utils.toBN(2).pow(256).sub(web3.utils.toBN(1))).send({ from: user }); // Approve จำนวนมาก (max uint256) เพื่อความสะดวก
        document.getElementById("status").innerText = "Approval successful. Now staking...";
    } else {
        document.getElementById("status").innerText = "Allowance sufficient. Staking...";
    }

    // ทำการ Stake
    await contract.methods.stake(amountWithDecimals, tier).send({ from: user });
    document.getElementById("status").innerText = "✅ Stake successful!";
    alert("Stake successful!");
    loadStakes(); // โหลดรายการ Stake ใหม่หลังจาก Stake สำเร็จ
  } catch (err) {
    document.getElementById("status").innerText = "❌ Stake failed. Check console for details.";
    console.error("Staking error:", err);
    alert("Stake failed: " + (err.message || err));
  }
};

async function loadStakes() {
  if (!user || !contract) {
    document.getElementById("stakesContainer").innerHTML = "<p>Connect wallet to see your stakes.</p>";
    return;
  }

  const stakesContainer = document.getElementById("stakesContainer");
  stakesContainer.innerHTML = "<p>Loading your stakes...</p>"; // แสดงสถานะการโหลด

  try {
    const count = await contract.methods.getStakeCount(user).call();
    if (count == 0) {
      stakesContainer.innerHTML = "<p>You have no active stakes.</p>";
      return;
    }

    stakesContainer.innerHTML = ""; // Clear previous stakes

    // จาก ABI, ฟังก์ชัน `pendingReward` น่าจะใช้แทน `calculateReward` ได้
    // และ `claim` แทน `claimReward`
    // ตรวจสอบชื่อฟังก์ชันในสัญญาของคุณให้ถูกต้องอีกครั้ง
    // และ stakes ในสัญญาของคุณมี lockPeriod แทน tierDays
    // และ stake.claimed สำหรับบอกว่าถูกถอนหรือไม่
    const interval = await contract.methods.CLAIM_INTERVAL().call(); // ต้องแน่ใจว่าฟังก์ชันนี้มีในสัญญา

    for (let i = 0; i < count; i++) {
      const stake = await contract.methods.stakes(user, i).call();
      const start = parseInt(stake.startTime);
      const lastClaim = parseInt(stake.lastClaimTime);
      const lockPeriod = parseInt(stake.lockPeriod); // Lock period in seconds
      const amountStaked = web3.utils.fromWei(stake.amount, "ether"); // สมมติ KJC มี 18 decimals

      const now = Math.floor(Date.now() / 1000);
      const unlockTime = start + lockPeriod;
      const isUnlocked = now >= unlockTime;
      const hasBeenClaimed = stake.claimed; // ตรวจสอบสถานะ claimed

      let rewardFormatted = "0";
      let canClaim = false;

      if (!hasBeenClaimed) { // ถ้ายังไม่ถูกถอนรางวัล
          const pendingRewardValue = await contract.methods.pendingReward(user, i).call();
          rewardFormatted = web3.utils.fromWei(pendingRewardValue, "ether"); // สมมติรางวัลมี 18 decimals

          // สามารถ claim ได้หากผ่านช่วงเวลา CLAIM_INTERVAL และยังไม่ถูกถอน
          canClaim = now - lastClaim >= parseInt(interval) && parseFloat(rewardFormatted) > 0;
      }


      const div = document.createElement("div");
      div.className = "stake-item"; // เพิ่ม class สำหรับจัด style ถ้ามี

      let claimOrUnstakeButton = '';
      if (!hasBeenClaimed) {
          if (isUnlocked) {
              // ถ้าหมดระยะเวลาล็อคแล้ว ให้แสดงปุ่ม Unstake
              claimOrUnstakeButton = `<button onclick="unstake(${i})">Unstake</button>`;
          } else {
              // ถ้ายังไม่หมดระยะเวลาล็อค
              if (canClaim) {
                  claimOrUnstakeButton = `<button onclick="claim(${i})">Claim Reward (${rewardFormatted} KJC)</button>`;
              } else {
                  claimOrUnstakeButton = `<p>⏳ Next claim in ${Math.max(0, parseInt(interval) - (now - lastClaim))} seconds.</p>`;
              }
          }
      } else {
          claimOrUnstakeButton = `<p>✅ Stake finalized / Unstaked</p>`;
      }


      div.innerHTML = `
        <p><strong>Amount:</strong> ${amountStaked} KJC</p>
        <p><strong>Start Time:</strong> ${new Date(start * 1000).toLocaleString()}</p>
        <p><strong>Lock Period:</strong> ${lockPeriod / (24 * 60 * 60)} days</p>
        <p><strong>Unlock Time:</strong> ${new Date(unlockTime * 1000).toLocaleString()}</p>
        ${!hasBeenClaimed && !isUnlocked ? `<p><strong>Pending Reward:</strong> ${rewardFormatted} KJC</p>` : ''}
        ${claimOrUnstakeButton}
        <hr/>
      `;
      stakesContainer.appendChild(div);
    }
  } catch (err) {
    stakesContainer.innerHTML = "<p>Error loading stakes. Please try again.</p>";
    console.error("Error loading stakes:", err);
  }
}


async function claim(index) {
  if (!user) {
    alert("Please connect your wallet first.");
    return;
  }
  try {
    document.getElementById("status").innerText = `Claiming reward for stake #${index}...`;
    await contract.methods.claim(index).send({ from: user }); // ใช้ `claim` ตาม ABI ของคุณ
    document.getElementById("status").innerText = "✅ Reward claimed successfully!";
    alert("Reward claimed successfully!");
    loadStakes();
  } catch (err) {
    document.getElementById("status").innerText = "❌ Claim failed. Check console for details.";
    console.error("Claim error:", err);
    alert("Claim failed: " + (err.message || err));
  }
}

async function unstake(index) {
  if (!user) {
    alert("Please connect your wallet first.");
    return;
  }
  try {
    document.getElementById("status").innerText = `Unstaking stake #${index}...`;
    await contract.methods.unstake(index).send({ from: user });
    document.getElementById("status").innerText = "✅ Unstake successful!";
    alert("Unstake successful!");
    loadStakes();
  } catch (err) {
    document.getElementById("status").innerText = "❌ Unstake failed. Check console for details.";
    console.error("Unstake error:", err);
    alert("Unstake failed: " + (err.message || err));
  }
}
