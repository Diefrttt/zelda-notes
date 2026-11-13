use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const TITLE_ID: &str = "0400486024DEC000";
const MAGIC: [u8; 4] = [0x04, 0x03, 0x02, 0x01];
const CAPTION_POS: usize = 0x2a0;
const CAPTION_SUB_SCENE_OFF: usize = 0x2ec;
const CAPTION_AGE_OFF: usize = 0xa0;
const CAPTION_AGE_HASH: u32 = 0x96e59c05;
pub(crate) const PROG_AGE_SCENE_OFF: usize = 0x1bcc4;
const PROG_CHILD_FLAG_OFF: usize = 0x11980;
const PROG_CHILD_FLAG_HASH: u32 = 0xcea220d3;
const PROG_ADULT_FLAG_OFF: usize = 0x540;
const PROG_ADULT_FLAG_HASH: u32 = 0x07ad4938;

#[derive(Debug, Clone)]
pub struct SaveSlot {
    pub emulator: String,
    pub slot: String,
    pub dir: PathBuf,
    pub mtime_ms: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveProgress {
    pub found: bool,
    pub ok: bool,
    pub source: String,
    pub scene_source: SceneSource,
    pub emulator: String,
    pub slot: String,
    pub dir: String,
    pub mtime_ms: f64,
    pub collected: Vec<String>,
    pub scene: Option<String>,
    pub parent_scene: Option<String>,
    pub pos: Option<[f32; 3]>,
    pub age: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SceneSource {
    None,
    Save,
    Memory,
}

impl SaveProgress {
    pub fn not_found() -> Self {
        Self {
            found: false,
            ok: false,
            source: "none".into(),
            scene_source: SceneSource::None,
            emulator: String::new(),
            slot: String::new(),
            dir: String::new(),
            mtime_ms: 0.0,
            collected: Vec::new(),
            scene: None,
            parent_scene: None,
            pos: None,
            age: None,
            errors: Vec::new(),
        }
    }
}

fn read_cstr_ascii(bytes: &[u8], off: usize, max_len: usize) -> Option<&str> {
    if off >= bytes.len() {
        return None;
    }
    let slice = &bytes[off..(off + max_len).min(bytes.len())];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    std::str::from_utf8(&slice[..end]).ok()
}

fn age_from_suffix(s: &str) -> Option<String> {
    if s.ends_with("_Adult") {
        Some("adult".into())
    } else if s.ends_with("_Child") {
        Some("child".into())
    } else {
        None
    }
}

fn read_u32_le(bytes: &[u8], off: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(off..off + 4)?.try_into().ok()?))
}

/// Detects Link age (`"child"` or `"adult"`) from a Switch 2 `progress.sav` or RAM buffer.
pub fn parse_progress_age(bytes: &[u8]) -> Option<String> {
    if check_magic(bytes, "progress.sav").is_err() {
        return None;
    }
    if let Some(sub) = read_cstr_ascii(bytes, PROG_AGE_SCENE_OFF, 64).and_then(age_from_suffix) {
        return Some(sub);
    }
    if read_u32_le(bytes, PROG_CHILD_FLAG_OFF) == Some(PROG_CHILD_FLAG_HASH) {
        let val = read_u32_le(bytes, PROG_CHILD_FLAG_OFF + 4)?;
        return Some(if val == 1 { "child" } else { "adult" }.into());
    }
    if read_u32_le(bytes, PROG_ADULT_FLAG_OFF) == Some(PROG_ADULT_FLAG_HASH) {
        let val = read_u32_le(bytes, PROG_ADULT_FLAG_OFF + 4)?;
        return Some(if val == 1 { "adult" } else { "child" }.into());
    }
    None
}

