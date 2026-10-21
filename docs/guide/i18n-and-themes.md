# i18n and Themes

SkillPort ships in two languages and two Light Glass themes. Language and theme can be changed at any time without losing state.

## Language

| Locale | Source files |
|--------|--------------|
| English | `src/i18n/locales/en.json` |
| 简体中文 | `src/i18n/locales/zh.json` |

The active locale is detected on first launch via `i18next-browser-languagedetector` and persisted afterwards. All user-facing strings flow through `react-i18next`; raw English text in source files is treated as a bug.

## Themes

SkillPort 1.1.0 uses the Light Glass design language: translucent panels over a low-saturation mint-to-lavender canvas, with two fixed semantic accents (mint for complete / input / primary actions, lavender for output / secondary data). There are exactly two themes:

| Theme | `data-theme` | Variant |
|-------|--------------|---------|
| Glass Light | `glass-light` | Light |
| Glass Dark | `glass-dark` | Dark |

Switch with **Dark mode / Light mode** at the bottom of the sidebar, or pick a theme card in **Settings → Appearance**. The choice is written to `data-theme` on the root HTML element and saved in local storage as `skillport-theme`. On first launch without a saved choice, SkillPort follows the system color scheme.

There is no accent picker and no custom palette: both themes are checked against WCAG 2.1 AA, including text on translucent panels and tinted blocks.

### Upgrading from 1.0.x

Catppuccin (Latte / Frappé / Macchiato / Mocha), Claude Light / Dark, and the 14 accent colors were removed in 1.1.0. The first launch after upgrading migrates the saved theme once:

| 1.0.x theme | 1.1.0 theme |
|-------------|-------------|
| Latte, Claude Light | Glass Light |
| Frappé, Macchiato, Mocha, Claude Dark | Glass Dark |

The saved accent is discarded, and the legacy `catppuccin-flavor` / `catppuccin-accent` keys are removed.

## Window material (Windows 11 Mica)

On Windows 11, the window can let the system Mica material show through the glass canvas. It is on by default and can be turned off in **Settings → Appearance → Window material**. The window always starts opaque and only becomes translucent after Mica has been applied, so there is no transparent flash.

Windows 10 and other platforms do not support Mica; the toggle explains this and the app keeps an opaque gradient canvas. Mica also falls back to a solid color while the window is inactive; that is operating-system behavior.

## Fonts

Body text, titles, and buttons default to Geist (sans-serif). JetBrains Mono is kept for machine-readable values such as code, paths, IDs, and key caps. **Settings → Appearance → Typography** lets you choose display and body fonts per light / dark theme, a Chinese fallback, and the font size.

When upgrading from 1.0.x, a body font that is still the old default (JetBrains Mono, with no custom font) is switched to Geist once. A custom body font is kept. You can switch back at any time.

## Customizing

| Goal | Where to look |
|------|---------------|
| Add a new translation key | Edit both `en.json` and `zh.json` together; PRs that update only one will be flagged. |
| Change a color, radius, or blur token | Update the repository-root `DESIGN.md` first, then `src/index.css`; `themeContrast.test.ts` and `glassSurfaceContract.test.ts` guard contrast and surface rules. |
| Override the default theme | Set `data-theme="glass-light"` or `"glass-dark"` on the root before app boot (advanced; usually unnecessary). |

## Documentation site language

This documentation site mirrors the same convention. The English root lives at `/`, the Chinese mirror lives under `/zh/`. The language switcher in the top-right of the docs nav follows the same locale routing as the desktop app.

---

Last reviewed: 2026-10-21
