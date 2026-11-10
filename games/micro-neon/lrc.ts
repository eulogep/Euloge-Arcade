/** Minimal parser for .lrc synchronised lyrics: "[mm:ss.xx] text". */
export interface LrcLine {
  time: number;
  text: string;
}

const TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(source: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const tags = [...raw.matchAll(TAG)];
    if (tags.length === 0) continue;
    const text = raw.replace(TAG, '').trim();
    for (const [, mm, ss, frac = '0'] of tags) {
      const time = Number(mm) * 60 + Number(ss) + Number(frac) / 10 ** frac.length;
      lines.push({time, text});
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line being sung at `t` seconds, or -1 before the first line. */
export function currentLrcLine(lines: LrcLine[], t: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length && lines[i].time <= t; i++) idx = i;
  return idx;
}
