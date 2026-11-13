// Live memory reader (N2) for Fritchii (lichii.exe) and Eden (eden.exe).
// Reads guest RAM read-only via Win32 VirtualQueryEx + ReadProcessMemory and caches
// the in-memory progress/caption addresses across polls.
use crate::saves::{
    parse_caption, parse_caption_age, parse_progress, parse_progress_age, SaveProgress, SceneSource,
    PROG_AGE_SCENE_OFF,
};
use std::collections::HashSet;
use std::ffi::c_void;
use std::mem::size_of;
use std::time::{Duration, Instant};

const SAVE_SIG: [u8; 8] = [0x04, 0x03, 0x02, 0x01, 0xeb, 0x80, 0x2d, 0x00];
const PROG_POS_OFF: usize = 0x1b4d4;
const PROG_SCENE_OFF: usize = 0x1c210;
const PROG_SUB_SCENE_OFF: usize = 0x1c250;
const PROG_READ_LEN: usize = 152_000;
const RUNTIME_SCENE_HEADER: usize = 12;
const RUNTIME_SCENE_LEN: usize = RUNTIME_SCENE_HEADER + 0xbc;

#[derive(Debug, Clone)]
pub struct LiveSnapshot {
    pub process: String,
    pub scene: Option<String>,
    pub parent_scene: Option<String>,
    pub pos: Option<[f32; 3]>,
    pub age: Option<String>,
    pub collected: Vec<String>,
}

pub struct MemoryReader {
    cached: Option<CachedTarget>,
    last_scan: Option<Instant>,
    pid: Option<u32>,
    disk_stamp: Option<f64>,
}

struct CachedTarget {
    progress: Vec<ProgressCandidate>,
    selected: Option<usize>,
    caption_addrs: Vec<usize>,
}

impl Default for MemoryReader {
    fn default() -> Self {
        Self {
            cached: None,
            last_scan: None,
            pid: None,
            disk_stamp: None,
        }
    }
}

/// Validates a NUL-terminated ASCII scene identifier at `offset` inside `buf`.
pub fn read_scene_string(buf: &[u8], offset: usize) -> Option<String> {
    if offset + 2 > buf.len() {
        return None;
    }
    let slice = &buf[offset..(offset + 48).min(buf.len())];
    let end = slice.iter().position(|&b| b == 0).unwrap_or(slice.len());
    if end < 2 {
        return None;
    }
    let bytes = &slice[..end];
    if !bytes.iter().all(|b| b.is_ascii_alphanumeric() || *b == b'_') {
        return None;
    }
    let s = std::str::from_utf8(bytes).ok()?;
    if s.chars().next()?.is_ascii_uppercase() {
        Some(s.to_string())
    } else {
        None
    }
}

/// Reads the active scene and its parent. Fritchii can store either order.
pub fn read_scene_pair(buf: &[u8]) -> (Option<String>, Option<String>) {
    let base = read_scene_string(buf, PROG_SCENE_OFF);
    let sub = read_scene_string(buf, PROG_SUB_SCENE_OFF);
    match (sub, base) {
        (Some(s), Some(b)) if s != b => {
            let age_scene = read_scene_string(buf, PROG_AGE_SCENE_OFF);
            let parent = age_scene.as_deref().and_then(|name| {
                name.strip_suffix("_Child").or_else(|| name.strip_suffix("_Adult"))
            });
            if parent == Some(s.as_str()) {
                (Some(b), Some(s))
            } else {
                (Some(s), Some(b))
            }
        }
        (Some(s), _) => (Some(s), None),
        (None, b) => (b, None),
    }
}

fn read_pos_vec(buf: &[u8], offset: usize) -> Option<[f32; 3]> {
    if offset + 12 > buf.len() {
        return None;
    }
    let p = [
        f32::from_le_bytes(buf[offset..offset + 4].try_into().ok()?),
        f32::from_le_bytes(buf[offset + 4..offset + 8].try_into().ok()?),
        f32::from_le_bytes(buf[offset + 8..offset + 12].try_into().ok()?),
    ];
    if p.iter().all(|v| v.is_finite() && v.abs() < 50_000.0) && p.iter().any(|v| v.abs() > 0.001) {
        Some(p)
    } else {
        None
    }
}


