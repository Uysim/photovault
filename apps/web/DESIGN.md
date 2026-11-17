---
name: PhotoVault Web
description: A private album the group fills together: black card pages in a green cloth shell, photo corners, white-ink captions.
colors:
  album-cloth: "#12251e"
  cloth-line: "#24402f"
  black-page: "#1a1917"
  page-raise: "#242220"
  white-ink: "#efe9dc"
  white-ink-dim: "#b3ac9c"
  corner-mount: "#6f6a5d"
  gold: "#d8a23c"
  gold-hover: "#e6b34f"
  gold-ink: "#1c1405"
  error-coral: "#f19a88"
  viewer-black: "#0b0b0a"
typography:
  title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.01em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.5
  queue:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.04em"
    fontFeature: "tnum"
rounded:
  print: "0px"
  page: "4px"
  control: "6px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "22px"
  xl: "48px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.white-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.gold-hover}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.error-coral}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.black-page}"
    textColor: "{colors.white-ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "40px"
  page:
    backgroundColor: "{colors.black-page}"
    rounded: "{rounded.page}"
    padding: "24px"
  tile:
    backgroundColor: "{colors.page-raise}"
    rounded: "{rounded.print}"
  caption:
    textColor: "{colors.white-ink-dim}"
    typography: "{typography.caption}"
  dropstrip:
    textColor: "{colors.white-ink-dim}"
    rounded: "{rounded.page}"
    padding: "14px 16px"
  viewer:
    backgroundColor: "{colors.viewer-black}"
    textColor: "{colors.white-ink}"
---

# Design System: PhotoVault Web

## Overview

**Creative North Star: "The Black-Page Album"**

PhotoVault is the album the group keeps together, not a file manager. The world is the 1960s-80s photo album: deep bottle-green album cloth around black card pages that make photographs glow, each print seated in four photo corners, captions in small white ink. It lends palette, type, density and one signature move to a working screen; layout, navigation and controls stay ordinary web conventions (a top bar, a drop strip, buttons that look like buttons). Dark only, by intent: the scene of use is an evening at a laptop.

The build follows the seed with deliberate deviations. Frame numbers were dropped from captions because they would shift as uploads arrive; captions carry the date and, for video, the duration. The viewer modal stays dark (near-black over the cloth) and closes on Escape as well as on backdrop click. Login and admin inherit the same shell and controls.

**Key Characteristics:**
- Committed shell: green cloth around black pages, not a grey screen with one accent.
- Signature move: photo corners on every thumbnail, gold on hover/focus and larger.
- One gold, only on things you can press or that are in progress.
- Whole-cell grid that repacks at any width; no partial cells.
- Flat, tonal depth; no shadows.

## Colors

Strategy: Committed shell, restrained pages. Green owns the outside, near-black warm card owns the media, warm white ink carries text, one gold carries action.

