/** Playback follows elapsed time, including delayed frames; hidden-tab time is excluded by the caller. */
export function advanceTime(position: number, elapsedMs: number, start: number, end: number, speed = 1): number {
    if (![position, elapsedMs, start, end, speed].every(Number.isFinite) || elapsedMs < 0 || end <= start || speed <= 0) {
        throw new Error('Invalid playback interval');
    }
    const span = end - start;
    const progress = position - start + elapsedMs / 36000 * speed * span;
    return start + ((progress % span) + span) % span;
}