#[derive(Debug, PartialEq)]
struct SceneSample {
    scene: String,
    parent: Option<String>,
    pos: Option<[f32; 3]>,
    age: Option<String>,
}

struct ProgressCandidate {
    address: usize,
    runtime: bool,
    previous: Option<SceneSample>,
    last_activity: Option<Instant>,
}

fn sample_scene(bytes: &[u8]) -> Option<SceneSample> {
    if !bytes.starts_with(&SAVE_SIG) {
        return None;
    }
    let (scene, parent) = read_scene_pair(bytes);
    Some(SceneSample {
        scene: scene?,
        parent,
        pos: read_pos_vec(bytes, PROG_POS_OFF),
        age: parse_progress_age(bytes),
    })
}

fn sample_runtime_scene(bytes: &[u8]) -> Option<SceneSample> {
    let bytes = bytes.get(..RUNTIME_SCENE_LEN)?;
    let pointer = |offset| {
        u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
    };
    let scene_ptr = pointer(0);
    // The game's inline scene name is followed by two pointers into the
    // same object. Their offsets identify the layout after a process restart.
    if scene_ptr == 0
        || bytes[8..12] != [128, 0, 0, 0]
        || scene_ptr.checked_add(0x124) != Some(pointer(RUNTIME_SCENE_HEADER + 0xa4))
        || scene_ptr.checked_add(0x134) != Some(pointer(RUNTIME_SCENE_HEADER + 0xb4))
    {
        return None;
    }
    Some(SceneSample {
        scene: read_scene_string(bytes, RUNTIME_SCENE_HEADER)?,
        parent: None,
        pos: None,
        age: None,
    })
}

impl ProgressCandidate {
    fn rank(
        &mut self,
        sample: Option<SceneSample>,
        selected: Option<usize>,
        now: Instant,
        disk_unchanged: bool,
    ) -> Option<(Instant, u8, bool)> {
        let rank = sample.as_ref().and_then(|current| {
            let activity = self.previous.as_ref().map_or(0, |previous| {
                if current.scene != previous.scene || current.parent != previous.parent {
                    2
                } else {
                    u8::from(matches!((current.pos, previous.pos), (Some(a), Some(b)) if a != b))
                }
            });
            // A save can update several copies at once. Only activity observed
            // independently of a disk write can establish a live source.
            if disk_unchanged && activity > 0 {
                self.last_activity = Some(now);
            }
            self.last_activity.map(|last| (last, activity, selected == Some(self.address)))
        });
        if sample.is_none() {
            self.last_activity = None;
        }
        self.previous = sample;
        rank
    }
}

