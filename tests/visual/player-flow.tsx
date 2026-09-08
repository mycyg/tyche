/** Development-only fixture: real clinical scene and responsive map. */
import {render} from 'preact';
import {RpgScene} from '../../src/ui/App';
import {WorldStage} from '../../src/world/WorldStage';
import {startRun} from '../../src/game/engine';
import {createPatient} from '../../src/game/cards';
import {beginClinical} from '../../src/game/clinical';
import '../../src/style.css';import '../../src/game.css';import '../../src/rpg.css';import '../../src/ui/readability.css';
const r=startRun('player-flow-fixture','程医生',[]);
const p=createPatient(r,'C011','flow');r.patients=[p];r.phase='play';r.queue=[beginClinical(r,p)!];r.cursor=0;
render(<WorldStage r={r} motion={false} frozen dialogueOpen onEncounter={()=>{}} onPatient={()=>{}} onAmbient={()=>{}} onAction={()=>{}} onMenu={()=>{}} onPosition={()=>{}} onTitle={()=>{}}>
  <RpgScene r={r} onSelect={()=>{}} close={()=>{}} records={()=>{}}/>
</WorldStage>,document.getElementById('app')!);
