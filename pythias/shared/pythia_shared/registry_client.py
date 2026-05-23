"""Thin Web3.py wrapper for Registry + Vault interactions."""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Tuple
from web3 import Web3
from eth_account import Account

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
]


class RegistryClient:
    def __init__(self, rpc: str, registry_addr: str, daemon_pk: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc))
        self.registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(registry_addr), abi=REGISTRY_ABI
        )
        self.daemon = Account.from_key(daemon_pk)
        self.chain_id = self.w3.eth.chain_id

    def get_pythia(self, name_hash: bytes) -> dict:
        return self.registry.functions.getPythia(name_hash).call()

    def _wait(self, tx_hash) -> str:
        """Wait for confirmation. Sub-second on Arc; cheap insurance against
        'nonce too low' on the next send."""
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=30)
        if receipt.status != 1:
            raise RuntimeError(f"tx {tx_hash.hex()} reverted")
        return tx_hash.hex()

    def emit_forecast(self, name_hash: bytes, market_id: bytes, prob: int, trace_hash: bytes) -> str:
        """Returns the on-chain txn hash (0x-prefixed)."""
        tx = self.registry.functions.emitForecast(
            name_hash, market_id, int(prob), trace_hash
        ).build_transaction({
            "from": self.daemon.address,
            "nonce": self.w3.eth.get_transaction_count(self.daemon.address, "pending"),
            "chainId": self.chain_id,
            "gas": 250_000,
            "maxFeePerGas": self.w3.eth.gas_price * 2,
            "maxPriorityFeePerGas": self.w3.eth.gas_price,
        })
        signed = self.daemon.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._wait(h)

    def open_vault_position(
        self, vault_addr: str, market_id: bytes, yes: bool, amount: int, prob: int
    ) -> str:
        vault = self.w3.eth.contract(
            address=Web3.to_checksum_address(vault_addr), abi=VAULT_ABI
        )
        tx = vault.functions.openPosition(market_id, yes, amount, prob).build_transaction({
            "from": self.daemon.address,
            "nonce": self.w3.eth.get_transaction_count(self.daemon.address, "pending"),
            "chainId": self.chain_id,
            "gas": 400_000,
        })
        signed = self.daemon.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        return self._wait(h)
