---
name: PhotoVault Mobile
description: The group's private album on a phone: black pages on dark green cloth, warm white ink, one gold accent.
colors:
  album-cloth: "#12251e"
  cloth-line: "#24402f"
  black-page: "#1a1917"
  white-ink: "#efe9dc"
  white-ink-dim: "#b3ac9c"
  gold: "#d8a23c"
  gold-ink: "#1c1405"
  error-coral: "#f19a88"
  viewer-black: "#0b0b0a"
typography:
  title:
    fontFamily: "Hanken Grotesk"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
  body:
    fontFamily: "Hanken Grotesk"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "Hanken Grotesk"
    fontSize: "16px"
    fontWeight: 700
rounded:
  tile: "2px"
  control: "10px"
  panel: "12px"
spacing:
  gap: "3px"
  sm: "8px"
  md: "12px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
  field:
    backgroundColor: "{colors.black-page}"
    textColor: "{colors.white-ink}"
    rounded: "{rounded.control}"
    height: "52px"
---

# Design System: PhotoVault Mobile

## Overview

**Creative North Star: "The Quiet Frame"**, expressed in the same album world as the web app: black pages on dark green cloth, warm white ink, a single gold accent. The media is the only bright thing; chrome stays dark and small. Dark only (`userInterfaceStyle: dark`), because the photos are the light source.

Navigation structure stays native (Expo Router stack, edge-swipe back, modal viewer, system alerts and pickers). Brand lives in color, type and surfaces, not in reinvented navigation.

**Key Characteristics:**
- Dark green cloth ground; black "page" surfaces for panels and fields.
- Gold marks the one primary action on a screen; everything else is ink or dim ink.
- Edge-to-edge tile grid with 3px gutters; 3 / 5 / 6 columns by width.
- Hanken Grotesk throughout (400 / 600 / 700).

## Colors

- **Album Cloth** (#12251e): screen ground and headers. **Cloth Line** (#24402f): borders and progress tracks.
- **Black Page** (#1a1917): panels, fields, tile placeholders.
- **White Ink** (#efe9dc) text; **Dim Ink** (#b3ac9c) secondary text and placeholders.
- **Gold** (#d8a23c) with **Gold Ink** (#1c1405): primary buttons, progress fill, caret and selection. **Error Coral** (#f19a88): failures and Delete. **Viewer Black** (#0b0b0a): the viewer stage.

**The One Gold Rule.** Gold appears on the primary action and progress only. Never on decoration.

## Typography

Hanken Grotesk via `@expo-google-fonts/hanken-grotesk`. Title 24/30 bold (empty states), wordmark 40/44 bold (sign-in), body 17/24, labels 16 bold, status 15. Counts use tabular numerals.

## Layout

Full-bleed gallery, 3px gaps, square tiles. Upload status is a rounded panel above the grid; sign-in is a centered column (max 480) on the cloth. Safe areas come from the stack and `SafeAreaView`.

## Elevation & Depth

Flat. Depth is tonal: cloth, then black page, then viewer black. No shadows.

## Shapes

Tiles nearly square (2px). Controls 10px radius; header pills fully rounded (18px); panels 12px; video badge a 24px circle with a drawn play triangle.

## Components

- **Button** (`src/ui.tsx`): primary gold, quiet (ink text, transparent), danger (coral text). 48px tall; compact header pills 36px with 6px hit slop.
- **Field:** Black Page fill, Cloth Line border, 52px, gold caret.
- **Upload panel:** current file name, "N left", 4px gold progress; failures in coral with Retry / Dismiss.
- **Empty and error states:** 24px title, dim body, one primary button.

## Do's and Don'ts

### Do:
- **Do** take colors, type and radii from `src/theme.ts`; build controls from `src/ui.tsx`.
- **Do** keep navigation, back gestures, pickers and alerts native.
- **Do** keep touch targets at 44pt or more.

### Don't:
- **Don't** add a second accent or put gold on non-primary elements.
- **Don't** add shadows, cards inside cards, or glyph icons (draw shapes or use a real icon set).
- **Don't** hard-code colors in screens; extend the theme instead.