#[cfg(windows)]
mod win {
    use super::*;

    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    struct MemoryBasicInformation {
        base_address: usize,
        allocation_base: usize,
        allocation_protect: u32,
        partition_id: u16,
        region_size: usize,
        state: u32,
        protect: u32,
        mem_type: u32,
    }

    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; 260],
    }

    const PROCESS_VM_READ: u32 = 0x0010;
    const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
    const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    const INVALID_HANDLE: isize = -1;
    const MEM_COMMIT: u32 = 0x1000;
    const MEM_MAPPED: u32 = 0x40000;
    const PAGE_NOACCESS: u32 = 0x01;
    const PAGE_GUARD: u32 = 0x100;
    const PAGE_READWRITE: u32 = 0x04;

    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
        fn Process32FirstW(snap: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snap: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn CloseHandle(h: *mut c_void) -> i32;
        fn VirtualQueryEx(h: *mut c_void, addr: usize, mbi: *mut MemoryBasicInformation, len: usize) -> usize;
        fn ReadProcessMemory(h: *mut c_void, base: usize, buf: *mut u8, size: usize, read: *mut usize) -> i32;
    }

    struct HandleGuard(*mut c_void);
    impl Drop for HandleGuard {
        fn drop(&mut self) {
            if !self.0.is_null() && self.0 as isize != INVALID_HANDLE {
                unsafe { CloseHandle(self.0) };
            }
        }
    }

    pub fn find_emulator_pid() -> Option<(u32, String)> {
        let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snap.is_null() || snap as isize == INVALID_HANDLE {
            return None;
        }
        let _guard = HandleGuard(snap);
        let mut entry: ProcessEntry32W = unsafe { std::mem::zeroed() };
        entry.dw_size = size_of::<ProcessEntry32W>() as u32;
        if unsafe { Process32FirstW(snap, &mut entry) } == 0 {
            return None;
        }
        loop {
            let end = entry.sz_exe_file.iter().position(|&c| c == 0).unwrap_or(260);
            let name = String::from_utf16_lossy(&entry.sz_exe_file[..end]);
            let lower = name.to_ascii_lowercase();
            if lower == "lichii.exe" || lower == "eden.exe" {
                return Some((entry.th32_process_id, name));
            }
            if unsafe { Process32NextW(snap, &mut entry) } == 0 {
                break;
            }
        }
        None
    }

    fn read_mem(h: *mut c_void, addr: usize, buf: &mut [u8]) -> usize {
        let mut got = 0usize;
        if unsafe { ReadProcessMemory(h, addr, buf.as_mut_ptr(), buf.len(), &mut got) } == 0 {
            0
        } else {
            got
        }
    }

    fn discover_targets(h: *mut c_void) -> Option<CachedTarget> {
        let mut addr = 0usize;
        let mut mbi = MemoryBasicInformation::default();
        let mut allocs = std::collections::BTreeMap::<usize, usize>::new();
        let mut all_regions = Vec::new();
        while unsafe { VirtualQueryEx(h, addr, &mut mbi, size_of::<MemoryBasicInformation>()) } != 0 {
            if mbi.state == MEM_COMMIT
                && (mbi.protect & PAGE_NOACCESS) == 0
                && (mbi.protect & PAGE_GUARD) == 0
                && mbi.mem_type == MEM_MAPPED
                && (mbi.protect & PAGE_READWRITE) != 0
                && mbi.region_size >= 64 * 1024
            {
                *allocs.entry(mbi.allocation_base).or_default() += mbi.region_size;
                all_regions.push(mbi);
            }
            match mbi.base_address.checked_add(mbi.region_size) {
                Some(next) if next > addr => addr = next,
                _ => break,
            }
        }
        let guest_base = allocs
            .into_iter()
            .filter(|(_, sz)| *sz >= 512 * 1024 * 1024)
            .max_by_key(|x| x.1)?
            .0;

        // Heap / save working buffers sit in guest RAM above +0x170000000
        let scan_min = guest_base + 0x170000000;
        const CHUNK: usize = 4 * 1024 * 1024;
        let mut buf = vec![0u8; CHUNK + RUNTIME_SCENE_LEN];
        let mut progress = Vec::new();
        let mut caption_addrs = Vec::new();
        let mut probe = vec![0u8; PROG_SUB_SCENE_OFF + 48];

        for r in all_regions {
            if r.allocation_base != guest_base || r.base_address + r.region_size <= scan_min {
                continue;
            }
            let start_off = scan_min.saturating_sub(r.base_address);
            let mut off = start_off;
            while off < r.region_size {
                let to_read = (r.region_size - off).min(buf.len());
                let got = read_mem(h, r.base_address + off, &mut buf[..to_read]);
                if got < 16 {
                    off += CHUNK;
                    continue;
                }
                let s = &buf[..got];
                let mut i = 0usize;
                while i + 12 <= s.len() {
                    if i >= 8 && s[i] == 128 && s[i + 1..i + 4] == [0, 0, 0] {
                        let start = i - 8;
                        if let Some(sample) = s.get(start..start + RUNTIME_SCENE_LEN)
                            .and_then(sample_runtime_scene)
                        {
                            let address = r.base_address + off + start;
                            if progress.last().is_none_or(|c: &ProgressCandidate| c.address != address) {
                                progress.push(ProgressCandidate {
                                    address, runtime: true, previous: Some(sample), last_activity: None,
                                });
                            }
                        }
                    }
                    if s[i] == SAVE_SIG[0] && &s[i..i + 8] == &SAVE_SIG {
                        let abs = r.base_address + off + i;
                        let pgot = read_mem(h, abs, &mut probe);
                        let bytes = &probe[..pgot];
                        let sample = sample_scene(bytes);
                        if sample.is_none() && pgot >= 0x2e0 && parse_caption(&bytes[..pgot.min(1024)]).is_ok() {
                            if !caption_addrs.contains(&abs) {
                                caption_addrs.push(abs);
                            }
                        } else if pgot == probe.len() {
                            if progress.last().is_none_or(|candidate: &ProgressCandidate| candidate.address != abs) {
                                progress.push(ProgressCandidate { address: abs, runtime: false, previous: sample, last_activity: None });
                            }
                        }
                        i += 8;
                        continue;
                    }
                    i += 4;
                }
                off += CHUNK;
            }
        }

        if progress.is_empty() && caption_addrs.is_empty() {
            return None;
        }
        Some(CachedTarget { progress, selected: None, caption_addrs })
    }

    fn select_progress(target: &mut CachedTarget, h: *mut c_void, now: Instant, disk_unchanged: bool) {
        let mut probe = vec![0; PROG_SUB_SCENE_OFF + 48];
        let mut best = None;
        for candidate in &mut target.progress {
            let sample = if candidate.runtime {
                let got = read_mem(h, candidate.address, &mut probe[..RUNTIME_SCENE_LEN]);
                sample_runtime_scene(&probe[..got])
            } else {
                let got = read_mem(h, candidate.address, &mut probe);
                sample_scene(&probe[..got])
            };
            if let Some(rank) = candidate.rank(sample, target.selected, now, disk_unchanged) {
                let rank = (candidate.runtime, rank);
                if best.is_none_or(|(best_rank, _)| rank > best_rank) {
                    best = Some((rank, candidate.address));
                }
            }
        }
        target.selected = best.map(|(_, address)| address);
    }

    pub fn poll(reader: &mut MemoryReader, known_ids: &HashSet<u64>, disk_stamp: f64) -> Option<LiveSnapshot> {
        let emulator = find_emulator_pid();
        let pid = emulator.as_ref().map(|(pid, _)| *pid);
        if reader.pid != pid {
            *reader = MemoryReader { pid, ..MemoryReader::default() };
        }
        let (pid, proc_name) = emulator?;
        let h = unsafe { OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, 0, pid) };
        if h.is_null() {
            reader.cached = None;
            return None;
        }
        let _guard = HandleGuard(h);

        let now = Instant::now();
        let disk_unchanged = reader.disk_stamp.replace(disk_stamp) == Some(disk_stamp);
        if let Some(target) = &mut reader.cached {
            select_progress(target, h, now, disk_unchanged);
        }
        let needs_scan = reader.cached.as_ref().is_none_or(|target| target.selected.is_none());
        if needs_scan && reader.last_scan.is_none_or(|t| t.elapsed() >= Duration::from_secs(8)) {
            if let Some(mut discovered) = discover_targets(h) {
                if let Some(previous) = reader.cached.take() {
                    let mut observed: std::collections::HashMap<_, _> = previous.progress
                        .into_iter()
                        .map(|candidate| (candidate.address, candidate))
                        .collect();
                    for candidate in &mut discovered.progress {
                        if let Some(previous) = observed.remove(&candidate.address) {
                            *candidate = previous;
                        }
                    }
                }
                reader.cached = Some(discovered);
            }
            reader.last_scan = Some(Instant::now());
        }

        let target = reader.cached.as_mut()?;
        let mut live = LiveSnapshot {
            process: proc_name,
            scene: None,
            parent_scene: None,
            pos: None,
            age: None,
            collected: Vec::new(),
        };

        if let Some(candidate) = target.progress.iter().find(|c| Some(c.address) == target.selected) {
            if let Some(sample) = &candidate.previous {
                live.scene = Some(sample.scene.clone());
                live.parent_scene.clone_from(&sample.parent);
                live.pos = sample.pos;
                live.age.clone_from(&sample.age);
            }
            if !candidate.runtime {
                let mut buf = vec![0; PROG_READ_LEN];
                let got = read_mem(h, candidate.address, &mut buf);
                let bytes = &buf[..got];
                if bytes.starts_with(&SAVE_SIG) {
                    live.collected = parse_progress(bytes, known_ids).unwrap_or_default();
                }
            }
        }

        if live.scene.is_some() && live.age.is_none() {
            // Caption buffers may be copies of a save. Only use them for age corroboration.
            let mut buf = [0; 1024];
            for &address in &target.caption_addrs {
                let got = read_mem(h, address, &mut buf);
                let bytes = &buf[..got];
                if bytes.starts_with(&SAVE_SIG)
                    && parse_caption(bytes).ok().is_some_and(|(scene, _)| {
                        live.scene.as_deref() == Some(scene.as_str())
                    })
                {
                    live.age = parse_caption_age(bytes);
                    if live.age.is_some() {
                        break;
                    }
                }
            }
        }
        Some(live)
    }
}

