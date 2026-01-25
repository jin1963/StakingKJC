// === main.js (FULL - Repo #2 Fixed) ===
// Requires: web3.min.js, config.js (chainId, tokenAddress, contractAddress), abi.js (erc20ABI, stakingABI)

let web3;
let contract;
let token;
let user;
let provider;

// ===== Provider Picker (Fix Bitget/MetaMask conflict) =====
function pickProvider(prefer = "auto") {
  const eth = window.ethereum || null;

  // Bitget/BitKeep injection
  const bitkeep = window.bitkeep?.ethereum || window.bitkeep || null;

  // multi-injected providers: ethereum.providers
  const providers = eth?.providers && Array.isArray(eth.providers) ? eth.providers : null;
  const find = (pred) => (providers ? providers.find(pred) : null);

  const isMetaMask = (p) => !!p?.isMetaMask;
  const isBitget = (p) => !!(p?.isBitKeep || p?.isBitgetWallet || p?.isBitget);

  if (prefer === "bitget") return bitkeep || find(isBitget) || eth;
  if (prefer === "metamask") return find(isMetaMask) || (eth?.isMetaMask ? eth : null) || bitkeep || eth;

  // auto: prefer Bitget first (avoid MetaMask stealing)
  return bitkeep || find(isBitget) || find(isMetaMask) || eth;
}

// ===== Ensure Chain (switch + fallback add) =====
async function ensureChain() {
  if (!provider?.request) throw new Error("No provider");

  const currentChainId = await provider.request({ method: "eth_chainId" });
  const currentDec = parseInt(currentChainId, 16);

  if (currentDec === chainId) return;

  const targetHex = "0x" + chainId.toString(16); // e.g. 0x38

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  } catch (e) {
    // fallback add chain (BSC)
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: targetHex,
        chainName: "BNB Smart Chain",
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://bsc-dataseed.binance.org/"],
        blockExplorerUrls: ["https://bscscan.com/"],
      }],
    });

    // switch again
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  }
}

// ===== init =====
async function initWeb3() {
  provider = pickProvider("auto");

  if (!provider?.request) {
    alert("⚠️ No Web3 provider found.\nPlease use MetaMask/Bitget/Trust Wallet.\n(มือถือ: เปิดผ่าน Wallet DApp Browser)");
    return;
  }

  web3 = new Web3(provider);
  token = new web3.eth.Contract(erc20ABI, tokenAddress);
  contract = new web3.eth.Contract(stakingABI, contractAddress);

  provider.on?.("accountsChanged", () => window.location.reload());
  provider.on?.("chainChanged", () => window.location.reload());

  document.getElementById("connectWallet")?.addEventListener("click", connectWallet);
  document.getElementById("stakeButton")?.addEventListener("click", stakeTokens);

  // ถ้าอยากให้กดเข้ามาแล้วเห็นสถานะพร้อมเลย (ไม่บังคับ)
  // document.getElementById("status").innerText = "พร้อมเชื่อมต่อกระเป๋า";
}

window.addEventListener("load", initWeb3);

// ===== connect =====
async function connectWallet() {
  try {
    if (!provider) provider = pickProvider("auto");
    if (!provider?.request) throw new Error("No provider");

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    user = accounts?.[0];
    if (!user) throw new Error("No account");

    await ensureChain();

    document.getElementById("status").innerHTML = `✅ Connected:<br>${user}`;
    await loadStakes();
  } catch (err) {
    console.error("Connection failed:", err);
    document.getElementById("status").innerText = "❌ Connection failed.";
    alert("❌ Wallet connection failed: " + (err?.message || err));
  }
}

