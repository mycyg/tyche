import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseClinicalSource, missingTribunalRows } from '../src/content/clinical/parser';
import { normalizeClinicalGraph } from '../src/content/clinical/normalize';
import { applyClinicalMechanics } from '../src/content/clinical/mechanics';
import { registerClinicalClueConsumers } from '../src/content/clinical/clues';
import { applyClinicalCheckCopy } from '../src/content/clinical/check-copy';
import { applyClinicalPlayerCopy } from '../src/content/clinical/player-copy';
const sourceDir=process.argv[2];
if(!sourceDir)throw new Error('Usage: npx tsx scripts/import-clinical.ts <design case directory>');
const graphs=readdirSync(sourceDir).filter(f=>/^C\d{3}.*\.md$/.test(f)).sort().map(file=>normalizeClinicalGraph(parseClinicalSource(readFileSync(resolve(sourceDir,file),'utf8'),`04_病例库/${file}`)));
if(missingTribunalRows.length)throw new Error(`Hazard options without a 「鉴定书会怎么写」 row (the hazard reason would fall back to the option text): ${missingTribunalRows.join(', ')}`);
for(const graph of graphs){applyClinicalMechanics(graph);applyClinicalCheckCopy(graph);registerClinicalClueConsumers(graph);applyClinicalPlayerCopy(graph);}
if(graphs.length!==20)throw new Error(`Expected 20 cases, read ${graphs.length}`);
writeFileSync(resolve('src/content/clinical/graphs.json'),JSON.stringify(graphs,null,2)+'\n');
console.log(`Imported ${graphs.length} clinical graphs, ${graphs.reduce((n,g)=>n+g.nodes.length,0)} nodes, ${graphs.reduce((n,g)=>n+g.nodes.reduce((m,s)=>m+s.options.filter(o=>!o.system).length,0),0)} choices`);
