// Hand-curated ABI fragments to avoid pulling in foundry artifacts at runtime.
// Re-generate from out/*.json after contract changes.

export const RegistryAbi = [
  {
    type: "function",
    name: "registerPythia",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "vault", type: "address" },
      { name: "daemon", type: "address" },
      { name: "manifestHash", type: "bytes32" },
      { name: "mandateRoot", type: "bytes32" },
      { name: "bondFloor", type: "uint256" },
    ],
    outputs: [{ name: "nameHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "emitForecast",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nameHash", type: "bytes32" },
      { name: "marketId", type: "bytes32" },
      { name: "prob", type: "uint256" },
      { name: "traceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getPythia",
    stateMutability: "view",
    inputs: [{ name: "nameHash", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "vault", type: "address" },
          { name: "daemon", type: "address" },
          { name: "manifestHash", type: "bytes32" },
          { name: "mandateRoot", type: "bytes32" },
          { name: "bondFloor", type: "uint256" },
          { name: "registeredAt", type: "uint64" },
          { name: "lastForecastAt", type: "uint64" },
          { name: "delisted", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "PythiaRegistered",
    inputs: [
      { name: "nameHash", type: "bytes32", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "vault", type: "address", indexed: false },
      { name: "manifestHash", type: "bytes32", indexed: false },
      { name: "bondFloor", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ForecastEmitted",
    inputs: [
      { name: "nameHash", type: "bytes32", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "prob", type: "uint256", indexed: false },
      { name: "traceHash", type: "bytes32", indexed: false },
      { name: "blockTime", type: "uint64", indexed: false },
      { name: "daemon", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PythiaSlashed",
    inputs: [
      { name: "nameHash", type: "bytes32", indexed: true },
      { name: "slashType", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DaemonRotated",
    inputs: [
      { name: "nameHash", type: "bytes32", indexed: true },
      { name: "oldDaemon", type: "address", indexed: true },
      { name: "newDaemon", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "recordDaemonRotation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nameHash", type: "bytes32" },
      { name: "oldDaemon", type: "address" },
      { name: "newDaemon", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const PythiaVaultAbi = [
  { type: "function", name: "stake", stateMutability: "nonpayable",
    inputs: [{ name: "quoteIn", type: "uint256" }],
    outputs: [{ name: "sharesOut", type: "uint256" }] },
  { type: "function", name: "queueRedeem", stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }], outputs: [] },
  { type: "function", name: "redeem", stateMutability: "nonpayable",
    inputs: [], outputs: [{ name: "quoteOut", type: "uint256" }] },
  { type: "function", name: "openPosition", stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "yes", type: "bool" },
      { name: "amount", type: "uint256" },
      { name: "prob", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ], outputs: [{ name: "positionId", type: "uint256" }] },
  { type: "function", name: "rotateDaemon", stateMutability: "nonpayable",
    inputs: [{ name: "newDaemon", type: "address" }], outputs: [] },
  { type: "function", name: "daemon", stateMutability: "view",
    inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "freeStake", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "accruedOwnerFees", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "stakePrincipal", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pendingRedeems", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "shares", type: "uint256" },
      { name: "availableAt", type: "uint64" },
    ] },
  { type: "function", name: "closePosition", stateMutability: "nonpayable",
    inputs: [{ name: "positionId", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimBuilderFees", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { type: "function", name: "nav", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "bond", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { type: "event", name: "Staked", inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "quoteIn", type: "uint256", indexed: false },
      { name: "sharesOut", type: "uint256", indexed: false },
    ] },
  { type: "event", name: "PositionOpened", inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "yes", type: "bool", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
    ] },
  { type: "event", name: "DaemonRotated", inputs: [
      { name: "oldDaemon", type: "address", indexed: true },
      { name: "newDaemon", type: "address", indexed: true },
    ] },
  { type: "event", name: "PositionClosed", inputs: [
      { name: "positionId", type: "uint256", indexed: true },
      { name: "returned", type: "uint256", indexed: false },
    ] },
  { type: "event", name: "BuilderFeesClaimed", inputs: [
      { name: "amount", type: "uint256", indexed: false },
    ] },
] as const;

export const PythiaVaultFactoryAbi = [
  { type: "function", name: "createPythia", stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "daemon", type: "address" },
      { name: "market", type: "address" },
      { name: "manifestHash", type: "bytes32" },
      { name: "mandateRoot", type: "bytes32" },
      { name: "bondFloor", type: "uint256" },
      { name: "initialBond", type: "uint256" },
    ],
    outputs: [
      { name: "vault", type: "address" },
      { name: "nameHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { name: "nameHash", type: "bytes32", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "vault", type: "address", indexed: false },
    ],
  },
] as const;

export const Erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "faucet", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;
