# Native select inventory

Counted on 2026-11-04. Every row is a production `<select>`. The popup is drawn by the OS, so token classes on the element do not theme the open list.

| File | Count | Role | Behaviors the replacement must keep |
| --- | --- | --- | --- |
| `src/components/settings/AppearanceSettingsSection.tsx` | 2 in `FontRoleControl`, rendered twice (display + body) | Primary font and Chinese fallback | Controlled keys from `displayFont.ts`. Custom text field appears only when value is `custom`. Specimen sits directly under the control and is covered by the OS popup in the reported screenshot. |
| `src/pages/OperationLogsView.tsx` | 3 | Target, level, status filters | Empty-string option means all. |
| `src/components/logs/RuntimeLogsPanel.tsx` | 2 | Level and event-source filters | Empty-string option means all. |
| `src/components/central/CentralInstalledSkillsQuickFilter.tsx` | 1 | Installed-skill quick filter | Empty option plus dynamic options. |
| `src/components/central/CentralSidebarBlocks.tsx` | 1 | Repository or group filter | Empty option plus dynamic ids. |
| `src/components/central/UpdateModePreferenceSelect.tsx` | 1 | Inline update-check mode | Embedded in a pill (`h-6 rounded-full text-xs`). `sync` option can be disabled. Test id `central-update-check-mode-select`. Tests currently use `toHaveValue` and `fireEvent.change`. |
| `src/components/central/updateCenter/UpdateCenterToolbar.tsx` | 2 | Scope and mode | Several options toggle `disabled` from `scopeEnabled`. |
| `src/components/skill/SkillDetailSidebar.tsx` | 2 | Repository and tag | Empty placeholder options. `SkillDetailView.test.tsx` asserts `w-full` on both. |
| `src/components/settings/RemoteTargetsSettingsControls.tsx` | 1 | WSL distribution | `id="new-wsl-distribution"`, empty placeholder, per-option `disabled` when the distro is already added, root `disabled` while the list loads. |

Not in this list:

- `src/components/platform/PlatformMultiSelect.tsx` is a checkbox grid.
- `src/components/layout/TargetQuickSwitcher.tsx` already uses `ui/menu` and `.glass-overlay`.
- `src/components/central/CentralTopFilters.tsx` already paints a hand-built `.glass-overlay` panel.

Closed-state classes already lean on tokens (`border-input bg-input-surface rounded-control hover:border-muted-foreground`) but heights differ (`h-10`, `h-8`, `h-6`) and focus uses `focus-ring` rather than Input's `focus-visible` outline. The shared trigger defaults to Input and accepts `className` so those heights stay.
