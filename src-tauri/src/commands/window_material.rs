use crate::services::window_material::{self, WindowMaterialState};

/// Apply (or clear) the native window material and sync the window theme.
///
/// Runtime-only presentation side effect: no persisted data changes, so no
/// Operation Log row. The preference itself is stored through `set_setting`
/// (`window_material_v1`).
#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub async fn set_window_material(
    window: tauri::WebviewWindow,
    enabled: bool,
    dark: bool,
) -> crate::ipc_error::IpcResult<WindowMaterialState> {
    crate::ipc_boundary!(
        "set_window_material",
        Ok::<_, crate::ipc_error::IpcError>(window_material::apply(&window, enabled, dark))
    )
}
