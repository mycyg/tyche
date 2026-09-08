/** Development-only scene fixture. Vite's production entry does not import it. */
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { startRun } from '../../src/game/engine';
import { CASES } from '../../src/game/catalog';
import { hash } from '../../src/game/random';
import type { Patient } from '../../src/game/types';
import { WorldStage } from '../../src/world/WorldStage';
import { Bedside } from '../../src/world/Bedside';
import '../../src/style.css';
import '../../src/game.css';
import '../../src/rpg.css';
import '../../src/ui/readability.css';

const profiles = [
  [31,'男'],[48,'男'],[52,'男'],[54,'男'],[58,'男'],[63,'男'],[67,'男'],[76,'男'],
  [24,'女'],[32,'女'],[36,'女'],[39,'女'],[59,'女'],[71,'女'],[8,'男'],[15,'女'],
] as const;
function fixture(profile: number, mobile: boolean, bed: number, crossing = false) {
  const r = startRun('ward-visual-fixture', '程医生', []), [age,sex] = profiles[profile];
  let uid = 'visual-0', n = 0;
  while (hash(`ambulatory:1:${uid}`) % 100 >= 34) uid = `visual-${++n}`;
  const p = { ...r.patients[0], uid, caseId:'C-131', name:`${age}岁${sex}性`, bed, admitted:1, inpatient:true,
    active:true, damage:mobile ? 0 : 2, stability:3, caredDay:1, settled:true, presetNode:undefined, clinical:undefined,
    entityId:undefined, preset:{...CASES[0],id:'C-131',age,sex,critical:false,companion:'无',entityProfile:undefined,entityId:'visual'} } as Patient;
  r.patients=[p]; r.queue=[]; r.cursor=0; r.authored=undefined;
  r.world=crossing ? {x:650,y:262,facing:3,day:1} : {x:132,y:148,facing:0,day:1};
  return r;
}
function Review() {
  const [profile,setProfile]=useState(13),[mobile,setMobile]=useState(false),[bed,setBed]=useState(7);
  const [motion,setMotion]=useState(true),[close,setClose]=useState(false);
  const [crossing,setCrossing]=useState(false),[position,setPosition]=useState({x:132,y:148});
  const [revision,setRevision]=useState(0);
  const [r,setRun]=useState(()=>fixture(profile,mobile,bed));
  const reset=(p=profile,m=mobile,b=bed,c=crossing)=>{setProfile(p);setMobile(m);setBed(b);setCrossing(c);const next=fixture(p,m,b,c);setRun(next);setPosition(next.world!);setClose(false);setRevision(x=>x+1);};
  return <><nav style="height:52px;display:flex;gap:12px;align-items:center;padding:4px 12px;position:relative;z-index:20;background:#152138">
    <label>外观 <select value={profile} onChange={e=>reset(Number(e.currentTarget.value))}>{profiles.map(([a,s],i)=><option value={i}>{a}岁{s}</option>)}</select></label>
    <label>床位 <select value={bed} onChange={e=>reset(profile,mobile,Number(e.currentTarget.value))}>{[5,6,7,8].map(b=><option value={b}>{b}床</option>)}</select></label>
    <label><input type="checkbox" checked={mobile} onChange={e=>reset(profile,e.currentTarget.checked)}/>稳定恢复期</label>
    <label><input type="checkbox" checked={motion} onChange={e=>setMotion(e.currentTarget.checked)}/>动态</label>
    <button onClick={()=>{setMotion(false);reset(profile,mobile,bed,true);}}>人物通行</button>
    <output aria-label="主角位置" data-x={position.x} data-y={position.y}>{Math.round(position.x)},{Math.round(position.y)}</output>
    <button onClick={()=>setClose(x=>!x)}>床旁近景</button><button onClick={()=>reset()}>重置</button>
  </nav><div style="position:absolute;inset:52px 0 0">
    <WorldStage key={revision} r={r} motion={motion} frozen={close} onEncounter={()=>{}} onPatient={()=>setClose(true)} onAmbient={()=>{}} onAction={()=>{}} onMenu={()=>{}} onPosition={setPosition} onTitle={()=>{}}>
      {close&&<Bedside r={r} patientId={r.patients[0].uid} motion={motion} onRecords={()=>{}} onClose={()=>setClose(false)}/>}
    </WorldStage></div></>;
}
render(<Review/>, document.getElementById('app')!);
