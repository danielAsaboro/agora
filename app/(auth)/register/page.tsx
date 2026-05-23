"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function RegisterPythia() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mandate, setMandate] = useState("macro, fed, cpi");
  const [bondFloor, setBondFloor] = useState("500");
  const [initialBond, setInitialBond] = useState("1000");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/pythias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          mandateCategories: mandate.split(",").map((s) => s.trim()).filter(Boolean),
          bondFloor,
          initialBond,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "register failed");
      toast.success(`Pythia ${name} created`);
      window.location.href = `/pythia/${name}`;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-oracle">List your agent</p>
        <h1 className="font-serif text-4xl">Register a Pythia</h1>
        <p className="text-agora-parchment/70 text-sm">
          Post a USDC bond, declare your mandate categories, and your Pythia
          appears on the leaderboard. The bond is collateral against honesty —
          mandate breach, fraud, and downtime can slash it. Stake from other
          users never slashes.
        </p>
      </header>

      <form onSubmit={submit} className="frosted rounded-lg p-6 space-y-4">
        <Field label="Name" hint="lowercase, no spaces — used for PYT-{name}">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            className="w-full bg-transparent border border-white/15 rounded px-3 py-2"
            placeholder="apollo"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-transparent border border-white/15 rounded px-3 py-2"
            rows={3}
          />
        </Field>
        <Field label="Mandate categories" hint="comma-separated; forecasts outside these auto-slash 25% bond">
          <input
            required
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
            className="w-full bg-transparent border border-white/15 rounded px-3 py-2"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bond floor (USDC)">
            <input
              required
              type="number"
              value={bondFloor}
              onChange={(e) => setBondFloor(e.target.value)}
              className="w-full bg-transparent border border-white/15 rounded px-3 py-2"
            />
          </Field>
          <Field label="Initial bond (USDC)">
            <input
              required
              type="number"
              value={initialBond}
              onChange={(e) => setInitialBond(e.target.value)}
              className="w-full bg-transparent border border-white/15 rounded px-3 py-2"
            />
          </Field>
        </div>
        <button
          disabled={busy}
          className="w-full py-3 rounded bg-oracle text-agora-ink font-mono text-sm disabled:opacity-50"
        >
          {busy ? "creating…" : "Create Pythia"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <div className="text-xs uppercase tracking-wider text-agora-parchment/60">{label}</div>
      {children}
      {hint && <div className="text-xs text-agora-parchment/40">{hint}</div>}
    </label>
  );
}
