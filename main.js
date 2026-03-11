let web3;
let contract;
let token;
let user;
let provider;

// ===== Provider Picker =====
function pickProvider(prefer = "auto") {
  const eth = window.ethereum || null;
  const bitkeep = window.bitkeep?.ethereum || window.bitkeep || null;

  const providers = eth?.providers && Array.isArray(eth.providers) ? eth.providers : null;
  const find = (pred) => (providers ? providers.find(pred) : null);

  const isMetaMask = (p) => !!p?.isMetaMask;
  const isBitget = (p) => !!(p?.isBitKeep || p?.isBitgetWallet || p?.isBitget);

  if (prefer === "bitget") return bitkeep || find(isBitget) || eth;
  if (prefer === "metamask") return find(isMetaMask) || (eth?.isMetaMask ? eth : null) || bitkeep || eth;

  // auto: prefer MetaMask ก่อน แล้วค่อย Bitget
  return find(isMetaMask) || bitkeep || find(isBitget) || eth;
}

// ===== Parse / Format helpers =====
function parseUnitsCustom(value, decimals) {
  const str = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error("Invalid amount");

  const [whole, frac = ""] = str.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const full = (whole + fracPadded).replace(/^0+/, "") || "0";
  return full;
}

function formatUnitsCustom(value, decimals) {
  const s = String(value);
  if (decimals === 0) return s;

  const padded = s.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals);
  let fracPart = padded.slice(-decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function shortAddress(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ===== Ensure Chain =====
async function ensureChain() {
  if (!provider?.request) throw new Error("No provider");

  const currentChainId = await provider.request({ method: "eth_chainId" });
  const targetHex = "0x" + Number(chainId).toString(16);

  if (String(currentChainId).toLowerCase() === targetHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }],
    });
  } catch (e) {
    if (e?.code === 4001) {
      throw new Error("User rejected network switch");
    }

    if (e?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: targetHex,
          chainName: "BNB Smart Chain",
          nativeCurrency: {
            name: "BNB",
            symbol: "BNB",
            decimals: 18
          },
          rpcUrls: ["https://bsc-dataseed.binance.org/"],
          blockExplorerUrls: ["https://bscscan.com/"],
        }],
      });

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }],
      });
      return;
    }

    throw e;
  }
}

// ===== Status UI =====
function setStatus(message) {
  const el = document.getElementById("status");
  if (el) el.innerHTML = message;
}

// ===== Init =====
async function initWeb3() {
  try {
    provider = pickProvider("auto");

    console.log("window.ethereum =", window.ethereum);
    console.log("window.bitkeep =", window.bitkeep);
    console.log("picked provider =", provider);

    if (!provider?.request) {
      setStatus("❌ Wallet not found");
      alert("⚠️ ไม่พบ Wallet Provider\nกรุณาเปิดผ่าน MetaMask / Bitget / Trust Wallet DApp Browser");
      return;
    }

    web3 = new Web3(provider);
    token = new web3.eth.Contract(erc20ABI, tokenAddress);
    contract = new web3.eth.Contract(stakingABI, contractAddress);

    provider.on?.("accountsChanged", () => window.location.reload());
    provider.on?.("chainChanged", () => window.location.reload());

    document.getElementById("connectWallet")?.addEventListener("click", connectWallet);
    document.getElementById("stakeButton")?.addEventListener("click", stakeTokens);
    document.getElementById("refreshButton")?.addEventListener("click", loadStakes);
  } catch (err) {
    console.error("initWeb3 error:", err);
    setStatus("❌ Init failed: " + (err?.message || err));
  }
}

window.addEventListener("load", initWeb3);

// ===== Connect Wallet =====
async function connectWallet() {
  try {
    if (!provider) provider = pickProvider("auto");
    if (!provider?.request) throw new Error("No provider");

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    user = accounts?.[0];

    if (!user) throw new Error("No account");

    await ensureChain();

    const symbol = await token.methods.symbol().call().catch(() => "TOKEN");
    const decimals = await token.methods.decimals().call().catch(() => 18);
    const balanceRaw = await token.methods.balanceOf(user).call().catch(() => "0");
    const balance = formatUnitsCustom(balanceRaw, Number(decimals));

    setStatus(`
      ✅ Connected: <br>
      ${user}<br>
      Balance: ${balance} ${symbol}
    `);

    await loadStakes();
  } catch (err) {
    console.error("Connection failed:", err);

    let msg = err?.message || "Unknown error";
    if (err?.code === 4001) msg = "ผู้ใช้ยกเลิกการเชื่อมต่อ";
    if (err?.code === -32002) msg = "Wallet popup ค้างอยู่ กรุณาเปิด wallet แล้วกดยืนยัน";
    if (err?.code === 4902) msg = "ยังไม่มีเครือข่าย BSC ใน wallet";

    setStatus("❌ Connection failed: " + msg);
    alert("❌ Wallet connection failed: " + msg);
  }
}

