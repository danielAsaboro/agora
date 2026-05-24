"""End-to-end smoke test: run a chosen Pythia once, verifying the full
Manifold/Polymarket → brain → Irys → Circle → on-chain flow.

Usage:  python scripts/test-circle-emit.py <pythia-name>
"""
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT / "pythias" / "shared"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


def main():
    if len(sys.argv) < 2:
        print("usage: test-circle-emit.py <pythia-name>", file=sys.stderr)
        sys.exit(1)
    name = sys.argv[1].lower()
    pythia_dir = ROOT / "pythias" / name
    if not pythia_dir.exists():
        print(f"no such pythia: {name}", file=sys.stderr)
        sys.exit(1)
    sys.path.insert(0, str(pythia_dir))

    module_name = name
    cls_name = name.capitalize() + "Pythia"
    mod = __import__(f"{module_name}.pythia", fromlist=[cls_name])
    Klass = getattr(mod, cls_name)
    p = Klass(pythia_dir / "manifest.json")
    txs = p.emit_once()
    print(f"emitted {len(txs)} forecast(s)")
    for t in txs:
        print(f"  tx: {t}")


if __name__ == "__main__":
    main()
