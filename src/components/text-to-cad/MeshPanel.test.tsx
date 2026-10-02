import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MeshPanel from "./MeshPanel";
import type { MeshItemData } from "./types";

vi.mock("@/components/cad-studio/MaterialSphere", () => ({ default: () => null }));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => null,
}));

const mk = (name: string, selected = false): MeshItemData => ({ name, verts: 10, faces: 20, visible: true, selected });

function setup(selectedCount = 1, withGem = true) {
  const meshes = [
    mk("Pave_Gem_00", selectedCount > 0),
    mk("Pave_Gem_01", selectedCount > 1),
    mk("Pave_Gem_02", selectedCount > 2),
    mk("Prong_Claw_0_1"),
    mk("Shank_Base_mesh"),
  ];
  const props = {
    onSelectMesh: vi.fn(),
    onSelectFamily: vi.fn(),
    onHoverPart: vi.fn(),
    onApplyGemToAll: withGem ? vi.fn() : undefined,
    onAction: vi.fn(),
    onApplyMaterial: vi.fn(),
    onSceneAction: vi.fn(),
  };
  render(<MeshPanel meshes={meshes} {...props} />);
  return props;
}

describe("MeshPanel parts tree", () => {
  it("shows Parts header, search placeholder and kind headings", () => {
    setup();
    expect(screen.getByText("Parts")).toBeInTheDocument();
    expect(screen.queryByText("Meshes")).toBeNull();
    expect(screen.getByPlaceholderText("Search parts...")).toBeInTheDocument();
    expect(screen.getByText(/^stones$/i)).toBeInTheDocument();
    expect(screen.getByText(/^metal$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pave gem.*3/i })).toBeInTheDocument();
  });

  it("family click selects the family, modifier makes it multi", () => {
    const p = setup();
    const row = screen.getByRole("button", { name: /pave gem.*3/i });
    fireEvent.click(row);
    expect(p.onSelectFamily).toHaveBeenLastCalledWith("Pave_Gem_00", false);
    fireEvent.click(row, { ctrlKey: true });
    expect(p.onSelectFamily).toHaveBeenLastCalledWith("Pave_Gem_00", true);
  });

  it("aria-pressed reflects none / some / all selected", () => {
    setup(0);
    expect(screen.getByRole("button", { name: /pave gem.*3/i })).toHaveAttribute("aria-pressed", "false");
  });
  it("aria-pressed is mixed when partly selected", () => {
    setup(1);
    expect(screen.getByRole("button", { name: /pave gem.*3/i })).toHaveAttribute("aria-pressed", "mixed");
  });
  it("aria-pressed is true when all selected", () => {
    setup(3);
    expect(screen.getByRole("button", { name: /pave gem.*3/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands a family to its parts", () => {
    const p = setup();
    expect(screen.queryByText("Pave_Gem_01")).toBeNull();
    const chevron = screen.getByRole("button", { name: /show parts in pave gem/i });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Pave_Gem_00")).toBeInTheDocument();
    expect(screen.getByText("Pave_Gem_02")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pave_Gem_01"));
    expect(p.onSelectMesh).toHaveBeenCalledWith("Pave_Gem_01", false);
  });

  it("single-part family has no chevron and selects the part", () => {
    const p = setup();
    expect(screen.queryByRole("button", { name: /show parts in shank base/i })).toBeNull();
    const row = screen.getByRole("button", { name: /shank base/i });
    expect(row.children[0]).toHaveTextContent("Shank base");
    expect(row.children[1]).toHaveTextContent("Shank_Base_mesh · 10 verts / 20 faces");
    fireEvent.click(row);
    expect(p.onSelectMesh).toHaveBeenCalledWith("Shank_Base_mesh", false);
    fireEvent.mouseEnter(row);
    expect(p.onHoverPart).toHaveBeenLastCalledWith("Shank_Base_mesh");
  });

  it("one-part rows reserve the chevron column with an aria-hidden spacer", () => {
    setup();
    const wrap = screen.getByRole("button", { name: /shank base/i }).parentElement;
    const spacer = wrap?.querySelector('[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
    expect(spacer).toHaveClass("w-8");
  });

  it("part rows do not use cursor-pointer", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /show parts in pave gem/i }));
    expect(screen.getByText("Pave_Gem_01").closest("button")).not.toHaveClass("cursor-pointer");
    expect(p.onSelectMesh).not.toHaveBeenCalled();
  });

  it("reports hover on part rows", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /show parts in pave gem/i }));
    const row = screen.getByText("Pave_Gem_01").closest("button");
    fireEvent.mouseEnter(row);
    expect(p.onHoverPart).toHaveBeenLastCalledWith("Pave_Gem_01");
    fireEvent.mouseLeave(row);
    expect(p.onHoverPart).toHaveBeenLastCalledWith(null);
  });

  it("Shift+click on a family row selects the family as multi", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /pave gem.*3/i }), { shiftKey: true });
    expect(p.onSelectFamily).toHaveBeenLastCalledWith("Pave_Gem_00", true);
  });

  it("expanded families survive collapsing and re-expanding the Material section", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /show parts in pave gem/i }));
    expect(screen.getByText("Pave_Gem_01")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^material/i }));
    expect(screen.getByText("Pave_Gem_01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show parts in pave gem/i })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /^material/i }));
    expect(screen.getByText("Pave_Gem_01")).toBeInTheDocument();
  });

  it("renders every part as its own row without onSelectFamily", () => {
    render(<MeshPanel meshes={[mk("Pave_Gem_00"), mk("Pave_Gem_01"), mk("Shank_Base_mesh")]} onSelectMesh={vi.fn()} onAction={vi.fn()} onApplyMaterial={vi.fn()} onSceneAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^pave_gem_00/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pave_gem_01/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^shank_base_mesh/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show parts in/i })).toBeNull();
  });

  it("reports hover on family rows", () => {
    const p = setup();
    const row = screen.getByRole("button", { name: /pave gem.*3/i });
    fireEvent.mouseEnter(row);
    expect(p.onHoverPart).toHaveBeenLastCalledWith("Pave_Gem_00");
    fireEvent.mouseLeave(row);
    expect(p.onHoverPart).toHaveBeenLastCalledWith(null);
  });

  it("shows the All stones picker only with onApplyGemToAll", () => {
    setup(1, true);
    expect(screen.getByLabelText("Apply one gem to all stones")).toBeInTheDocument();
  });
  it("omits the All stones picker without onApplyGemToAll", () => {
    setup(1, false);
    expect(screen.queryByLabelText("Apply one gem to all stones")).toBeNull();
  });

  it("shows the empty state", () => {
    render(<MeshPanel meshes={[]} onSelectMesh={vi.fn()} onAction={vi.fn()} onApplyMaterial={vi.fn()} onSceneAction={vi.fn()} />);
    expect(screen.getByText("Generate a piece to see its parts")).toBeInTheDocument();
  });
});
