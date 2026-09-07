import data from './graphs.json';
import type { ClinicalGraph } from './types';
export const clinicalGraphs=data as unknown as ClinicalGraph[];
export const clinicalGraphMap=Object.fromEntries(clinicalGraphs.map(graph=>[graph.id,graph]));
export const getClinicalGraph=(id:string):ClinicalGraph|undefined=>clinicalGraphMap[id];
export * from './types';
export * from './runtime';
export * from './clues';
