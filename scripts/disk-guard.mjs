import { statfs } from 'node:fs/promises';
export function assertHeadroom(free, expected = 128 * 1024 ** 2) {
  if (
    !Number.isFinite(free) ||
    !Number.isFinite(expected) ||
    expected < 0 ||
    free - expected < 10 * 1024 ** 3
  )
    throw new Error(
      'Disk hold: preserve 10 GiB free plus operation headroom. No browser/download started.',
    );
}
export async function checkDisk(expected) {
  const s = await statfs('/');
  const free = s.bavail * s.bsize;
  assertHeadroom(free, expected);
  return free;
}
