import argparse, logging, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
from athena.pythia import AthenaPythia

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--interval", type=int, default=900)
    a = ap.parse_args()
    p = AthenaPythia(Path(__file__).resolve().parent / "manifest.json")
    if a.once: print(f"emitted {len(p.emit_once())} forecast(s)")
    else: p.run_forever(a.interval)


if __name__ == "__main__":
    sys.exit(main())
