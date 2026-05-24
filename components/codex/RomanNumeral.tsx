const ROMAN: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
};

export function RomanNumeral({ n, className = "" }: { n: number; className?: string }) {
  const symbol = ROMAN[n] ?? toRoman(n);
  return <span className={`roman ${className}`}>{symbol}</span>;
}

function toRoman(num: number): string {
  const map: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let n = Math.max(0, Math.floor(num));
  for (const [v, sym] of map) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out || "—";
}
