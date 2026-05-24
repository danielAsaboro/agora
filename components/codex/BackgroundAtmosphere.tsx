export function BackgroundAtmosphere() {
  return (
    <>
      <div className="codex-bg" aria-hidden />
      {/* Delphic vapor — bottom-aligned soft drifting glow */}
      <div
        className="fixed inset-x-0 bottom-0 h-[40vh] pointer-events-none z-0 animate-vapor-drift"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 100% at 50% 100%, rgba(154,164,179,0.05) 0%, transparent 65%)",
        }}
      />
      <div className="codex-vignette" aria-hidden />
    </>
  );
}
