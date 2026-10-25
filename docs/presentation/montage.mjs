// Montage de la vidéo de présentation : chaque segment tourné par record.mjs
// (images horodatées) devient une vidéo à cadence fixe, puis les segments sont
// enchaînés en fondu, avec la musique originale et des chapitres.
// Résultat dans $VIDEO_WORKDIR/out : sureau-presentation.mp4, affiche.jpg et
// planche.jpg (une image toutes les 2 s, pour relire le montage d'un coup d'œil).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const work = join(process.env.VIDEO_WORKDIR ?? join(tmpdir(), 'sureau-presentation'), '/');
const music = process.env.VIDEO_MUSIC ?? fileURLToPath(new URL('./musique-originale.m4a', import.meta.url));
const out = work + 'out/';
mkdirSync(out, { recursive: true });
const FPS = 30;
const FADE = 0.6;
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const segments = JSON.parse(readFileSync(work + 'segments/segments.json', 'utf8'));
const chapters = {
  ouverture: 'Installation et premier compte', inventaire: 'Inventaire partagé', exploration: 'Exploration 3D',
  personnaliser: 'Personnalisation', etages: 'Étages et salles', equipe: 'Travail en équipe', fin: 'Exploitation',
};

// 1. Une vidéo intermédiaire de haute qualité par segment, à cadence fixe : la
// durée de chaque image vient de son horodatage de capture.
const durations = [];
for (const [index, segment] of segments.entries()) {
  const lines = ['ffconcat version 1.0'];
  segment.frames.forEach((frame, i) => {
    const next = segment.frames[i + 1];
    const duration = next ? next.t - frame.t : Math.max(1 / FPS, segment.end - frame.wall);
    lines.push(`file '${frame.file.replace(/\\/g, '/')}'`, `duration ${duration.toFixed(6)}`);
  });
  lines.push(`file '${segment.frames.at(-1).file.replace(/\\/g, '/')}'`);
  const list = `${out}seg-${index}.ffconcat`;
  writeFileSync(list, lines.join('\n'));
  const total = segment.frames.at(-1).t - segment.frames[0].t + Math.max(1 / FPS, segment.end - segment.frames.at(-1).wall);
  durations.push(Math.floor(total * FPS) / FPS);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
    '-t', String(durations.at(-1)), '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', `${out}seg-${index}.mp4`]);
  console.log(`${segment.name} : ${durations.at(-1).toFixed(2)} s`);
}

// 2. Enchaînement en fondu, musique (complétée par du silence) et chapitres.
const inputs = segments.flatMap((_, i) => ['-i', `${out}seg-${i}.mp4`]);
let filter = '';
let previous = '[0:v]';
let offset = 0;
const starts = [0];
for (let i = 1; i < segments.length; i++) {
  offset += durations[i - 1] - FADE;
  starts.push(offset);
  const label = i === segments.length - 1 ? '[v]' : `[x${i}]`;
  filter += `${previous}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
  previous = label;
}
const total = offset + durations.at(-1);
const withMusic = existsSync(music);
const audioInput = withMusic ? ['-i', music] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
const audioIndex = segments.length;
filter += withMusic
  ? `[${audioIndex}:a]apad,atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=1.5,afade=t=out:st=${(total - 3.5).toFixed(3)}:d=3.5,loudnorm=I=-19:TP=-2:LRA=7,aresample=48000[a]`
  : `[${audioIndex}:a]atrim=0:${total.toFixed(3)}[a]`;

const meta = [';FFMETADATA1', 'title=Sureau — présentation du produit', 'artist=Sureau', 'comment=Interface réelle, données de démonstration fictives. Musique originale.'];
segments.forEach((segment, i) => {
  const end = i + 1 < starts.length ? starts[i + 1] : total;
  meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(starts[i] * 1000)}`, `END=${Math.round(end * 1000)}`, `title=${chapters[segment.name] ?? segment.name}`);
});
writeFileSync(`${out}chapters.ffmetadata`, meta.join('\n'));

ffmpeg([...inputs, ...audioInput, '-i', `${out}chapters.ffmetadata`, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
  '-map_metadata', String(audioIndex + 1), '-map_chapters', String(audioIndex + 1),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', process.env.VIDEO_CRF ?? '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-g', String(FPS * 4), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', `${out}sureau-presentation.mp4`]);
console.log(`total : ${total.toFixed(1)} s${withMusic ? '' : ' (sans musique)'}`);

// 3. Affiche (gros plan 3D sur un poste) et planche de relecture.
ffmpeg(['-ss', String(starts[2] + 14), '-i', `${out}sureau-presentation.mp4`, '-frames:v', '1', '-q:v', '2', `${out}affiche.jpg`]);
ffmpeg(['-i', `${out}sureau-presentation.mp4`, '-vf', 'fps=1/2,scale=480:-1,tile=6x11:padding=4', '-frames:v', '1', '-q:v', '3', `${out}planche.jpg`]);
