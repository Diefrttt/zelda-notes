import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../test/fixtures');

const MAGIC = Buffer.from([0x04, 0x03, 0x02, 0x01]);
const SCENES = ['Market', 'TimeTemple', 'TimeTemple', 'TimeTemple', 'HyruleField', 'Market'];
const AGES = ['adult', 'child', 'child', 'adult', 'adult', 'adult'];

const GAME_IDS = [
  4565265801822094851n,
  5936534468710061389n,
  8470399761714006011n,
  8695975724114049706n,
  11513774157335944149n,
  13609975487234437568n,
  13690401647626643497n,
  13852835165271311030n,
  14107117960174262321n,
  15118290503807073158n,
  17501688996789643983n,
  17608884438514432711n,
  17948245526767051747n,
  18075358844331090388n,
];

export function generateSlotFiles(slotIndex) {
  const scene = SCENES[slotIndex];
  const age = AGES[slotIndex];
  const isAdult = age === 'adult';
  const isChild = age === 'child';
  const ageSuffix = isAdult ? 'Adult' : 'Child';

  // progress.sav (size = 0x1bd10, zero-filled except verified offsets)
  const progressBuf = Buffer.alloc(0x1bd10);
  MAGIC.copy(progressBuf, 0x00);

  GAME_IDS.forEach((id, idx) => {
    progressBuf.writeBigUInt64LE(id, 0x200 + idx * 8);
  });

  progressBuf.writeUInt32LE(0x07ad4938, 0x540);
  progressBuf.writeUInt32LE(isAdult ? 1 : 0, 0x544);

  progressBuf.writeUInt32LE(0xcea220d3, 0x11980);
  progressBuf.writeUInt32LE(isChild ? 1 : 0, 0x11984);

  progressBuf.write(`${scene}_${ageSuffix}\0`, 0x1bcc4, 'latin1');

  // caption.sav (size = 1024, zero-filled except verified offsets)
  const captionBuf = Buffer.alloc(1024);
  MAGIC.copy(captionBuf, 0x00);

  captionBuf.writeUInt32LE(0x96e59c05, 0xa0);
  captionBuf.writeUInt32LE(isAdult ? 1 : 0, 0xa4);

  captionBuf.writeFloatLE(14.5 + slotIndex, 0x2a0);
  captionBuf.writeFloatLE(102.0 + slotIndex, 0x2a4);
  captionBuf.writeFloatLE(55.0 + slotIndex, 0x2a8);

  captionBuf.write(`${scene}\0`, 0x2ac, 'latin1');
  captionBuf.write(`${scene}/${scene}_${ageSuffix}\0`, 0x2ec, 'latin1');

  return { progressBuf, captionBuf };
}

export function writeAllFixtures(targetDir = FIXTURES_DIR) {
  for (let i = 0; i < 6; i++) {
    const slotName = `slot_0${i}`;
    const slotDir = path.join(targetDir, slotName);
    mkdirSync(slotDir, { recursive: true });

    const { progressBuf, captionBuf } = generateSlotFiles(i);
    writeFileSync(path.join(slotDir, 'progress.sav'), progressBuf);
    writeFileSync(path.join(slotDir, 'caption.sav'), captionBuf);
  }
}

if (process.argv[1] === __filename) {
  writeAllFixtures();
  console.log(`Successfully generated deterministic fixtures for 6 slots under ${FIXTURES_DIR}`);
}
