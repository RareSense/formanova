// KNICKS CAMPAIGN BANNER
// To remove: see KNICKS_BANNER_REMOVAL.md at the project root.
// All banner code is self-contained in this file + one line in App.tsx.

export function KnicksBanner() {
  return (
    <div
      style={{ backgroundColor: "#006BB6" }}
      className="w-full py-2 px-4 flex items-center justify-center text-center text-sm font-semibold tracking-wide z-50 relative"
    >
      <span className="text-white">
        {"🏀 Everybody's chasing a ring. NYC jewelers, this one's for you "}
        <span style={{ color: "#F58426" }}>{"→"}</span>
      </span>
    </div>
  );
}
