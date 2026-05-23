"""EIP-712 Forecast signing.

The on-chain Registry verifies that msg.sender == daemon; the off-chain
mirror endpoint (`/api/forecasts`) verifies an EIP-712 signature so spoofed
forecast records can't be POSTed to the indexer.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict
from eth_account import Account
from eth_account.messages import encode_typed_data


@dataclass
class ForecastPayload:
    name_hash: bytes
    market_id: bytes
    prob: int
    trace_hash: bytes


def domain(chain_id: int) -> Dict:
    return {
        "name": "AgoraForecast",
        "version": "1",
        "chainId": chain_id,
    }


_TYPES = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
    ],
    "Forecast": [
        {"name": "nameHash", "type": "bytes32"},
        {"name": "marketId", "type": "bytes32"},
        {"name": "prob", "type": "uint256"},
        {"name": "traceHash", "type": "bytes32"},
    ],
}


def sign_forecast(payload: ForecastPayload, daemon_pk: str, chain_id: int) -> str:
    """Returns the 0x-prefixed signature."""
    msg = {
        "types": _TYPES,
        "domain": domain(chain_id),
        "primaryType": "Forecast",
        "message": {
            "nameHash": payload.name_hash,
            "marketId": payload.market_id,
            "prob": payload.prob,
            "traceHash": payload.trace_hash,
        },
    }
    encoded = encode_typed_data(full_message=msg)
    signed = Account.sign_message(encoded, private_key=daemon_pk)
    return signed.signature.hex()
