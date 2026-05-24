"""Web3.py wrapper for Registry + Vault interactions.

Supports two signing backends:

  - eoa: a local private key (eth_account.Account.from_key)
  - circle: Circle Developer-Controlled Wallets (Programmable Wallets API)

Pick the backend per-Pythia via env:

  PYTHIA_SIGNER=eoa     ->  needs <NAME>_DAEMON_PK
  PYTHIA_SIGNER=circle  ->  needs <NAME>_CIRCLE_WALLET_ID + CIRCLE_API_KEY +
                            CIRCLE_ENTITY_SECRET

The Circle path submits a contractExecution request to Circle's API; Circle's
infra signs with the entity-controlled key and broadcasts to the chain. We
poll for the txHash to come back so the caller still gets a single on-chain
identifier to log.

This is wired so 'Apollo's daemon wallet was provisioned through Circle
Programmable Wallets' and 'Apollo is signing the forecast and posting it on
chain' are simultaneously true.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Optional

from web3 import Web3
from eth_account import Account

log = logging.getLogger("pythia.registry_client")


REGISTRY_ABI = [
    {
        "type": "function", "name": "emitForecast", "stateMutability": "nonpayable",
        "inputs": [
            {"name": "nameHash", "type": "bytes32"},
            {"name": "marketId", "type": "bytes32"},
            {"name": "prob", "type": "uint256"},
            {"name": "traceHash", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "function", "name": "getPythia", "stateMutability": "view",
        "inputs": [{"name": "nameHash", "type": "bytes32"}],
        "outputs": [{
            "type": "tuple",
            "components": [
                {"name": "owner", "type": "address"},
                {"name": "vault", "type": "address"},
                {"name": "daemon", "type": "address"},
                {"name": "manifestHash", "type": "bytes32"},
                {"name": "mandateRoot", "type": "bytes32"},
                {"name": "bondFloor", "type": "uint256"},
                {"name": "registeredAt", "type": "uint64"},
                {"name": "lastForecastAt", "type": "uint64"},
                {"name": "delisted", "type": "bool"},
            ],
        }],
    },
]

VAULT_ABI = [
    {
        # NOTE: the deployed PythiaVault predates the replay-guard `nonce` param
        # added to PythiaVault.sol. The on-chain signature is the 4-arg form;
        # calling the 5-arg form reverts in the selector dispatcher (no match).
        "type": "function", "name": "openPosition", "stateMutability": "nonpayable",
        "inputs": [
            {"name": "marketId", "type": "bytes32"},
            {"name": "yes", "type": "bool"},
            {"name": "amount", "type": "uint256"},
            {"name": "prob", "type": "uint256"},
        ],
        "outputs": [{"name": "positionId", "type": "uint256"}],
    },
    {
        "type": "function", "name": "claimBuilderFees", "stateMutability": "nonpayable",
        "inputs": [], "outputs": [],
    },
    {
        "type": "function", "name": "market", "stateMutability": "view",
        "inputs": [], "outputs": [{"type": "address"}],
    },
]

MARKET_ABI = [
    {
        "type": "function", "name": "markets", "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "bytes32"}],
        "outputs": [
            {"name": "exists", "type": "bool"},
            {"name": "resolved", "type": "bool"},
            {"name": "outcomeYes", "type": "bool"},
            {"name": "totalYes", "type": "uint256"},
            {"name": "totalNo", "type": "uint256"},
        ],
    },
    {
        "type": "function", "name": "createMarket", "stateMutability": "nonpayable",
        "inputs": [
            {"name": "marketId", "type": "bytes32"},
            {"name": "label", "type": "string"},
        ],
        "outputs": [],
    },
]


class _Signer:
    """Abstract signer. Sends a Registry.emitForecast tx, returns the on-chain hash."""

    def emit_forecast(
        self, registry_addr: str, name_hash: bytes, market_id: bytes,
        prob: int, trace_hash: bytes,
    ) -> str:
        raise NotImplementedError

    def open_position(
        self, vault_addr: str, market_id: bytes, yes: bool, amount: int,
        prob: int,
    ) -> str:
        raise NotImplementedError


class EoaSigner(_Signer):
    def __init__(self, rpc: str, daemon_pk: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.account = Account.from_key(daemon_pk)
        self.chain_id = self.w3.eth.chain_id

    def _wait(self, tx_hash) -> str:
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        if receipt.status != 1:
            raise RuntimeError(f"tx {tx_hash.hex()} reverted")
        return tx_hash.hex()

    def emit_forecast(
        self, registry_addr, name_hash, market_id, prob, trace_hash,
    ) -> str:
        registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI,
        )
        tx = registry.functions.emitForecast(
            name_hash, market_id, int(prob), trace_hash,
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
            "chainId": self.chain_id,
            "gas": 250_000,
            "maxFeePerGas": self.w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": self.w3.eth.gas_price,
        })
        signed = self.account.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._wait(h)

    def open_position(
        self, vault_addr, market_id, yes, amount, prob,
    ) -> str:
        vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(vault_addr), abi=VAULT_ABI,
        )
        tx = vault.functions.openPosition(
            market_id, yes, amount, prob,
        ).build_transaction({
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
            "chainId": self.chain_id,
            "gas": 400_000,
        })
        signed = self.account.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._wait(h)


class CircleSigner(_Signer):
    """Submits txs through Circle Developer-Controlled Wallets.

    Circle signs with the entity-controlled key inside Circle's infrastructure
    and broadcasts. We poll for the resulting on-chain hash so callers still
    get a single tx hash to log/index.
    """

    def __init__(self, wallet_id: str, blockchain: str = "ARC-TESTNET"):
        from circle.web3 import utils  # lazy import — Circle is optional
        from circle.web3.developer_controlled_wallets import (
            CreateContractExecutionTransactionForDeveloperRequest,
            AbiParametersInner,
            TransactionsApi,
        )
        api_key = os.environ["CIRCLE_API_KEY"]
        entity_secret = os.environ["CIRCLE_ENTITY_SECRET"]
        api_client = utils.init_developer_controlled_wallets_client(
            api_key=api_key, entity_secret=entity_secret,
        )
        self._transactions = TransactionsApi(api_client)
        self._req_cls = CreateContractExecutionTransactionForDeveloperRequest
        self._abi_param_cls = AbiParametersInner
        self.wallet_id = wallet_id
        self.blockchain = blockchain

    def _submit(
        self, contract_address: str, abi_function_signature: str,
        abi_parameters: list,
    ) -> str:
        wrapped_params = [self._abi_param_cls(p) for p in abi_parameters]
        req = self._req_cls(
            wallet_id=self.wallet_id,
            contract_address=Web3.to_checksum_address(contract_address),
            abi_function_signature=abi_function_signature,
            abi_parameters=wrapped_params,
            fee_level="MEDIUM",
            idempotency_key=str(uuid.uuid4()),
        )
        resp = self._transactions.create_developer_transaction_contract_execution(req)
        # Circle returns a transaction object with an id; we poll for the txHash.
        tx_id = resp.data.id
        log.info("circle tx submitted id=%s, polling for hash...", tx_id)
        return self._poll_for_hash(tx_id)

    def _poll_for_hash(self, tx_id: str, timeout: float = 60.0) -> str:
        deadline = time.time() + timeout
        last_state = None
        while time.time() < deadline:
            tx = self._transactions.get_transaction(id=tx_id)
            data = tx.data.transaction
            state = data.state
            tx_hash = getattr(data, "tx_hash", None) or getattr(data, "txHash", None)
            if state != last_state:
                log.info("circle tx %s state=%s hash=%s", tx_id, state, tx_hash)
                last_state = state
            if tx_hash:
                # Wait for chain confirmation. Circle reports SENT once
                # broadcast; we want CONFIRMED before claiming success.
                if state in ("CONFIRMED", "COMPLETE"):
                    return tx_hash
            if state in ("FAILED", "CANCELLED", "DENIED"):
                raise RuntimeError(
                    f"circle tx {tx_id} in terminal state {state}: "
                    f"errorReason={getattr(data, 'error_reason', None)}"
                )
            time.sleep(1.5)
        raise TimeoutError(f"circle tx {tx_id} did not confirm in {timeout}s")

    def emit_forecast(
        self, registry_addr, name_hash, market_id, prob, trace_hash,
    ) -> str:
        return self._submit(
            registry_addr,
            "emitForecast(bytes32,bytes32,uint256,bytes32)",
            [
                "0x" + name_hash.hex(),
                "0x" + market_id.hex(),
                str(int(prob)),
                "0x" + trace_hash.hex(),
            ],
        )

    def open_position(
        self, vault_addr, market_id, yes, amount, prob,
    ) -> str:
        return self._submit(
            vault_addr,
            "openPosition(bytes32,bool,uint256,uint256)",
            [
                "0x" + market_id.hex(),
                bool(yes),
                str(int(amount)),
                str(int(prob)),
            ],
        )


class RegistryClient:
    """Backwards-compatible facade. Picks the signer based on env."""

    def __init__(
        self, rpc: str, registry_addr: str,
        daemon_pk: Optional[str] = None,
        circle_wallet_id: Optional[str] = None,
    ):
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI,
        )
        self.registry_addr = registry_addr
        self.chain_id = self.w3.eth.chain_id

        mode = os.environ.get("PYTHIA_SIGNER", "").lower()
        if not mode:
            mode = "circle" if circle_wallet_id else "eoa"

        if mode == "circle":
            if not circle_wallet_id:
                raise RuntimeError(
                    "PYTHIA_SIGNER=circle but no circle_wallet_id supplied."
                )
            self.signer: _Signer = CircleSigner(
                wallet_id=circle_wallet_id,
                blockchain=os.environ.get("CIRCLE_BLOCKCHAIN", "ARC-TESTNET"),
            )
            log.info("RegistryClient using CircleSigner wallet=%s", circle_wallet_id)
        elif mode == "eoa":
            if not daemon_pk:
                raise RuntimeError(
                    "PYTHIA_SIGNER=eoa but no daemon_pk supplied."
                )
            self.signer = EoaSigner(rpc=rpc, daemon_pk=daemon_pk)
            log.info("RegistryClient using EoaSigner (local key)")
        else:
            raise RuntimeError(f"unknown PYTHIA_SIGNER={mode!r}")

    def get_pythia(self, name_hash: bytes) -> dict:
        return self.registry.functions.getPythia(name_hash).call()

    def emit_forecast(
        self, name_hash: bytes, market_id: bytes, prob: int, trace_hash: bytes,
    ) -> str:
        return self.signer.emit_forecast(
            self.registry_addr, name_hash, market_id, prob, trace_hash,
        )

    def open_vault_position(
        self, vault_addr: str, market_id: bytes, yes: bool, amount: int,
        prob: int,
    ) -> str:
        return self.signer.open_position(
            vault_addr, market_id, yes, amount, prob,
        )

    def get_vault_market(self, vault_addr: str) -> str:
        """The downstream prediction-market adapter the vault opens positions on."""
        vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(vault_addr), abi=VAULT_ABI,
        )
        return vault.functions.market().call()

    def ensure_market_listed(self, market_addr: str, market_id: bytes, label: str) -> bool:
        """The vault's openPosition CPIs into the adapter, which reverts ('bad
        market') unless the market was listed by its owner. The daemon picks
        live Polymarket markets by keccak(question); nothing else lists them
        on-chain, so we list them here with the adapter-owner key before
        opening a position. Idempotent: a no-op when the market already exists.

        Returns False (and logs) when the market is unlisted and no admin key
        is configured — the caller skips the position rather than fabricating
        one. Set MARKET_ADMIN_PK (or DEPLOYER_PK) to the adapter owner."""
        mkt = self.w3.eth.contract(
            address=Web3.to_checksum_address(market_addr), abi=MARKET_ABI,
        )
        if mkt.functions.markets(market_id).call()[0]:  # .exists
            return True
        pk = os.environ.get("MARKET_ADMIN_PK") or os.environ.get("DEPLOYER_PK")
        if not pk:
            log.warning(
                "market 0x%s not listed on adapter %s and no MARKET_ADMIN_PK/"
                "DEPLOYER_PK to list it — skipping position",
                market_id.hex(), market_addr,
            )
            return False
        admin = Account.from_key(pk)
        tx = mkt.functions.createMarket(market_id, label).build_transaction({
            "from": admin.address,
            "nonce": self.w3.eth.get_transaction_count(admin.address, "pending"),
            "chainId": self.chain_id,
            "gas": 200_000,
            "maxFeePerGas": self.w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": self.w3.eth.gas_price,
        })
        signed = admin.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(h, timeout=60)
        if receipt.status != 1:
            raise RuntimeError(f"createMarket reverted for {label!r} (0x{market_id.hex()})")
        log.info("listed market 0x%s (%r) tx=%s", market_id.hex(), label, h.hex())
        return True
