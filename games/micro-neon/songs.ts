/**
 * Built-in songs: traditional French songs in the public domain (lyrics and
 * melodies). Each syllable is one note: [syllable, midi, beats]. Melodies are
 * written around middle C (C4 = 60); singers in another octave are not penalised.
 */
export type SongNote = [syllable: string, midi: number, beats: number];

export interface Song {
  id: string;
  title: string;
  credit: string;
  bpm: number;
  lines: SongNote[][];
}

export interface TimedNote {
  line: number;
  index: number;
  syllable: string;
  midi: number;
  /** Seconds from the start of the song (after the count-in). */
  start: number;
  end: number;
}

const TRAD = 'Chanson traditionnelle française · domaine public';

const clairLigne = (s: string[]): SongNote[] => {
  const melody: [number, number][] = [[60, 1], [60, 1], [60, 1], [62, 1], [64, 2], [62, 2], [60, 1], [64, 1], [62, 1], [62, 1], [60, 4]];
  return s.map((syl, i) => [syl, melody[i][0], melody[i][1]]);
};

export const SONGS: Song[] = [
  {
    id: 'gamme',
    title: 'Échauffement : la gamme',
    credit: 'Exercice vocal',
    bpm: 80,
    lines: [[['Do ', 60, 2], ['ré ', 62, 2], ['mi ', 64, 2], ['fa ', 65, 2], ['sol ', 67, 2], ['la ', 69, 2], ['si ', 71, 2], ['do !', 72, 4]]],
  },
  {
    id: 'au-clair-de-la-lune',
    title: 'Au clair de la lune',
    credit: TRAD,
    bpm: 100,
    lines: [
      clairLigne(['Au ', 'clair ', 'de ', 'la ', 'lu', 'ne, ', 'mon ', 'a', 'mi ', 'Pier', 'rot,']),
      clairLigne(['Prê', 'te-', 'moi ', 'ta ', 'plu', 'me ', 'pour ', 'é', 'crire ', 'un ', 'mot.']),
      [['Ma ', 62, 1], ['chan', 62, 1], ['delle ', 62, 1], ['est ', 62, 1], ['mor', 57, 2], ['te, ', 57, 2], ['je ', 62, 1], ['n’ai ', 60, 1], ['plus ', 59, 1], ['de ', 57, 1], ['feu.', 55, 4]],
      clairLigne(['Ou', 'vre-', 'moi ', 'ta ', 'por', 'te ', 'pour ', 'l’a', 'mour ', 'de ', 'Dieu.']),
    ],
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques',
    credit: TRAD,
    bpm: 110,
    lines: [
      [['Frè', 60, 1], ['re ', 62, 1], ['Jac', 64, 1], ['ques, ', 60, 1], ['frè', 60, 1], ['re ', 62, 1], ['Jac', 64, 1], ['ques, ', 60, 1]],
      [['dor', 64, 1], ['mez-', 65, 1], ['vous ? ', 67, 2], ['dor', 64, 1], ['mez-', 65, 1], ['vous ?', 67, 2]],
      [['Son', 67, 0.5], ['nez ', 69, 0.5], ['les ', 67, 0.5], ['ma', 65, 0.5], ['ti', 64, 1], ['nes, ', 60, 1], ['son', 67, 0.5], ['nez ', 69, 0.5], ['les ', 67, 0.5], ['ma', 65, 0.5], ['ti', 64, 1], ['nes,', 60, 1]],
      [['Ding, ', 60, 1], ['daing, ', 55, 1], ['dong. ', 60, 2], ['Ding, ', 60, 1], ['daing, ', 55, 1], ['dong.', 60, 2]],
    ],
  },
  {
    id: 'ah-vous-dirai-je-maman',
    title: 'Ah ! vous dirai-je, maman',
    credit: TRAD,
    bpm: 100,
    lines: [
      [['Ah ! ', 60, 1], ['vous ', 60, 1], ['di', 67, 1], ['rai-', 67, 1], ['je, ', 69, 1], ['ma', 69, 1], ['man,', 67, 2]],
      [['Ce ', 65, 1], ['qui ', 65, 1], ['cau', 64, 1], ['se ', 64, 1], ['mon ', 62, 1], ['tour', 62, 1], ['ment ?', 60, 2]],
      [['Pa', 67, 1], ['pa ', 67, 1], ['veut ', 65, 1], ['que ', 65, 1], ['je ', 64, 1], ['rai', 64, 1], ['sonne', 62, 2]],
      [['Comme ', 67, 1], ['u', 67, 1], ['ne ', 65, 1], ['gran', 65, 1], ['de ', 64, 1], ['per', 64, 1], ['sonne.', 62, 2]],
      [['Moi ', 60, 1], ['je ', 60, 1], ['dis ', 67, 1], ['que ', 67, 1], ['les ', 69, 1], ['bon', 69, 1], ['bons', 67, 2]],
      [['Va', 65, 1], ['lent ', 65, 1], ['mieux ', 64, 1], ['que ', 64, 1], ['la ', 62, 1], ['rai', 62, 1], ['son.', 60, 2]],
    ],
  },
];

/** Flattens a song into timed notes. `transpose` shifts every note by semitones. */
export function timeline(song: Song, transpose = 0): TimedNote[] {
  const spb = 60 / song.bpm;
  const out: TimedNote[] = [];
  let beat = 0;
  song.lines.forEach((line, l) =>
    line.forEach(([syllable, midi, beats], index) => {
      out.push({line: l, index, syllable, midi: midi + transpose, start: beat * spb, end: (beat + beats) * spb});
      beat += beats;
    }),
  );
  return out;
}

export const songDuration = (song: Song) => {
  const notes = timeline(song);
  return notes[notes.length - 1].end;
};

const NOTE_NAMES = ['do', 'do♯', 'ré', 'ré♯', 'mi', 'fa', 'fa♯', 'sol', 'sol♯', 'la', 'la♯', 'si'];
export const noteName = (midi: number) => NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];
