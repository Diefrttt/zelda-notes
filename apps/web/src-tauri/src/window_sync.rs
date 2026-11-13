// Live window tracking & proportional docking onto Fritchii (lichii.exe) / Eden (eden.exe).
use crate::state::{OverlayRect, OverlayRelativeRect};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StageInsets {
    pub top: i32,
    pub bottom: i32,
    pub side: i32,
}

impl StageInsets {
    pub fn scaled(scale_factor: f64) -> Self {
        let s = if scale_factor.is_finite() && scale_factor > 0.25 {
            scale_factor
        } else {
            1.0
        };
        Self {
            top: (26.0 * s).round() as i32,
            bottom: (2.0 * s).round() as i32,
            side: (2.0 * s).round() as i32,
        }
    }

    pub fn extra_w(self) -> i32 {
        self.side * 2
    }

    pub fn extra_h(self) -> i32 {
        self.top + self.bottom
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EmulatorWindow {
    pub pid: u32,
    pub main_hwnd: usize,
    pub viewport: ScreenRect,
    pub minimized: bool,
    pub fg_is_emu: bool,
    pub fg_is_self: bool,
}

impl From<OverlayRect> for ScreenRect {
    fn from(r: OverlayRect) -> Self {
        Self {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

impl From<ScreenRect> for OverlayRect {
    fn from(r: ScreenRect) -> Self {
        Self {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
        }
    }
}

/// Extracts the centered 16:9 game viewport inside `rect` (trims letterbox/pillarbox bars).
pub fn fit_16_9(rect: ScreenRect) -> ScreenRect {
    if rect.width == 0 || rect.height == 0 {
        return rect;
    }
    let target_w = ((rect.height as f64) * 16.0 / 9.0).round() as u32;
    let target_h = ((rect.width as f64) * 9.0 / 16.0).round() as u32;
    if rect.width > target_w + 2 {
        let dx = ((rect.width - target_w) / 2) as i32;
        ScreenRect {
            x: rect.x + dx,
            y: rect.y,
            width: target_w,
            height: rect.height,
        }
    } else if rect.height > target_h + 2 {
        let dy = ((rect.height - target_h) / 2) as i32;
        ScreenRect {
            x: rect.x,
            y: rect.y + dy,
            width: rect.width,
            height: target_h,
        }
    } else {
        rect
    }
}

fn render_child_score(rect: ScreenRect, client: ScreenRect) -> Option<(u32, u64)> {
    let (x, y) = (i64::from(rect.x), i64::from(rect.y));
    let (cx, cy) = (i64::from(client.x), i64::from(client.y));
    if x < cx || y < cy
        || x + i64::from(rect.width) > cx + i64::from(client.width)
        || y + i64::from(rect.height) > cy + i64::from(client.height)
        || u64::from(rect.width) * 100 < u64::from(client.width) * 55
        || u64::from(rect.height) * 100 < u64::from(client.height) * 55
    {
        return None;
    }
    let fitted = fit_16_9(rect);
    let area = u64::from(rect.width) * u64::from(rect.height);
    let render_area = u64::from(fitted.width) * u64::from(fitted.height);
    // Prefer the client that already contains the least letterboxing, then the larger surface.
    let fill = (1000.0 * render_area as f64 / area as f64).round() as u32;
    Some((fill, render_area))
}

pub fn default_relative_stage() -> OverlayRelativeRect {
    OverlayRelativeRect {
        x: 0.775,
        y: 0.745,
        width: 0.21,
        height: 0.23,
    }
}

pub fn rect_to_relative_stage(
    overlay: ScreenRect,
    viewport: ScreenRect,
    insets: StageInsets,
) -> OverlayRelativeRect {
    let vw = (viewport.width.max(1)) as f64;
    let vh = (viewport.height.max(1)) as f64;
    let stage_x = (overlay.x + insets.side - viewport.x) as f64;
    let stage_y = (overlay.y + insets.top - viewport.y) as f64;
    let stage_w = ((overlay.width as i32) - insets.extra_w()).max(40) as f64;
    let stage_h = ((overlay.height as i32) - insets.extra_h()).max(40) as f64;
    OverlayRelativeRect {
        x: (stage_x / vw).clamp(-0.2, 0.96),
        y: (stage_y / vh).clamp(-0.2, 0.96),
        width: (stage_w / vw).clamp(0.04, 0.95),
        height: (stage_h / vh).clamp(0.04, 0.95),
    }
}

pub fn relative_stage_to_rect(
    rel: &OverlayRelativeRect,
    viewport: ScreenRect,
    insets: StageInsets,
) -> ScreenRect {
    let vw = (viewport.width.max(1)) as f64;
    let vh = (viewport.height.max(1)) as f64;
    let stage_x = (rel.x * vw).round() as i32 + viewport.x;
    let stage_y = (rel.y * vh).round() as i32 + viewport.y;
    let stage_w = (rel.width * vw).round() as i32;
    let stage_h = (rel.height * vh).round() as i32;
    let width = (stage_w + insets.extra_w()).max(160) as u32;
    let height = (stage_h + insets.extra_h()).max(140) as u32;
    ScreenRect {
        x: stage_x - insets.side,
        y: stage_y - insets.top,
        width,
        height,
    }
}

pub fn rect_center_inside(inner: ScreenRect, outer: ScreenRect) -> bool {
    let cx = inner.x + (inner.width as i32) / 2;
    let cy = inner.y + (inner.height as i32) / 2;
    cx >= outer.x
        && cx <= outer.x + outer.width as i32
        && cy >= outer.y
        && cy <= outer.y + outer.height as i32
}

pub fn rects_close(a: ScreenRect, b: ScreenRect, tol: i32) -> bool {
    (a.x - b.x).abs() <= tol
        && (a.y - b.y).abs() <= tol
        && (a.width as i32 - b.width as i32).abs() <= tol
        && (a.height as i32 - b.height as i32).abs() <= tol
}

pub fn should_show_overlay(
    user_visible: bool,
    calibrating: bool,
    expanded: bool,
    emu: Option<&EmulatorWindow>,
) -> bool {
    let Some(e) = emu else {
        return user_visible || calibrating;
    };
    if e.minimized {
        return false;
    }
    if calibrating {
        return true;
    }
    if !user_visible {
        return false;
    }
    if expanded {
        return true;
    }
    e.fg_is_emu || e.fg_is_self
}

#[cfg(windows)]
mod win {
    use super::*;
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct Point {
        x: i32,
        y: i32,
    }

    const GW_OWNER: u32 = 4;
    const VK_LBUTTON: i32 = 0x01;

    extern "system" {
        fn EnumWindows(cb: unsafe extern "system" fn(*mut c_void, isize) -> i32, lparam: isize) -> i32;
        fn EnumChildWindows(
            parent: *mut c_void,
            cb: unsafe extern "system" fn(*mut c_void, isize) -> i32,
            lparam: isize,
        ) -> i32;
        fn GetWindowThreadProcessId(hwnd: *mut c_void, pid: *mut u32) -> u32;
        fn IsWindow(hwnd: *mut c_void) -> i32;
        fn IsWindowVisible(hwnd: *mut c_void) -> i32;
        fn IsIconic(hwnd: *mut c_void) -> i32;
        fn GetWindow(hwnd: *mut c_void, cmd: u32) -> *mut c_void;
        fn GetClientRect(hwnd: *mut c_void, rect: *mut Rect) -> i32;
        fn ClientToScreen(hwnd: *mut c_void, pt: *mut Point) -> i32;
        fn GetForegroundWindow() -> *mut c_void;
        fn GetCurrentProcessId() -> u32;
        fn GetAsyncKeyState(vkey: i32) -> i16;
    }

    fn client_screen_rect(hwnd: *mut c_void) -> Option<ScreenRect> {
        let mut cr = Rect::default();
        if unsafe { GetClientRect(hwnd, &mut cr) } == 0 {
            return None;
        }
        let w = (cr.right - cr.left).max(0) as u32;
        let h = (cr.bottom - cr.top).max(0) as u32;
        if w == 0 || h == 0 {
            return None;
        }
        let mut pt = Point { x: cr.left, y: cr.top };
        if unsafe { ClientToScreen(hwnd, &mut pt) } == 0 {
            return None;
        }
        Some(ScreenRect {
            x: pt.x,
            y: pt.y,
            width: w,
            height: h,
        })
    }

    struct TopSearch {
        pid: u32,
        best_hwnd: usize,
        best_area: u64,
    }

    unsafe extern "system" fn enum_top_cb(hwnd: *mut c_void, lparam: isize) -> i32 {
        let state = &mut *(lparam as *mut TopSearch);
        let mut win_pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut win_pid);
        if win_pid != state.pid {
            return 1;
        }
        if IsWindowVisible(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
            return 1;
        }
        if let Some(r) = client_screen_rect(hwnd) {
            if r.width >= 200 && r.height >= 150 {
                let area = r.width as u64 * r.height as u64;
                if area > state.best_area {
                    state.best_area = area;
                    state.best_hwnd = hwnd as usize;
                }
            }
        }
        1
    }

    struct ChildSearch {
        client: ScreenRect,
        best: Option<((u32, u64), ScreenRect)>,
    }

    unsafe extern "system" fn enum_child_cb(hwnd: *mut c_void, lparam: isize) -> i32 {
        let state = &mut *(lparam as *mut ChildSearch);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        if let Some(rect) = client_screen_rect(hwnd) {
            if let Some(score) = render_child_score(rect, state.client) {
                if state.best.is_none_or(|(best, _)| score > best) {
                    state.best = Some((score, rect));
                }
            }
        }
        1
    }

    fn resolve_cached_hwnd(cache: &mut Option<(u32, usize)>) -> Option<(u32, *mut c_void)> {
        if let Some((pid, raw)) = *cache {
            let hwnd = raw as *mut c_void;
            if !hwnd.is_null() && unsafe { IsWindow(hwnd) } != 0 {
                let mut win_pid = 0u32;
                unsafe { GetWindowThreadProcessId(hwnd, &mut win_pid) };
                if win_pid == pid && unsafe { IsWindowVisible(hwnd) } != 0 {
                    return Some((pid, hwnd));
                }
            }
            *cache = None;
        }

        let (pid, _) = crate::memory::find_emulator_pid()?;
        let mut search = TopSearch {
            pid,
            best_hwnd: 0,
            best_area: 0,
        };
        unsafe { EnumWindows(enum_top_cb, &mut search as *mut TopSearch as isize) };
        if search.best_hwnd == 0 {
            return None;
        }
        *cache = Some((pid, search.best_hwnd));
        Some((pid, search.best_hwnd as *mut c_void))
    }

    pub fn probe_emulator_window(cache: &mut Option<(u32, usize)>) -> Option<EmulatorWindow> {
        let (pid, main_hwnd) = resolve_cached_hwnd(cache)?;
        let minimized = unsafe { IsIconic(main_hwnd) } != 0;
        let client = client_screen_rect(main_hwnd).unwrap_or_default();
        let viewport = if minimized || client.width == 0 || client.height == 0 {
            client
        } else {
            let mut child_search = ChildSearch {
                client,
                best: None,
            };
            unsafe {
                EnumChildWindows(
                    main_hwnd,
                    enum_child_cb,
                    &mut child_search as *mut ChildSearch as isize,
                )
            };
            fit_16_9(child_search.best.map_or(client, |(_, rect)| rect))
        };

        let fg = unsafe { GetForegroundWindow() };
        let mut fg_pid = 0u32;
        if !fg.is_null() {
            unsafe { GetWindowThreadProcessId(fg, &mut fg_pid) };
        }
        let self_pid = unsafe { GetCurrentProcessId() };

        Some(EmulatorWindow {
            pid,
            main_hwnd: main_hwnd as usize,
            viewport,
            minimized,
            fg_is_emu: fg_pid != 0 && fg_pid == pid,
            fg_is_self: fg_pid != 0 && fg_pid == self_pid,
        })
    }

    pub fn is_left_mouse_down() -> bool {
        (unsafe { GetAsyncKeyState(VK_LBUTTON) } as u16 & 0x8000) != 0
    }
}

#[cfg(not(windows))]
mod win {
    use super::*;
    pub fn probe_emulator_window(_cache: &mut Option<(u32, usize)>) -> Option<EmulatorWindow> {
        None
    }
    pub fn is_left_mouse_down() -> bool {
        false
    }
}

pub fn probe_emulator_window(cache: &mut Option<(u32, usize)>) -> Option<EmulatorWindow> {
    win::probe_emulator_window(cache)
}

pub fn is_left_mouse_down() -> bool {
    win::is_left_mouse_down()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_a_large_render_client_to_containers_and_small_widgets() {
        let client = ScreenRect { x: -1600, y: 100, width: 1600, height: 1000 };
        let render = ScreenRect { x: -1600, y: 150, width: 1600, height: 900 };
        let nested = ScreenRect { x: -1500, y: 200, width: 1280, height: 720 };
        let small = ScreenRect { x: -1500, y: 200, width: 640, height: 360 };
        assert!(render_child_score(render, client) > render_child_score(client, client));
        assert!(render_child_score(render, client) > render_child_score(nested, client));
        assert_eq!(render_child_score(small, client), None);
    }

    #[test]
    fn fits_16_9_letterbox_and_keeps_native_16_9() {
        let native = ScreenRect { x: 0, y: 0, width: 2560, height: 1440 };
        assert_eq!(fit_16_9(native), native);

        let tall = ScreenRect { x: 100, y: 50, width: 1280, height: 800 };
        let fitted = fit_16_9(tall);
        assert_eq!(fitted, ScreenRect { x: 100, y: 90, width: 1280, height: 720 });

        let wide = ScreenRect { x: 0, y: 0, width: 2560, height: 1080 };
        let fitted_w = fit_16_9(wide);
        assert_eq!(fitted_w, ScreenRect { x: 320, y: 0, width: 1920, height: 1080 });
    }

    #[test]
    fn roundtrips_and_scales_stage_proportionally_across_resolutions() {
        let insets = StageInsets { top: 26, bottom: 2, side: 2 };
        let vp_720 = ScreenRect { x: 200, y: 100, width: 1280, height: 720 };
        let ov_720 = ScreenRect { x: 1200, y: 600, width: 260, height: 208 }; // stage: 256x180
        let rel = rect_to_relative_stage(ov_720, vp_720, insets);
        let back = relative_stage_to_rect(&rel, vp_720, insets);
        assert_eq!(back, ov_720);

        // Doubling emulator viewport to 2560x1440 doubles exact .ov-stage size (512x360)
        let vp_1440 = ScreenRect { x: 0, y: 0, width: 2560, height: 1440 };
        let ov_1440 = relative_stage_to_rect(&rel, vp_1440, insets);
        assert_eq!(ov_1440.width - 4, 512);
        assert_eq!(ov_1440.height - 28, 360);
    }

    #[test]
    fn checks_center_containment_and_foreground_visibility() {
        let vp = ScreenRect { x: 100, y: 100, width: 1280, height: 720 };
        assert!(rect_center_inside(ScreenRect { x: 1100, y: 600, width: 200, height: 200 }, vp));
        assert!(!rect_center_inside(ScreenRect { x: 2000, y: 600, width: 200, height: 200 }, vp));

        let emu_active = EmulatorWindow {
            pid: 1,
            main_hwnd: 1,
            viewport: vp,
            minimized: false,
            fg_is_emu: true,
            fg_is_self: false,
        };
        assert!(should_show_overlay(true, false, false, Some(&emu_active)));
        assert!(!should_show_overlay(false, false, false, Some(&emu_active)));

        let emu_bg = EmulatorWindow { fg_is_emu: false, ..emu_active };
        assert!(!should_show_overlay(true, false, false, Some(&emu_bg)));
        assert!(should_show_overlay(true, true, false, Some(&emu_bg)));

        let emu_min = EmulatorWindow { minimized: true, ..emu_active };
        assert!(!should_show_overlay(true, false, false, Some(&emu_min)));
        assert!(!should_show_overlay(true, true, false, Some(&emu_min)));

        assert!(should_show_overlay(true, false, false, None));
    }
}