### Primary
- **Album Gold** (#d8a23c): primary buttons, focus ring, text selection, progress fill, drop-strip active border, photo corners on hover/focus. Hover lift #e6b34f (gold-hover). Text on gold is Gold Ink (#1c1405).

### Neutral
- **Album Cloth** (#12251e): html/body shell and drop overlay (at ~90% alpha), scrollbar track.
- **Cloth Line** (#24402f): page border, input border, scrollbar thumb; the hairline between cloth and page.
- **Black Page** (#1a1917): the card page, input fill.
- **Page Raise** (#242220): tile placeholder, progress track, inline code.
- **White Ink** (#efe9dc): body text, links, button text.
- **White Ink Dim** (#b3ac9c): captions, placeholders, queue state, drop-strip text, secondary button border.
- **Corner Mount** (#6f6a5d): resting photo corners and the dashed drop-strip border.
- **Viewer Black** (#0b0b0a at ~95% alpha): viewer backdrop.
- **Error Coral** (#f19a88): failures and the danger button.

### Named Rules
**The Gold-Means-Press Rule.** Gold appears only on pressable controls, focus, selection and in-progress state. Never decorative.
**The Photos-Glow Rule.** Page black stays neutral and warm-grey so no UI color competes with photo color.

## Typography

**Display/Body/Label Font:** Hanken Grotesk (with system-ui, sans-serif), loaded via next/font as `--font-ui`. Monospace only for inline `code`.

**Character:** a calm workhorse grotesk; weight and size do the hierarchy, not extra faces. Captions are small, slightly tracked, tabular-figure, like white-ink labels.

### Hierarchy
- **Title** (700, 1.25rem, 1.5, +0.01em): the h1 wordmark in the top bar.
- **Body** (400, 1rem, 1.5): default text; empty-state copy capped at 52ch.
- **Label** (600, 0.9375rem): buttons.
- **Queue** (400, 0.875rem): upload rows, viewer bar.
- **Caption** (400, 0.75rem, +0.04em, tabular numerals): date and video duration under each tile.

### Named Rules
**The Tabular-Ink Rule.** Dates, durations and progress percentages use tabular numerals so changing values do not jitter.

## Layout

One centered shell (max 1200px) with page padding clamp(12px, 3vw, 32px). Top bar (wordmark left, actions right, wrapping) over one black page that contains the drop strip (doubling as the upload queue) and the thumbnail grid. Grid is auto-fill with 150px minimum cells (104px under 520px), gaps 22px by 16px (16px by 10px on small screens). Queue rows are three columns (name, progress, state); on small screens the progress bar drops to its own full-width row. Forms are single-column, max 320px. Spacing rhythm: 6, 8, 12, 16, 22, 48px.

## Elevation & Depth

Flat. Depth is tonal: cloth, then black page, then slightly lighter raise surfaces. The only layering above the page is the full-screen viewer and drop overlay, which use opaque-ish dark scrims, not shadows. No drop shadows exist in the build.

### Named Rules
**The Flat-By-Default Rule.** Surfaces separate by tone and 1px hairline, never by shadow.

## Shapes

Prints are square (0px) and are held by four 16px triangular corner mounts (22px on hover/focus) drawn with gradients and animated through registered custom properties. The page itself has 4px corners; controls and inputs 6px; progress track 3px. Drop strip is a 1px dashed outline. No leather texture, stitching or album ornament.

## Components

### Buttons
- **Shape:** modestly rounded (6px), 40px minimum height, 8px 16px padding, 600 weight.
- **Default:** transparent with 1px White Ink Dim border; hover brightens border to White Ink and adds a faint white wash.
- **Primary:** solid Album Gold with Gold Ink text; hover #e6b34f. One per view (Upload, Sign in, Create invite).
- **Danger:** coral outline and text (Delete in viewer).
- **Disabled:** 45% opacity, not-allowed cursor.
- **Focus:** 2px gold outline, 3px offset on everything.

### Inputs / Fields
- Black Page fill, 1px Cloth Line border, 6px radius, 40px min height; focus swaps border to gold alongside the global ring. Placeholder in White Ink Dim.

### Drop strip and upload queue
- Dashed Corner Mount border, dim text; active (dragging or uploading) turns border gold and text White Ink. Rows show name (ellipsized), 6px progress bar (gold fill on Page Raise track), tabular state; failures collapse to one row in Error Coral. Full-screen drop overlay: cloth wash with 3px dashed gold border.

### Photo tile and caption
- Square, object-fit cover thumbnail on Page Raise, corner mounts overlaid. Caption below in two spans (date, and `Video Ns` for video), dim and tracked. No frame numbers.

### Viewer
- Near-black backdrop, media contained to 95vw by viewport minus 110px, filename and date in a dim bar with a danger Delete. Closes on backdrop click or Escape.

## Do's and Don'ts

### Do:
- **Do** let corner mounts and the date caption be the only world detail on a cell.
- **Do** reserve gold for press, focus, selection and progress.
- **Do** keep upload progress, failure and retry unambiguous in the drop strip.
- **Do** keep the viewer dark and closable by Escape.
- **Do** separate surfaces by tone and hairline, not shadow.

### Don't:
- **Don't** let it read as a cloud-storage tool: no file-list rows, folder trees or storage meters.
- **Don't** add social-feed devices: likes, reactions, engagement counts.
- **Don't** let decoration compete with the photographs.
- **Don't** reintroduce frame numbers; they shift as uploads arrive.
