export const MUSIC_SCENES=['title','day','night','pressure','fracture','inquiry','ending-calm','ending-dark'] as const;
export type MusicScene=typeof MUSIC_SCENES[number];