/// Detects Link age (`"child"` or `"adult"`) from a Switch 2 `caption.sav` header buffer.
pub fn parse_caption_age(bytes: &[u8]) -> Option<String> {
    if check_magic(bytes, "caption.sav").is_err() {
        return None;
    }
    if let Some(sub) = read_cstr_ascii(bytes, CAPTION_SUB_SCENE_OFF, 64).and_then(age_from_suffix) {
        return Some(sub);
    }
    if read_u32_le(bytes, CAPTION_AGE_OFF) == Some(CAPTION_AGE_HASH) {
        let val = read_u32_le(bytes, CAPTION_AGE_OFF + 4)?;
        return Some(if val == 1 { "adult" } else { "child" }.into());
    }
    None
}

fn check_magic(bytes: &[u8], what: &str) -> Result<(), String> {
    if bytes.len() < 64 || bytes[0..4] != MAGIC {
        return Err(format!("{what}: bad header or truncated"));
    }
    Ok(())
}

pub fn parse_progress(bytes: &[u8], known_ids: &HashSet<u64>) -> Result<Vec<String>, String> {
    check_magic(bytes, "progress.sav")?;
    let mut found = HashSet::new();
    for chunk in bytes.chunks_exact(8) {
        let id = u64::from_le_bytes(chunk.try_into().unwrap());
        if known_ids.contains(&id) {
            found.insert(id.to_string());
        }
    }
    let mut out: Vec<String> = found.into_iter().collect();
    out.sort();
    Ok(out)
}

pub fn parse_caption(bytes: &[u8]) -> Result<(String, [f32; 3]), String> {
    check_magic(bytes, "caption.sav")?;
    if bytes.len() < CAPTION_POS + 16 {
        return Err("caption.sav: truncated".into());
    }
    let pos = [
        f32::from_le_bytes(bytes[CAPTION_POS..CAPTION_POS + 4].try_into().unwrap()),
        f32::from_le_bytes(bytes[CAPTION_POS + 4..CAPTION_POS + 8].try_into().unwrap()),
        f32::from_le_bytes(bytes[CAPTION_POS + 8..CAPTION_POS + 12].try_into().unwrap()),
    ];
    if pos.iter().any(|v| !v.is_finite()) {
        return Err("caption.sav: non-finite position".into());
    }
    let start = CAPTION_POS + 12;
    let max_end = (start + 64).min(bytes.len());
    let slice = &bytes[start..max_end];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    let scene: String = slice[..end].iter().map(|&b| b as char).collect();
    if scene.len() < 2 || !scene.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') {
        return Err("caption.sav: unreadable scene".into());
    }
    Ok((scene, pos))
}

pub fn find_save_roots_in(app_data: &Path) -> Vec<(String, PathBuf)> {
    let mut roots = Vec::new();
    for emu in ["eden", "fritchii"] {
        let base = app_data
            .join(emu)
            .join("nand")
            .join("user")
            .join("save")
            .join("0000000000000000");
        let Ok(entries) = fs::read_dir(&base) else {
            continue;
        };
        for entry in entries.flatten() {
            let candidate = entry.path().join(TITLE_ID);
            if candidate.is_dir() {
                roots.push((emu.to_string(), candidate));
            }
        }
    }
    roots
}

fn is_slot_dir(name: &str) -> bool {
    name.starts_with("slot_")
        && name.len() > 5
        && name[5..].bytes().all(|b| b.is_ascii_digit())
}

pub fn find_latest_slot(roots: &[(String, PathBuf)]) -> Option<SaveSlot> {
    let mut latest: Option<SaveSlot> = None;
    for (emu, root) in roots {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !is_slot_dir(&name) {
                continue;
            }
            let dir = entry.path();
            let Ok(meta) = fs::metadata(dir.join("progress.sav")) else {
                continue;
            };
            let Ok(modified) = meta.modified() else {
                continue;
            };
            let mtime_ms = modified
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs_f64() * 1000.0)
                .unwrap_or(0.0);
            if latest.as_ref().is_none_or(|cur| mtime_ms > cur.mtime_ms) {
                latest = Some(SaveSlot {
                    emulator: emu.clone(),
                    slot: name,
                    dir,
                    mtime_ms,
                });
            }
        }
    }
    latest
}

