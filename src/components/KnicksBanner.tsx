// KNICKS CAMPAIGN BANNER
// To remove: see KNICKS_BANNER_REMOVAL.md at the project root.
// All banner code is self-contained in this file + one line in App.tsx.

export function KnicksBanner() {
  return (
    <div
      style={{ backgroundColor: "#006BB6" }}
      className="fixed top-0 left-0 right-0 h-9 px-4 flex items-center justify-center text-center text-sm font-semibold tracking-wide z-[60]"
    >
      <span className="text-white">
        {"🏀 Everybody's chasing a ring. Yours deserves a shot that sells "}
        <span style={{ color: "#F58426" }}>{"→"}</span>
      </span>
    </div>
  );
}
