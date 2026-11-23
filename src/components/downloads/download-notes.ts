/**
 * What each file is for, in plain words for jewellers. Shared with the admin
 * delivered card so both lists say the same thing.
 */
export const DOWNLOAD_NOTES = {
  threedm: '(full editable model - ask your CAD designer to change sizes or stones)',
  viewer_threedm: '(simple copy to look at in any 3D program - not for editing)',
  glb: '(3D preview for your phone, browser or AR)',
  step: '(opens in any CAD program - for your CAD designer or manufacturer)',
  casting_stl: '(give this to your caster)',
  stl: '(metal and stones together - to preview or 3D print a sample)',
  stones: '(stone sizes and counts - give it to your stone setter)',
  spec_sheet: '(sizes, weight and notes for the workshop)',
  code: '(the build script)',
  design_contract: "(the order's exact specs)",
  thumbnail: '(preview picture)',
} as const;