#[cfg(not(windows))]
mod win {
    use super::*;
    pub fn find_emulator_pid() -> Option<(u32, String)> {
        None
    }
    pub fn poll(_reader: &mut MemoryReader, _known_ids: &HashSet<u64>, _disk_stamp: f64) -> Option<LiveSnapshot> {
        None
    }
}

pub fn find_emulator_pid() -> Option<(u32, String)> {
    win::find_emulator_pid()
}

/// Combines live emulator memory (N2) with disk save (N1) using N2 -> N1 fallback.
pub fn poll_combined(
    reader: &mut MemoryReader,
    disk: SaveProgress,
    known_ids: &HashSet<u64>,
) -> SaveProgress {
    let Some(live) = win::poll(reader, known_ids, disk.mtime_ms) else {
        return disk;
    };
    merge_progress(disk, live)
}

fn merge_progress(disk: SaveProgress, live: LiveSnapshot) -> SaveProgress {
    if live.scene.is_none() && live.collected.is_empty() {
        return disk;
    }

    let mut merged: HashSet<String> = disk.collected.into_iter().collect();
    merged.extend(live.collected);
    let mut collected: Vec<String> = merged.into_iter().collect();
    collected.sort();

    let (scene_source, scene, parent_scene, pos, age) = if live.scene.is_some() {
        (SceneSource::Memory, live.scene, live.parent_scene, live.pos, live.age.or(disk.age))
    } else {
        (disk.scene_source, disk.scene, disk.parent_scene, disk.pos, disk.age)
    };

    SaveProgress {
        found: true,
        ok: true,
        source: "memory".into(),
        scene_source,
        emulator: live.process,
        slot: if disk.slot.is_empty() { "live".into() } else { disk.slot },
        dir: disk.dir,
        mtime_ms: disk.mtime_ms,
        collected,
        scene,
        parent_scene,
        pos,
        age,
        errors: disk.errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_relocated_runtime_scene_and_rejects_unrelated_inline_strings() {
        for pointer in [0x210de8286c_u64, 0x217fc0286c] {
            let mut bytes = [0; RUNTIME_SCENE_LEN];
            bytes[..8].copy_from_slice(&pointer.to_le_bytes());
            bytes[8] = 128;
            bytes[RUNTIME_SCENE_HEADER..RUNTIME_SCENE_HEADER + 11].copy_from_slice(b"HyruleField");
            for (offset, target) in [(0xa4, 0x124), (0xb4, 0x134)] {
                let start = RUNTIME_SCENE_HEADER + offset;
                bytes[start..start + 8].copy_from_slice(&(pointer + target).to_le_bytes());
            }
            assert_eq!(sample_runtime_scene(&bytes).unwrap().scene, "HyruleField");
            bytes[RUNTIME_SCENE_HEADER..RUNTIME_SCENE_HEADER + 11].copy_from_slice(b"LonLonRanch");
            assert_eq!(sample_runtime_scene(&bytes).unwrap().scene, "LonLonRanch");
            bytes[RUNTIME_SCENE_HEADER + 0xb4] ^= 1;
            assert!(sample_runtime_scene(&bytes).is_none());
        }
    }

    #[test]
    fn chooses_a_changing_candidate_and_rejects_a_saved_copy() {
        fn sample(scene: &str) -> SceneSample {
            SceneSample { scene: scene.into(), parent: None, pos: None, age: None }
        }
        let mut stale = ProgressCandidate { address: 1, runtime: false, previous: None, last_activity: None };
        let mut live = ProgressCandidate { address: 2, runtime: true, previous: None, last_activity: None };
        let now = Instant::now();
        assert_eq!(stale.rank(Some(sample("LakeHylia")), None, now, true), None);
        assert_eq!(live.rank(Some(sample("LakeHylia")), None, now, true), None);
        assert_eq!(stale.rank(Some(sample("HyruleField")), None, now, false), None);
        assert_eq!(stale.rank(Some(sample("HyruleField")), None, now, true), None);

        assert!(live.rank(Some(sample("LonLonRanch")), None, now, true).is_some());
        assert!(live.rank(Some(sample("LonLonRanch")), Some(2), now, true).is_some());
        assert_eq!(live.rank(None, Some(2), now, true), None);
        assert_eq!(live.rank(Some(sample("LonLonRanch")), Some(2), now, true), None);
    }

    #[test]
    fn mixed_progress_does_not_mark_a_disk_scene_live() {
        let mut disk = SaveProgress::not_found();
        disk.scene = Some("LakeHylia".into());
        disk.scene_source = SceneSource::Save;
        disk.pos = Some([1.0, 2.0, 3.0]);
        let mut live = LiveSnapshot {
            process: "lichii.exe".into(),
            scene: None,
            parent_scene: None,
            pos: None,
            age: None,
            collected: vec!["42".into()],
        };
        let combined = merge_progress(disk.clone(), live.clone());
        assert_eq!(combined.scene_source, SceneSource::Save);
        assert_eq!(combined.scene, disk.scene);
        assert_eq!(combined.pos, disk.pos);
        assert_eq!(combined.collected, ["42"]);

        live.scene = Some("LonLonRanch".into());
        let combined = merge_progress(disk, live);
        assert_eq!(combined.scene_source, SceneSource::Memory);
        assert_eq!(combined.scene.as_deref(), Some("LonLonRanch"));
        assert_eq!(combined.pos, None);
    }

    #[test]
    fn validates_scene_names_strictly() {
        let mut buf = vec![0u8; 64];
        buf[10..19].copy_from_slice(b"ZoraRiver");
        assert_eq!(read_scene_string(&buf, 10), Some("ZoraRiver".into()));
        assert_eq!(read_scene_string(&buf, 11), None); // lowercase 'o' rejected
        buf[2] = b'a';
        assert_eq!(read_scene_string(&buf, 2), None); // lowercase start rejected
        buf[20..25].copy_from_slice(b"A!bcd");
        assert_eq!(read_scene_string(&buf, 20), None);
    }

    #[test]
    fn detects_age_from_live_progress_buffer() {
        let mut buf = vec![0u8; PROG_READ_LEN];
        buf[0..8].copy_from_slice(&SAVE_SIG);
        buf[0x1bcc4..0x1bcc4 + 12].copy_from_slice(b"Market_Child");
        assert_eq!(parse_progress_age(&buf).as_deref(), Some("child"));
        buf[0x1bcc4..0x1bcc4 + 12].copy_from_slice(b"Market_Adult");
        assert_eq!(parse_progress_age(&buf).as_deref(), Some("adult"));
    }

    #[test]
    fn reads_sub_scene_with_parent_fallback() {
        let mut buf = vec![0u8; PROG_READ_LEN];
        buf[0x1c210..0x1c210 + 11].copy_from_slice(b"HyruleField");
        assert_eq!(
            read_scene_pair(&buf),
            (Some("HyruleField".into()), None)
        );
        buf[0x1c250..0x1c250 + 11].copy_from_slice(b"LonLonRanch");
        assert_eq!(
            read_scene_pair(&buf),
            (Some("LonLonRanch".into()), Some("HyruleField".into()))
        );
    }

    #[test]
    fn resolves_lake_hylia_in_both_observed_scene_orders() {
        let mut buf = vec![0u8; PROG_READ_LEN];
        let age_scene = b"HyruleField_Child";
        buf[PROG_AGE_SCENE_OFF..PROG_AGE_SCENE_OFF + age_scene.len()].copy_from_slice(age_scene);

        for (base, sub) in [("LakeHylia", "HyruleField"), ("HyruleField", "LakeHylia")] {
            for (offset, scene) in [(PROG_SCENE_OFF, base), (PROG_SUB_SCENE_OFF, sub)] {
                buf[offset..offset + 48].fill(0);
                buf[offset..offset + scene.len()].copy_from_slice(scene.as_bytes());
            }
            assert_eq!(read_scene_pair(&buf), (Some("LakeHylia".into()), Some("HyruleField".into())));
        }
    }
}
