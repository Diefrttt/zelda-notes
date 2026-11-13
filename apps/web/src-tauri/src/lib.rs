mod memory;
mod saves;
mod state;
mod window_sync;

use memory::{poll_combined, MemoryReader};
use saves::{read_latest_progress, SaveProgress};
use state::{AppState, OverlayRelativeRect, OverlayStatus, UserState, ZoneTransform};
use window_sync::{
    default_relative_stage, is_left_mouse_down, probe_emulator_window, rect_center_inside,
    rect_to_relative_stage, rects_close, relative_stage_to_rect, should_show_overlay, ScreenRect,
    StageInsets,
};
use std::collections::HashSet;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

#[tauri::command]
fn register_known_ids(ids: Vec<String>, state: State<AppState>) {
    let parsed: HashSet<u64> = ids.iter().filter_map(|s| s.parse::<u64>().ok()).collect();
    *state.known_ids.lock().unwrap() = parsed;
}

#[tauri::command]
fn get_progress(state: State<AppState>) -> Option<SaveProgress> {
    state.progress.lock().unwrap().clone()
}

#[tauri::command]
fn get_user_state(state: State<AppState>) -> UserState {
    state.user.lock().unwrap().clone()
}

#[tauri::command]
fn set_marker_status(
    id: String,
    status: String,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.manual_collected.retain(|x| x != &id);
        user.ignored.retain(|x| x != &id);
        match status.as_str() {
            "done" => user.manual_collected.push(id),
            "ignored" => user.ignored.push(id),
            _ => {}
        }
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn set_manual_area(
    area: Option<String>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.manual_area = area.filter(|s| !s.is_empty());
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn set_manual_age(
    age: Option<String>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let normalized = age.filter(|s| s == "child" || s == "adult");
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.manual_age = normalized;
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn set_hud_stretch_x(
    stretch_x: Option<f64>,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let normalized = stretch_x
        .filter(|v| v.is_finite())
        .map(|v| v.clamp(0.5, 2.5));
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.hud_stretch_x = normalized;
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn set_overlay_only_value(
    only_value: bool,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.overlay_only_value = only_value;
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn save_zone_transform(
    area: String,
    transform: ZoneTransform,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.zone_transforms.insert(area, transform);
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn reset_zone_transform(
    area: String,
    app: AppHandle,
    state: State<AppState>,
) -> Result<UserState, String> {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.zone_transforms.remove(&area);
        state.save_user(&user)?;
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
    Ok(updated)
}

#[tauri::command]
fn get_overlay_status(state: State<AppState>) -> OverlayStatus {
    state.overlay.lock().unwrap().clone()
}

fn apply_overlay_visible(app: &AppHandle, visible: bool) {
    if let Some(ov) = app.get_webview_window("overlay") {
        if visible {
            let _ = ov.show();
        } else {
            let _ = ov.hide();
        }
    }
}

fn apply_overlay_flags(app: &AppHandle, status: &OverlayStatus) {
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = ov.set_ignore_cursor_events(status.click_through && !status.calibrating);
    }
}

fn read_overlay_screen_rect(ov: &tauri::WebviewWindow) -> Option<ScreenRect> {
    let pos = ov.outer_position().ok()?;
    let size = ov.inner_size().ok()?;
    Some(ScreenRect {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

fn apply_overlay_rect(ov: &tauri::WebviewWindow, rect: ScreenRect) {
    let _ = ov.set_size(PhysicalSize::new(rect.width.max(160), rect.height.max(140)));
    let _ = ov.set_position(PhysicalPosition::new(rect.x, rect.y));
}

fn resolve_relative_for_viewport(
    user: &UserState,
    viewport: ScreenRect,
    insets: StageInsets,
) -> (OverlayRelativeRect, bool) {
    if let Some(rel) = user.overlay_rel_rect.clone() {
        return (rel, false);
    }
    if let Some(abs) = user.overlay_rect.clone() {
        let abs_sr: ScreenRect = abs.into();
        if rect_center_inside(abs_sr, viewport) {
            return (rect_to_relative_stage(abs_sr, viewport, insets), true);
        }
    }
    (default_relative_stage(), true)
}

fn persist_overlay_rect(
    app: &AppHandle,
    state: &AppState,
    rect: ScreenRect,
    viewport: Option<ScreenRect>,
    insets: StageInsets,
) {
    let updated = {
        let mut user = state.user.lock().unwrap();
        user.overlay_rect = Some(rect.into());
        if let Some(vp) = viewport {
            if vp.width >= 320 && vp.height >= 200 {
                user.overlay_rel_rect = Some(rect_to_relative_stage(rect, vp, insets));
            }
        }
        let _ = state.save_user(&user);
        user.clone()
    };
    let _ = app.emit("user-state-changed", &updated);
}

fn capture_overlay_rect(app: &AppHandle, state: &AppState) {
    let Some(ov) = app.get_webview_window("overlay") else {
        return;
    };
    let Some(rect) = read_overlay_screen_rect(&ov) else {
        return;
    };
    let scale = ov.scale_factor().unwrap_or(1.0);
    let insets = StageInsets::scaled(scale);
    let mut cache = None;
    let viewport = probe_emulator_window(&mut cache)
        .filter(|e| !e.minimized && e.viewport.width >= 320)
        .map(|e| e.viewport);
    persist_overlay_rect(app, state, rect, viewport, insets);
}

fn do_toggle_visible(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = {
        let mut ov = state.overlay.lock().unwrap();
        ov.visible = !ov.visible;
        ov.clone()
    };
    apply_overlay_visible(app, status.visible);
    let _ = app.emit("overlay-status-changed", &status);
}

fn do_toggle_expanded(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = {
        let mut ov = state.overlay.lock().unwrap();
        ov.expanded = !ov.expanded;
        ov.clone()
    };
    let _ = app.emit("overlay-status-changed", &status);
}

fn do_toggle_click_through(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = {
        let mut ov = state.overlay.lock().unwrap();
        ov.click_through = !ov.click_through;
        ov.clone()
    };
    apply_overlay_flags(app, &status);
    let _ = app.emit("overlay-status-changed", &status);
}

fn do_toggle_calibrating(app: &AppHandle) {
    let state = app.state::<AppState>();
    let status = {
        let mut ov = state.overlay.lock().unwrap();
        ov.calibrating = !ov.calibrating;
        if ov.calibrating {
            ov.visible = true;
            ov.expanded = false;
        }
        ov.clone()
    };
    if !status.calibrating {
        capture_overlay_rect(app, &state);
    } else {
        apply_overlay_visible(app, true);
    }
    apply_overlay_flags(app, &status);
    let _ = app.emit("overlay-status-changed", &status);
}

#[tauri::command]
fn toggle_overlay_visible(app: AppHandle, state: State<AppState>) -> OverlayStatus {
    do_toggle_visible(&app);
    state.overlay.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_overlay_expanded(app: AppHandle, state: State<AppState>) -> OverlayStatus {
    do_toggle_expanded(&app);
    state.overlay.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_overlay_click_through(app: AppHandle, state: State<AppState>) -> OverlayStatus {
    do_toggle_click_through(&app);
    state.overlay.lock().unwrap().clone()
}

#[tauri::command]
fn toggle_overlay_calibrating(app: AppHandle, state: State<AppState>) -> OverlayStatus {
    do_toggle_calibrating(&app);
    state.overlay.lock().unwrap().clone()
}

#[tauri::command]
fn save_overlay_rect(app: AppHandle, state: State<AppState>) {
    capture_overlay_rect(&app, &state);
}

fn position_overlay_initial(app: &AppHandle, state: &AppState) {
    let Some(ov) = app.get_webview_window("overlay") else {
        return;
    };
    let scale = ov.scale_factor().unwrap_or(1.0);
    let insets = StageInsets::scaled(scale);
    let mut cache = None;
    if let Some(emu) = probe_emulator_window(&mut cache) {
        if !emu.minimized && emu.viewport.width >= 320 {
            let (rel, should_save) = {
                let user = state.user.lock().unwrap();
                resolve_relative_for_viewport(&user, emu.viewport, insets)
            };
            let target = relative_stage_to_rect(&rel, emu.viewport, insets);
            apply_overlay_rect(&ov, target);
            if should_save {
                let mut user = state.user.lock().unwrap();
                user.overlay_rel_rect = Some(rel);
                user.overlay_rect = Some(target.into());
                let _ = state.save_user(&user);
            }
            return;
        }
    }
    if let Some(rect) = state.user.lock().unwrap().overlay_rect.clone() {
        apply_overlay_rect(&ov, rect.into());
        return;
    }
    if let Ok(Some(mon)) = ov.primary_monitor() {
        let mscale = mon.scale_factor();
        let w = (276.0 * mscale).round() as u32;
        let h = (290.0 * mscale).round() as u32;
        let mx = mon.position().x + mon.size().width as i32;
        let my = mon.position().y + mon.size().height as i32;
        let margin_x = (24.0 * mscale).round() as i32;
        let margin_y = (56.0 * mscale).round() as i32;
        apply_overlay_rect(
            &ov,
            ScreenRect {
                x: mx - w as i32 - margin_x,
                y: my - h as i32 - margin_y,
                width: w,
                height: h,
            },
        );
    }
}

fn spawn_window_sync(app: AppHandle) {
    std::thread::spawn(move || {
        let mut emu_cache: Option<(u32, usize)> = None;
        let mut last_geometry: Option<(ScreenRect, StageInsets)> = None;
        let mut pending_size = None;
        let mut pending_rect: Option<(ScreenRect, u8)> = None;
        let mut last_applied_ov: Option<ScreenRect> = None;

        loop {
            std::thread::sleep(Duration::from_millis(150));
            let Some(ov) = app.get_webview_window("overlay") else {
                continue;
            };
            let state = app.state::<AppState>();
            let status = state.overlay.lock().unwrap().clone();
            let emu = probe_emulator_window(&mut emu_cache);

            let want_vis = should_show_overlay(
                status.visible,
                status.calibrating,
                status.expanded,
                emu.as_ref(),
            );
            if ov.is_visible().ok() != Some(want_vis) {
                apply_overlay_visible(&app, want_vis);
            }

            let Some(emu_win) = emu else {
                last_geometry = None;
                pending_size = None;
                pending_rect = None;
                last_applied_ov = None;
                continue;
            };
            if emu_win.minimized || emu_win.viewport.width < 320 || emu_win.viewport.height < 200 {
                pending_size = None;
                continue;
            }

            let scale = ov.scale_factor().unwrap_or(1.0);
            let insets = StageInsets::scaled(scale);
            let Some(cur_ov) = read_overlay_screen_rect(&ov) else {
                continue;
            };

            let geometry = (emu_win.viewport, insets);
            if last_geometry != Some(geometry) {
                let size = (emu_win.viewport.width, emu_win.viewport.height);
                if last_geometry.is_some_and(|(viewport, _)| (viewport.width, viewport.height) != size)
                    && pending_size != Some(size)
                {
                    pending_size = Some(size);
                    continue;
                }
                if status.calibrating && is_left_mouse_down() {
                    continue;
                }
                let (rel, should_save) = {
                    let user = state.user.lock().unwrap();
                    resolve_relative_for_viewport(&user, emu_win.viewport, insets)
                };
                let target = relative_stage_to_rect(&rel, emu_win.viewport, insets);
                if !rects_close(cur_ov, target, 1) {
                    apply_overlay_rect(&ov, target);
                    pending_rect = Some((target, 3));
                } else {
                    pending_rect = None;
                }
                last_geometry = Some(geometry);
                pending_size = None;
                last_applied_ov = Some(target);
                if should_save {
                    persist_overlay_rect(&app, &state, target, Some(emu_win.viewport), insets);
                }
                continue;
            }
            pending_size = None;

            // Do not persist intermediate Win32 move/resize acknowledgements as calibration.
            if let Some((target, retries)) = pending_rect {
                if rects_close(cur_ov, target, 1) || retries == 0 {
                    pending_rect = None;
                    last_applied_ov = Some(cur_ov);
                } else if !is_left_mouse_down() {
                    apply_overlay_rect(&ov, target);
                    pending_rect = Some((target, retries - 1));
                }
                continue;
            }

            if let Some(prev_ov) = last_applied_ov {
                if !rects_close(cur_ov, prev_ov, 1) {
                    if !is_left_mouse_down() {
                        persist_overlay_rect(&app, &state, cur_ov, Some(emu_win.viewport), insets);
                        last_applied_ov = Some(cur_ov);
                    }
                }
            } else {
                last_applied_ov = Some(cur_ov);
            }
        }
    });
}

fn publish_progress(app: &AppHandle, state: &AppState, progress: SaveProgress) {
    {
        let mut cached = state.progress.lock().unwrap();
        if cached.as_ref() == Some(&progress) {
            return;
        }
        *cached = Some(progress.clone());
    }
    let _ = app.emit("save-progress", &progress);
}

fn spawn_progress_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut mem = MemoryReader::default();
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let known = {
                let state = app.state::<AppState>();
                let guard = state.known_ids.lock().unwrap();
                if guard.is_empty() {
                    continue;
                }
                guard.clone()
            };
            let disk = read_latest_progress(&known);
            let state = app.state::<AppState>();
            if disk.found && state.progress.lock().unwrap().is_none() {
                publish_progress(&app, &state, disk.clone());
            }
            let progress = poll_combined(&mut mem, disk, &known);
            publish_progress(&app, &state, progress);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = AppState::load(app.handle());
            position_overlay_initial(app.handle(), &state);
            app.manage(state);

            let f7 = Shortcut::new(None, Code::F7);
            let f8 = Shortcut::new(None, Code::F8);
            let f9 = Shortcut::new(None, Code::F9);
            let f10 = Shortcut::new(None, Code::F10);

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |handle, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        if shortcut == &f7 {
                            do_toggle_calibrating(handle);
                        } else if shortcut == &f8 {
                            do_toggle_visible(handle);
                        } else if shortcut == &f9 {
                            do_toggle_expanded(handle);
                        } else if shortcut == &f10 {
                            do_toggle_click_through(handle);
                        }
                    })
                    .build(),
            )?;

            for s in [f7, f8, f9, f10] {
                if let Err(err) = app.global_shortcut().register(s) {
                    eprintln!("Warning: could not register global shortcut {s:?}: {err}");
                }
            }

            spawn_progress_watcher(app.handle().clone());
            spawn_window_sync(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { .. } = event {
                    if let Some(ov) = window.app_handle().get_webview_window("overlay") {
                        let _ = ov.close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            register_known_ids,
            get_progress,
            get_user_state,
            set_marker_status,
            set_manual_area,
            set_manual_age,
            set_hud_stretch_x,
            set_overlay_only_value,
            save_zone_transform,
            reset_zone_transform,
            get_overlay_status,
            toggle_overlay_visible,
            toggle_overlay_expanded,
            toggle_overlay_click_through,
            toggle_overlay_calibrating,
            save_overlay_rect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
