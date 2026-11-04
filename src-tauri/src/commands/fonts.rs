//! Installed font family names for the appearance picker.
//!
//! Windows enumerates GDI families. Other platforms return an empty available
//! list so bundled presets and a typed family name still work. Names only:
//! no file paths, and the full list is not written to the log.

use serde::Serialize;

#[cfg_attr(feature = "ipc-codegen", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFontList {
    pub families: Vec<String>,
    /// False only when this platform should enumerate fonts and the call failed.
    pub available: bool,
}

pub fn normalize_font_family_names(names: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut families = Vec::new();
    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.starts_with('@') {
            continue;
        }
        let key = trimmed.to_lowercase();
        if seen.insert(key) {
            families.push(trimmed.to_string());
        }
    }
    families
}

#[cfg(windows)]
fn locale_ordering(left: &str, right: &str) -> std::cmp::Ordering {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    use windows_sys::Win32::Globalization::{
        CompareStringEx, CSTR_EQUAL, CSTR_GREATER_THAN, CSTR_LESS_THAN, LINGUISTIC_IGNORECASE,
    };

    fn wide(value: &str) -> Vec<u16> {
        OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let left_wide = wide(left);
    let right_wide = wide(right);
    let result = unsafe {
        CompareStringEx(
            std::ptr::null(),
            LINGUISTIC_IGNORECASE,
            left_wide.as_ptr(),
            -1,
            right_wide.as_ptr(),
            -1,
            std::ptr::null(),
            std::ptr::null(),
            0isize,
        )
    };
    match result {
        CSTR_LESS_THAN => std::cmp::Ordering::Less,
        CSTR_EQUAL => std::cmp::Ordering::Equal,
        CSTR_GREATER_THAN => std::cmp::Ordering::Greater,
        _ => left.to_lowercase().cmp(&right.to_lowercase()),
    }
}

#[cfg(not(windows))]
fn locale_ordering(left: &str, right: &str) -> std::cmp::Ordering {
    left.to_lowercase().cmp(&right.to_lowercase())
}

#[cfg(windows)]
fn enumerate_raw_family_names() -> Option<Vec<String>> {
    use std::os::windows::ffi::OsStringExt;

    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::Graphics::Gdi::{
        EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, FONTENUMPROCW, LOGFONTW,
        TEXTMETRICW,
    };

    unsafe extern "system" fn collect(
        logfont: *const LOGFONTW,
        _metric: *const TEXTMETRICW,
        _font_type: u32,
        lparam: LPARAM,
    ) -> i32 {
        if logfont.is_null() || lparam == 0 {
            return 1;
        }
        let names = &mut *(lparam as *mut Vec<String>);
        let face = &(*logfont).lfFaceName;
        let len = face
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(face.len());
        let name = std::ffi::OsString::from_wide(&face[..len])
            .to_string_lossy()
            .into_owned();
        names.push(name);
        1
    }

    unsafe {
        let hdc = GetDC(std::ptr::null_mut());
        if hdc.is_null() {
            return None;
        }
        let mut logfont: LOGFONTW = std::mem::zeroed();
        logfont.lfCharSet = DEFAULT_CHARSET;
        let mut names = Vec::new();
        let callback: FONTENUMPROCW = Some(collect);
        EnumFontFamiliesExW(
            hdc,
            &logfont,
            callback,
            &mut names as *mut Vec<String> as LPARAM,
            0,
        );
        ReleaseDC(std::ptr::null_mut(), hdc);
        Some(names)
    }
}

pub fn installed_font_list() -> InstalledFontList {
    #[cfg(windows)]
    {
        match enumerate_raw_family_names() {
            Some(names) => {
                let mut families = normalize_font_family_names(names);
                families.sort_by(|left, right| locale_ordering(left, right));
                InstalledFontList {
                    families,
                    available: true,
                }
            }
            None => InstalledFontList {
                families: Vec::new(),
                available: false,
            },
        }
    }
    #[cfg(not(windows))]
    {
        let _ = locale_ordering;
        InstalledFontList {
            families: Vec::new(),
            available: true,
        }
    }
}

#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub fn list_installed_font_families() -> InstalledFontList {
    installed_font_list()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_drops_blank_vertical_aliases_and_duplicate_cases() {
        let names = normalize_font_family_names([
            "Segoe UI".to_string(),
            " segoe ui ".to_string(),
            "@微软雅黑".to_string(),
            "  ".to_string(),
            "微软雅黑".to_string(),
            "Microsoft YaHei".to_string(),
        ]);

        assert_eq!(
            names,
            vec![
                "Segoe UI".to_string(),
                "微软雅黑".to_string(),
                "Microsoft YaHei".to_string(),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_font_families_are_unique_sorted_and_not_vertical() {
        let list = installed_font_list();
        assert!(list.available);
        assert!(!list.families.is_empty());
        let mut seen = std::collections::HashSet::new();
        for name in &list.families {
            assert!(!name.is_empty());
            assert!(!name.starts_with('@'));
            assert!(seen.insert(name.to_lowercase()));
        }
        let mut sorted = list.families.clone();
        sorted.sort_by(|left, right| locale_ordering(left, right));
        assert_eq!(list.families, sorted);
    }
}
