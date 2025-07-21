// abi.js
const stakingABI = [
  // ... (ABI ของสัญญา Staking ของคุณที่สมบูรณ์แล้ว) ...
  { "inputs":[{"internalType":"address","name":"_kjcToken","type":"address"}],"stateMutability":"nonpayable","type":"constructor" },
  { "inputs":[],"name":"CLAIM_INTERVAL","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function" },
  // ... (ฟังก์ชันอื่นๆ ของ Staking Contract) ...
  { "inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function" }, // เปลี่ยนจาก claimReward เป็น claim ตาม ABI
  { "inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"}],"name":"pendingReward","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function" }, // ใช้ pendingReward
  { "inputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"tierDays","type":"uint256"}],"name":"stake","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"stakes","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"lockPeriod","type":"uint256"},{"internalType":"uint256","name":"lastClaimTime","type":"uint256"},{"internalType":"bool","name":"claimed","type":"bool"}],"stateMutability":"view","type":"function" },
  { "inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"unstake","outputs":[],"stateMutability":"nonpayable","type":"function" }
];

const erc20ABI = [
  // ABI สำหรับ ERC-20 Token (KJC Token)
  { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "payable": false, "stateMutability": "nonpayable", "type": "function" },
  { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "stateMutability": "view", "type": "function" },
  { "constant": true, "inputs": [{"name":"_owner","type":"address"}], "name":"balanceOf", "outputs":[{"name":"balance","type":"uint256"}], "type":"function" },
  { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
  { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" },
  // เพิ่มฟังก์ชัน ERC-20 อื่นๆ ที่คุณต้องการใช้
];
