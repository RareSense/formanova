import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DevCadGeneration from "@/pages/DevCadGeneration";

describe("DevCadGeneration", () => {
  it("previews the real CAD generation states without a submission control", async () => {
    render(<DevCadGeneration />);

    expect(screen.getByText("Your CAD is generating")).toBeTruthy();
    expect(screen.getByText(/no requests or credits/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Loading preview" }));
    expect(await screen.findByText("Loading model into viewport")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Failure" }));
    expect(await screen.findByText("Could not complete generation")).toBeTruthy();
    expect(screen.getByText(/No generation was submitted/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Generating" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep Creating" }));
    expect(await screen.findByText(/continues in the background/i)).toBeTruthy();
  });
});
