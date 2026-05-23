"""Apollo entrypoint.

  python -m apollo            # run-forever (default 1h interval)
  python -m apollo --once     # one pass and exit
  python -m apollo --force-forecast
"""
import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# pythias/apollo/apollo/__main__.py — walk up 3 to agora/
PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")

from apollo.pythia import ApolloPythia  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="run a single pass and exit")
    ap.add_argument("--force-forecast", action="store_true", help="alias for --once")
    ap.add_argument("--interval", type=int, default=3600, help="seconds between passes")
    args = ap.parse_args()

    # manifest.json lives in the parent dir (pythias/apollo/manifest.json)
    manifest = Path(__file__).resolve().parents[1] / "manifest.json"
    apollo = ApolloPythia(manifest)
    if args.once or args.force_forecast:
        txs = apollo.emit_once()
        print(f"emitted {len(txs)} forecast(s)")
    else:
        apollo.run_forever(interval_sec=args.interval)


if __name__ == "__main__":
    sys.exit(main())