pub fn read_slot(slot: &SaveSlot, known_ids: &HashSet<u64>) -> SaveProgress {
    let mut out = SaveProgress {
        found: true,
        ok: true,
        source: "save".into(),
        scene_source: SceneSource::None,
        emulator: slot.emulator.clone(),
        slot: slot.slot.clone(),
        dir: slot.dir.to_string_lossy().into_owned(),
        mtime_ms: slot.mtime_ms,
        collected: Vec::new(),
        scene: None,
        parent_scene: None,
        pos: None,
        age: None,
        errors: Vec::new(),
    };

    let mut prog_age = None;
    match fs::read(slot.dir.join("progress.sav")) {
        Ok(bytes) => {
            prog_age = parse_progress_age(&bytes);
            match parse_progress(&bytes, known_ids) {
                Ok(ids) => out.collected = ids,
                Err(e) => {
                    out.ok = false;
                    out.errors.push(e);
                }
            }
        }
        Err(e) => {
            out.ok = false;
            out.errors.push(format!("progress.sav: {e}"));
        }
    }

    match fs::read(slot.dir.join("caption.sav")) {
        Ok(bytes) => {
            out.age = parse_caption_age(&bytes).or(prog_age);
            match parse_caption(&bytes) {
                Ok((scene, pos)) => {
                    out.scene = Some(scene);
                    out.scene_source = SceneSource::Save;
                    out.pos = Some(pos);
                }
                Err(e) => out.errors.push(e),
            }
        }
        Err(e) => {
            out.age = prog_age;
            out.errors.push(format!("caption.sav: {e}"));
        }
    }

    out
}

pub fn read_latest_progress(known_ids: &HashSet<u64>) -> SaveProgress {
    let Some(app_data) = std::env::var_os("APPDATA").map(PathBuf::from) else {
        return SaveProgress::not_found();
    };
    let roots = find_save_roots_in(&app_data);
    let Some(slot) = find_latest_slot(&roots) else {
        return SaveProgress::not_found();
    };
    read_slot(&slot, known_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(slot: &str, file: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/saves/test/fixtures")
            .join(slot)
            .join(file)
    }

    fn load_known_ids() -> HashSet<u64> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../data/markers.json");
        let raw = fs::read_to_string(path).expect("markers.json fixture missing");
        let markers: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        markers
            .iter()
            .filter_map(|m| m.get("gameId")?.as_str()?.parse::<u64>().ok())
            .collect()
    }

    #[test]
    fn parses_fixture_slots() {
        let known = load_known_ids();
        let expected_scenes = [
            "Market",
            "TimeTemple",
            "TimeTemple",
            "TimeTemple",
            "HyruleField",
            "Market",
        ];
        let expected_ages = ["adult", "child", "child", "adult", "adult", "adult"];
        for (i, expected_scene) in expected_scenes.iter().enumerate() {
            let slot_name = format!("slot_0{i}");
            let prog = fs::read(fixture(&slot_name, "progress.sav")).unwrap();
            let got = parse_progress(&prog, &known).unwrap();
            assert_eq!(got.len(), 14, "slot {i}");
            assert_eq!(parse_progress_age(&prog).as_deref(), Some(expected_ages[i]), "progress age slot {i}");
            let cap = fs::read(fixture(&slot_name, "caption.sav")).unwrap();
            let (scene, _) = parse_caption(&cap).unwrap();
            assert_eq!(scene, *expected_scene);
            assert_eq!(parse_caption_age(&cap).as_deref(), Some(expected_ages[i]), "caption age slot {i}");
        }
    }

    #[test]
    fn rejects_corrupt_header() {
        let known = HashSet::new();
        assert!(parse_progress(&[0u8; 10], &known).is_err());
        let mut bad = vec![0u8; 128];
        bad[0..4].copy_from_slice(&[9, 9, 9, 9]);
        assert!(parse_progress(&bad, &known).is_err());
    }
}
