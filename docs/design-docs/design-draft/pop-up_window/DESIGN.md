# Design System Specification: The Kinetic Workspace

## 1. Overview & Creative North Star: "The Intelligent Atelier"
This design system moves away from the sterile, rigid "box-in-a-box" approach typical of enterprise SaaS. Instead, it adopts the North Star of **"The Intelligent Atelier."** Like a high-end physical workshop for a master engineer, the interface should feel expansive, layered, and precision-tuned. 

We achieve a "B-side" backend aesthetic—one that communicates technical power and high information density—without sacrificing the elegance of a premium consumer experience. We break the grid through **intentional tonal layering** and **asymmetric information clusters**, ensuring that the AI engineering workflow feels like a fluid process rather than a static database.

## 2. Colors: Tonal Depth & The "No-Line" Mandate
The palette is anchored by the warmth of **Warm Orange (#FF8C00)**, used sparingly to indicate "life" and "activity" within the AI agents.

### The "No-Line" Rule
Traditional 1px borders are prohibited for sectioning. Layout boundaries are defined exclusively through background shifts.
- **Surface Level 0:** `surface` (#f8f9fa) — The global canvas.
- **Surface Level 1:** `surface_container_low` (#f3f4f5) — Large structural blocks (e.g., Sidebar background).
- **Surface Level 2:** `surface_container_lowest` (#ffffff) — Actionable cards and data workspaces. This creates a "lifted" effect against the grey canvas.

### Glass & Gradient Strategy
To move beyond "standard" UI, use **Glassmorphism** for transient elements like popovers or floating action buttons.
- **Floating Glass:** Use `surface_container_lowest` at 80% opacity with a `24px` backdrop-blur.
- **Signature Glow:** For primary CTAs, use a linear gradient: `primary_container` (#ff8c00) to `primary` (#904d00) at 135 degrees. This adds "soul" and dimension to critical engineering actions.

## 3. Typography: The Editorial Engineer
We utilize a dual-font approach to balance technical precision with readability. For Chinese characters, use high-legibility sans-serifs (e.g., PingFang SC or Noto Sans SC) with optimized tracking.

- **Display & Headlines (Manrope):** Used for high-level metrics and system names. These should feel authoritative. Use `headline-md` for Agent names to give them "personality."
- **Body & Labels (Inter):** The workhorse for high-density data. 
    - **Inter Semi-Bold** for `title-sm` ensures that even at high densities, the hierarchy remains clear.
    - **Monospace Fallback:** For AI prompts and code snippets, use a dedicated mono-font at `0.875rem` to signal the "backend" nature of the task.

## 4. Elevation & Depth: The Layering Principle
Instead of shadows, we communicate hierarchy through **Tonal Stacking**.

- **The Stack:** Place a `surface_container_lowest` (#ffffff) card inside a `surface_container_high` (#e7e8e9) section. This creates "natural" depth without visual clutter.
- **Ambient Shadows:** Only use shadows for "Floating" states (Modals, Hovered Cards). 
    - **Value:** `0px 12px 32px rgba(25, 28, 29, 0.06)`. Note the use of `on_surface` (#191c1d) as the shadow tint—never use pure black.
- **The Ghost Border:** If a separator is required for accessibility in tables, use `outline_variant` at **15% opacity**. It should be felt, not seen.

## 5. Components: Precision Engineering

### Cards & Data Tables
*   **Density:** High. Use `body-sm` for table rows to maximize visibility.
*   **Separation:** Forbid horizontal lines. Use a `4px` vertical gap between rows and a subtle background change (`surface_container_low`) on hover.
*   **Markdown Editor:** The editor should use `surface_container_lowest` with a "Ghost Border." The syntax highlighting must leverage `tertiary` (#00658f) for logic and `primary` (#904d00) for variables.

### Buttons & Chips
*   **Primary Button:** Gradient fill (`primary_container` to `primary`). `0.375rem` (md) corner radius.
*   **Status Tags (Chips):**
    - **Active:** `primary_fixed` background with `on_primary_fixed` text.
    - **Running:** `tertiary_fixed` background with `on_tertiary_fixed` text.
    - **Error:** `error_container` background with `on_error_container` text.
*   **Refinement:** All chips use `full` (9999px) roundedness to contrast against the architectural squareness of the cards.

### Navigation Sidebar
*   **Background:** `surface_container_low`.
*   **Active State:** No "pill" background. Instead, use a vertical `4px` bar of `primary` on the far left and shift the text color to `on_surface`.

### Inputs & Fields
*   **Style:** Minimalist. No background fill. Only an `outline_variant` bottom border (2px). When focused, the border transforms into a `primary` gradient.

## 6. Do's and Don'ts

### Do:
- **Do** use whitespace as a separator. If you think you need a line, try adding `16px` of padding instead.
- **Do** use `title-lg` for section headers to create an "Editorial" feel.
- **Do** group related AI parameters into nested containers of slightly varying grey tones to guide the eye.

### Don't:
- **Don't** use high-contrast borders. A 100% opaque border is a failure of tonal design.
- **Don't** use the brand orange (#FF8C00) for large background areas. It is a "laser" for attention, not a "paint" for the walls.
- **Don't** use standard "drop shadows." If the element isn't literally floating over the UI (like a modal), it shouldn't have a shadow. Use tonal layering instead.