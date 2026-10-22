//! Native window material (Windows 11 Mica) for the main window.
//!
//! Tauri's `set_effects` swallows the vibrancy result (it runs on the main
//! thread and discards the `window_vibrancy` error), so support cannot be
//! observed after the fact. [`decide`] therefore owns the support decision
//! from the OS build number alone: Mica needs Windows 11 (build >= 22000).
//! Everything below that, and every non-Windows platform, stays opaque.
//!
//! The renderer starts opaque (`data-window-material="none"`) and only turns
//! translucent after this module reports `applied: mica`, so a late or failed
//! request can only ever leave the window opaque.

use serde::{Deserialize, Serialize};

/// First Windows 11 build. `window_vibrancy::apply_mica` uses the documented
/// `DWMWA_SYSTEMBACKDROP_TYPE` from 22523 and an undocumented attribute for
/// 22000-22522; anything lower returns `UnsupportedPlatformVersion`.
pub const MICA_MIN_BUILD: u32 = 22_000;

#[cfg_attr(feature = "ipc-codegen", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WindowMaterial {
    Mica,
    None,
}

#[cfg_attr(feature = "ipc-codegen", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WindowMaterialReason {
    /// The user turned the material off in Settings.
    Disabled,
    /// Windows, but older than Windows 11 (no Mica; no Acrylic fallback).
    UnsupportedOs,
    /// Not Windows at all.
    UnsupportedPlatform,
    /// Supported OS, but the effect request could not be dispatched.
    ApplyFailed,
}

#[cfg_attr(feature = "ipc-codegen", derive(specta::Type))]
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowMaterialState {
    pub applied: WindowMaterial,
    pub reason: Option<WindowMaterialReason>,
    /// Whether this OS can show Mica at all (drives the Settings explanation).
    pub supported: bool,
}

impl WindowMaterialState {
    const fn none(reason: WindowMaterialReason, supported: bool) -> Self {
        Self {
            applied: WindowMaterial::None,
            reason: Some(reason),
            supported,
        }
    }
}

/// Pure support decision. `build` is the Windows build number, or `None`
/// when the process is not running on Windows.
pub fn decide(enabled: bool, build: Option<u32>) -> WindowMaterialState {
    let Some(build) = build else {
        return WindowMaterialState::none(WindowMaterialReason::UnsupportedPlatform, false);
    };
    if build < MICA_MIN_BUILD {
        return WindowMaterialState::none(WindowMaterialReason::UnsupportedOs, false);
    }
    if !enabled {
        return WindowMaterialState::none(WindowMaterialReason::Disabled, true);
    }
    WindowMaterialState {
        applied: WindowMaterial::Mica,
        reason: None,
        supported: true,
    }
}

/// Current Windows build number, or `None` off Windows.
pub fn current_os_build() -> Option<u32> {
    #[cfg(windows)]
    {
        Some(windows_version::OsVersion::current().build)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Request (or clear) Mica on `window` and sync the native window theme.
///
/// Logs carry only fixed codes and the decided material; no arguments,
/// paths or window titles.
pub fn apply<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    enabled: bool,
    dark: bool,
) -> WindowMaterialState {
    let state = decide(enabled, current_os_build());
    if state.reason == Some(WindowMaterialReason::UnsupportedPlatform) {
        return state;
    }

    let theme = if dark {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    };
    if window.set_theme(Some(theme)).is_err() {
        tracing::warn!(
            code = "window_theme_sync_failed",
            "Could not sync the native window theme"
        );
    }

    match state.applied {
        WindowMaterial::Mica => {
            let effect = if dark {
                tauri::window::Effect::MicaDark
            } else {
                tauri::window::Effect::MicaLight
            };
            let effects = tauri::window::EffectsBuilder::new().effect(effect).build();
            if window.set_effects(effects).is_err() {
                tracing::warn!(
                    code = "window_material_apply_failed",
                    "Could not request the Mica window material"
                );
                return WindowMaterialState::none(WindowMaterialReason::ApplyFailed, true);
            }
            state
        }
        WindowMaterial::None => {
            if state.supported && window.set_effects(None).is_err() {
                tracing::warn!(
                    code = "window_material_clear_failed",
                    "Could not clear the window material"
                );
            }
            if state.reason == Some(WindowMaterialReason::UnsupportedOs) {
                tracing::info!(
                    code = "window_material_unsupported_os",
                    "Mica needs Windows 11; using the opaque canvas"
                );
            }
            state
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_windows_is_unsupported_platform_even_when_enabled() {
        for enabled in [true, false] {
            assert_eq!(
                decide(enabled, None),
                WindowMaterialState {
                    applied: WindowMaterial::None,
                    reason: Some(WindowMaterialReason::UnsupportedPlatform),
                    supported: false,
                }
            );
        }
    }

    #[test]
    fn windows_10_is_unsupported_os_and_never_mica() {
        for build in [10_240, 19_045, 21_999] {
            for enabled in [true, false] {
                let state = decide(enabled, Some(build));
                assert_eq!(state.applied, WindowMaterial::None, "{build}");
                assert_eq!(state.reason, Some(WindowMaterialReason::UnsupportedOs));
                assert!(!state.supported);
            }
        }
    }

    #[test]
    fn windows_11_applies_mica_when_enabled() {
        for build in [22_000, 22_523, 22_631, 26_100] {
            assert_eq!(
                decide(true, Some(build)),
                WindowMaterialState {
                    applied: WindowMaterial::Mica,
                    reason: None,
                    supported: true,
                },
                "{build}"
            );
        }
    }

    #[test]
    fn disabled_on_windows_11_stays_opaque_but_supported() {
        assert_eq!(
            decide(false, Some(22_631)),
            WindowMaterialState {
                applied: WindowMaterial::None,
                reason: Some(WindowMaterialReason::Disabled),
                supported: true,
            }
        );
    }

    #[test]
    fn state_serializes_with_renderer_field_names() {
        let json = serde_json::to_value(decide(true, Some(22_631))).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "applied": "mica", "reason": null, "supported": true })
        );
        let json = serde_json::to_value(decide(true, Some(19_045))).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "applied": "none", "reason": "unsupportedOs", "supported": false })
        );
        let json = serde_json::to_value(decide(true, None)).unwrap();
        assert_eq!(json["reason"], "unsupportedPlatform");
        let json = serde_json::to_value(WindowMaterialState::none(
            WindowMaterialReason::ApplyFailed,
            true,
        ))
        .unwrap();
        assert_eq!(json["reason"], "applyFailed");
    }

    #[test]
    fn current_os_build_matches_platform() {
        assert_eq!(current_os_build().is_some(), cfg!(windows));
    }
}
