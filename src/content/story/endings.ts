import PROSE from './ending-prose.json';
import CATALOG from './ending-catalog.json';

/** A line of dialogue already present in the printed paragraphs; never rendered or narrated a second time. */
export interface StorySpeechLine {
  speaker: string;
  text: string;
}
export interface StoryEnding {
  id: string;
  title: string;
  author: string;
  scene: string;
  paragraphs: string[];
  speech: StorySpeechLine[];
}
interface ProseEntry {
  id: string;
  title: string;
  author: string;
  paragraphs: string[];
  speech: StorySpeechLine[];
}
interface CatalogEntry {
  id: string;
  title: string;
  author: string;
  sceneKey: string;
  scene: string;
}

export const STORY_ENDING_IDS = [
  'END-01', 'END-02', 'END-03', 'END-04', 'END-05', 'END-06', 'END-07', 'END-08', 'END-09', 'END-10',
  'END-11', 'END-12', 'END-13', 'END-14', 'END-15', 'END-16', 'END-17', 'END-18', 'END-19', 'END-20',
  'END-21', 'END-22', 'END-23', 'END-24', 'END-25', 'END-26', 'END-27', 'END-28', 'END-29', 'END-30',
  'END-31', 'END-32', 'END-33', 'END-34', 'END-35', 'END-36', 'END-37', 'END-38', 'END-39', 'END-40',
] as const;
export type StoryEndingId = typeof STORY_ENDING_IDS[number];

/** The one non-dark main ending; every other story key ends in loss, prison, illness or estrangement. */
export const TRUE_ENDING_ID: StoryEndingId = 'END-40';

const catalogById = new Map((CATALOG as CatalogEntry[]).map(entry => [entry.id, entry]));

function merge(prose: ProseEntry): StoryEnding {
  const catalog = catalogById.get(prose.id);
  if (!catalog) throw new Error(`content/story/ending-catalog.json is missing an entry for ${prose.id}`);
  return { id: prose.id, title: catalog.title, author: catalog.author, scene: catalog.scene, paragraphs: prose.paragraphs, speech: prose.speech };
}

export const STORY_ENDINGS: Record<StoryEndingId, StoryEnding> = Object.fromEntries(
  (PROSE as ProseEntry[]).map(entry => [entry.id, merge(entry)]),
) as Record<StoryEndingId, StoryEnding>;

export function isStoryEndingId(id: string | undefined): id is StoryEndingId {
  return !!id && Object.prototype.hasOwnProperty.call(STORY_ENDINGS, id);
}

/** Lazily requested per ending view; never prefetched on the title screen or at run start. */
export function storyEndingImagePath(id: StoryEndingId): string {
  return `art/endings/${id}.webp`;
}