// ===== stake =====
async function stakeTokens() {
  if (!user) return alert("กรุณาเชื่อมต่อกระเป๋าก่อน");

  const amount = document.getElementById("stakeAmount").value;
  const tier = document.getElementById("stakeTier").value;
  if (!amount || Number(amount) <= 0) return alert("Enter amount to stake");

  try {
    await ensureChain();

    // decimals=18 confirmed
    const stakeAmount = web3.utils.toWei(amount.toString(), "ether");

    // ตรวจ allowance ก่อน เพื่อลด tx ซ้ำ
    const allowance = await token.methods.allowance(user, contractAddress).call({ from: user });
    if (web3.utils.toBN(allowance).lt(web3.utils.toBN(stakeAmount))) {
      await token.methods.approve(contractAddress, stakeAmount).send({ from: user });
      alert("✅ Approved แล้ว กด Stake อีกครั้งเพื่อยืนยันการ Stake");
      return;
    }

    await contract.methods.stake(stakeAmount, tier).send({ from: user });

    alert("✅ Staked successfully");
    await loadStakes();
  } catch (error) {
    console.error("Staking failed:", error);
    alert("❌ Staking failed: " + (error?.message || error));
  }
}

// ===== load stakes (FIXED) =====
async function loadStakes() {
  const container = document.getElementById("stakesContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!user) {
    container.innerText = "กรุณาเชื่อมต่อกระเป๋า";
    return;
  }

  try {
    await ensureChain();

    // ถ้ามี getStakeCount จะดีที่สุด
    let count = 0;
    if (contract.methods.getStakeCount) {
      try {
        count = Number(await contract.methods.getStakeCount(user).call({ from: user }));
      } catch (_) {
        count = 0;
      }
    }

    const items = [];

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const stake = await contract.methods.stakes(user, i).call({ from: user });
        items.push({ stake, index: i });
      }
    } else {
      for (let i = 0; i < 300; i++) {
        const stake = await contract.methods.stakes(user, i).call({ from: user });
        if (!stake || stake.amount == 0) break;
        items.push({ stake, index: i });
      }
    }

    if (items.length === 0) {
      container.innerText = "ยังไม่มีรายการ stake";
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    for (const { stake, index } of items) {
      const amount = web3.utils.fromWei(stake.amount.toString(), "ether");

      const startTimestamp = Number(stake.startTime);
      const unlockTimestamp = Number(stake.startTime) + Number(stake.lockPeriod); // lockPeriod = seconds

      const start = startTimestamp > 0
        ? new Date(startTimestamp * 1000).toLocaleDateString("th-TH")
        : "-";

      const unlock = unlockTimestamp > 0
        ? new Date(unlockTimestamp * 1000).toLocaleDateString("th-TH")
        : "-";

      const card = document.createElement("div");
      card.className = "stake-item";
      card.innerHTML = `
        <p><strong>Index:</strong> ${index}</p>
        <p><strong>Amount:</strong> ${amount} KJC</p>
        <p><strong>Start:</strong> ${start}</p>
        <p><strong>Unlock:</strong> ${unlock}</p>
        <p><strong>Status:</strong> ${stake.claimed ? "✅ Claimed" : (now >= unlockTimestamp ? "🔓 Unlockable" : "🔒 Locked")}</p>
      `;

      // claim ทุก 15 วัน (ตามโค้ดเดิม)
      const claimable = (now - Number(stake.lastClaimTime)) >= 15 * 86400;
      const canUnstake = now >= unlockTimestamp;

      if (!stake.claimed && claimable) {
        const claimBtn = document.createElement("button");
        claimBtn.innerText = "Claim Reward";
        claimBtn.onclick = async () => {
          try {
            await ensureChain();
            await contract.methods.claim(index).send({ from: user });
            alert("✅ Claimed");
            await loadStakes();
          } catch (e) {
            alert("❌ Claim failed: " + (e?.message || e));
          }
        };
        card.appendChild(claimBtn);
      }

      if (!stake.claimed && canUnstake) {
        const unstakeBtn = document.createElement("button");
        unstakeBtn.innerText = "Unstake";
        unstakeBtn.onclick = async () => {
          try {
            await ensureChain();
            await contract.methods.unstake(index).send({ from: user });
            alert("✅ Unstaked");
            await loadStakes();
          } catch (e) {
            alert("❌ Unstake failed: " + (e?.message || e));
          }
        };
        card.appendChild(unstakeBtn);
      }

      container.appendChild(card);
    }
  } catch (e) {
    console.error("loadStakes error:", e);
    container.innerText = "Failed to load stakes.\n" + (e?.message || e);
  }
}
