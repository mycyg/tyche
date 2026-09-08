import { useId } from 'preact/hooks';
import { ACTORS } from '../game/rules';

/** Source windows include the complete person and exclude adjacent cast art.
 * Coordinates stay in source pixels, independent of the dialogue's aspect ratio. */
const WINDOWS: Record<string, { file: string; x: number; width: number; sheetWidth: number; height: number; outline?:string }> = {
  // The first sheet's hands extend into the neighboring column near its foot.
  // Follow the empty gutter there so neither a hand nor the adjacent coat is cut in.
  tang: { file:'characters-a.webp', x:0, width:536, sheetWidth:1536, height:1024, outline:'0,0 536,0 536,850 520,1024 0,1024' },
  jiang: { file:'characters-a.webp', x:520, width:496, sheetWidth:1536, height:1024, outline:'16,0 496,0 496,600 488,1024 0,1024 16,850' },
  li: { file:'characters-a.webp', x:1008, width:528, sheetWidth:1536, height:1024, outline:'8,0 528,0 528,1024 0,1024 8,600' },
  zhou: { file:'characters-b.webp', x:0, width:548, sheetWidth:1536, height:1024 },
  ye: { file:'characters-b.webp', x:548, width:456, sheetWidth:1536, height:1024 },
  father: { file:'characters-b.webp', x:1004, width:532, sheetWidth:1536, height:1024 },
  mother: { file:'mother.webp', x:0, width:640, sheetWidth:640, height:960 },
};

export function DialoguePortrait({ actor }: { actor: string }) {
  const clipId = useId(), person = ACTORS[actor], source = person && WINDOWS[person.portrait];
  if (!source) return null;
  return <svg class="dialogue-actor-art" role="img" aria-label={`${person.name}，${person.role}`}
    viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="xMidYMid meet" focusable="false">
    <defs><clipPath id={clipId}>{source.outline?<polygon points={source.outline}/>:<rect width={source.width} height={source.height}/>}</clipPath></defs>
    <image href={`${import.meta.env.BASE_URL}art/${source.file}`} x={-source.x} y="0"
      width={source.sheetWidth} height={source.height} clip-path={`url(#${clipId})`}/>
  </svg>;
}