// ===== Stake =====
async function stakeTokens() {
  if (!user) {
    alert("กรุณาเชื่อมต่อกระเป๋าก่อน");
    return;
  }

  const amount = document.getElementById("stakeAmount")?.value;
  const tier = document.getElementById("stakeTier")?.value;

  if (!amount || Number(amount) <= 0) {
    alert("กรุณากรอกจำนวนที่ต้องการ Stake");
    return;
  }

  try {
    await ensureChain();

    const decimals = Number(await token.methods.decimals().call());
    const stakeAmount = parseUnitsCustom(amount, decimals);

    const allowance = await token.methods.allowance(user, contractAddress).call();

    if (web3.utils.toBN(allowance).lt(web3.utils.toBN(stakeAmount))) {
      await token.methods.approve(contractAddress, stakeAmount).send({ from: user });
      alert("✅ Approve สำเร็จแล้ว\nกรุณากด Stake อีกครั้งเพื่อยืนยันการ Stake");
      return;
    }

    await contract.methods.stake(stakeAmount, tier).send({ from: user });

    alert("✅ Staked successfully");

    const balanceRaw = await token.methods.balanceOf(user).call().catch(() => "0");
    const symbol = await token.methods.symbol().call().catch(() => "TOKEN");
    const balance = formatUnitsCustom(balanceRaw, decimals);

    setStatus(`
      ✅ Connected: <br>
      ${user}<br>
      Balance: ${balance} ${symbol}
    `);

    await loadStakes();
  } catch (error) {
    console.error("Staking failed:", error);
    alert("❌ Staking failed: " + (error?.message || error));
  }
}

// ===== Load Stakes =====
async function loadStakes() {
  const container = document.getElementById("stakesContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!user) {
    container.innerText = "กรุณาเชื่อมต่อกระเป๋า";
    return;
  }

  try {
    const decimals = Number(await token.methods.decimals().call());
    const symbol = await token.methods.symbol().call().catch(() => "KJC");
    const claimInterval = await contract.methods.CLAIM_INTERVAL().call().catch(() => (15 * 86400).toString());

    let index = 0;
    let found = false;

    while (true) {
      try {
        const stake = await contract.methods.stakes(user, index).call();

        if (!stake || String(stake.amount) === "0") break;

        found = true;

        const now = Math.floor(Date.now() / 1000);
        const amount = formatUnitsCustom(stake.amount, decimals);

        const startTimestamp = Number(stake.startTime);
        const lockPeriod = Number(stake.lockPeriod);
        const lastClaimTime = Number(stake.lastClaimTime);
        const unlockTimestamp = startTimestamp + lockPeriod;

        const start = startTimestamp > 0
          ? new Date(startTimestamp * 1000).toLocaleString("th-TH")
          : "-";

        const unlock = unlockTimestamp > 0
          ? new Date(unlockTimestamp * 1000).toLocaleString("th-TH")
          : "-";

        const pendingRaw = await contract.methods.pendingReward(user, index).call().catch(() => "0");
        const pending = formatUnitsCustom(pendingRaw, decimals);

        const canClaim = (now - lastClaimTime) >= Number(claimInterval);
        const canUnstake = now >= unlockTimestamp;

        const card = document.createElement("div");
        card.className = "stake-item";

        card.innerHTML = `
          <p><strong>Index:</strong> ${index}</p>
          <p><strong>Amount:</strong> ${amount} ${symbol}</p>
          <p><strong>Pending Reward:</strong> ${pending} ${symbol}</p>
          <p><strong>Start:</strong> ${start}</p>
          <p><strong>Unlock:</strong> ${unlock}</p>
          <p><strong>Status:</strong> ${
            stake.claimed
              ? "✅ Claimed / Closed"
              : (canUnstake ? "🔓 Unlockable" : "🔒 Locked")
          }</p>
        `;

        if (!stake.claimed && canClaim) {
          const claimBtn = document.createElement("button");
          claimBtn.innerText = "Claim Reward";
          claimBtn.onclick = async () => {
            try {
              await ensureChain();
              await contract.methods.claim(index).send({ from: user });
              alert("✅ Claimed");
              await loadStakes();
            } catch (e) {
              console.error("Claim failed:", e);
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
              console.error("Unstake failed:", e);
              alert("❌ Unstake failed: " + (e?.message || e));
            }
          };
          card.appendChild(unstakeBtn);
        }

        container.appendChild(card);
        index++;
      } catch (e) {
        if (!found) {
          container.innerText = "ยังไม่มีรายการ Stake";
        }
        break;
      }
    }

    if (!found) {
      container.innerText = "ยังไม่มีรายการ Stake";
    }
  } catch (e) {
    console.error("loadStakes error:", e);
    container.innerText = "Failed to load stakes.";
  }
}
