use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use crate::saves::SaveProgress;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRelativeRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneTransform {
    pub scale_x: f64,
    pub scale_y: f64,
    pub offset_x: f64,
    pub offset_y: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserState {
    pub manual_collected: Vec<String>,
    pub ignored: Vec<String>,
    pub manual_area: Option<String>,
    #[serde(default)]
    pub manual_age: Option<String>,
    #[serde(default)]
    pub hud_stretch_x: Option<f64>,
    #[serde(default)]
    pub overlay_only_value: bool,
    #[serde(default)]
    pub overlay_rect: Option<OverlayRect>,
    #[serde(default)]
    pub overlay_rel_rect: Option<OverlayRelativeRect>,
    #[serde(default)]
    pub zone_transforms: HashMap<String, ZoneTransform>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStatus {
    pub visible: bool,
    pub expanded: bool,
    pub click_through: bool,
    pub calibrating: bool,
}

impl Default for OverlayStatus {
    fn default() -> Self {
        Self {
            visible: true,
            expanded: false,
            click_through: false,
            calibrating: false,
        }
    }
}

pub struct AppState {
    pub known_ids: std::sync::Mutex<std::collections::HashSet<u64>>,
    pub progress: std::sync::Mutex<Option<SaveProgress>>,
    pub user: std::sync::Mutex<UserState>,
    pub overlay: std::sync::Mutex<OverlayStatus>,
    pub state_path: PathBuf,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let _ = fs::create_dir_all(&dir);
        let state_path = dir.join("user-state.json");
        let user = fs::read_to_string(&state_path)
            .ok()
            .and_then(|s| serde_json::from_str::<UserState>(&s).ok())
            .unwrap_or_default();
        Self {
            known_ids: std::sync::Mutex::new(std::collections::HashSet::new()),
            progress: std::sync::Mutex::new(None),
            user: std::sync::Mutex::new(user),
            overlay: std::sync::Mutex::new(OverlayStatus::default()),
            state_path,
        }
    }

    pub fn save_user(&self, user: &UserState) -> Result<(), String> {
        let json = serde_json::to_string_pretty(user).map_err(|e| e.to_string())?;
        fs::write(&self.state_path, json).map_err(|e| e.to_string())
    }
}
