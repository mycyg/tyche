/** Development-only viewport fixture using the actual game dialogue and map. */
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {Dialogue} from '../../src/ui/App';
import {WorldStage} from '../../src/world/WorldStage';
import {startRun} from '../../src/game/engine';
import {ACTORS} from '../../src/game/rules';
import '../../src/style.css';
import '../../src/game.css';
import '../../src/rpg.css';
import '../../src/ui/readability.css';
const r=startRun('dialogue-portrait-fixture','程医生',[]);
r.world={x:1150,y:400,facing:0,day:1};
function Fixture(){
  const [actor,setActor]=useState('research'),[large,setLarge]=useState(false),[open,setOpen]=useState(true);
  const patient=actor==='patient'?r.patients[0]:undefined;
  const title=patient?.name??ACTORS[actor].name;
  return <div class={large?'large-text':''}>
    <nav style="height:48px;display:flex;gap:12px;align-items:center;position:relative;z-index:50;background:#182138;padding:4px 8px">
      <label>人物 <select aria-label="人物" value={actor} onChange={e=>{setActor(e.currentTarget.value);setOpen(true);}}>
        {Object.entries(ACTORS).map(([id,a])=><option value={id}>{a.name}</option>)}<option value="patient">患者</option>
      </select></label>
      <label><input type="checkbox" checked={large} onChange={e=>setLarge(e.currentTarget.checked)}/>大号文字</label>
      <button onClick={()=>setOpen(true)}>交谈</button>
    </nav>
    <WorldStage r={r} motion={false} frozen={open} dialogueOpen={open} onEncounter={()=>{}} onPatient={()=>{}} onAmbient={()=>{}} onAction={()=>{}} onMenu={()=>{}} onPosition={()=>{}} onTitle={()=>{}}>
      {open&&<Dialogue actor={patient?undefined:actor} patient={patient} title={title} text="抬头看了一眼钟。“我还得整理数据，病历也没写完。今天又不知道要忙到几点。”" close={()=>setOpen(false)}>
        <div class="dialogue-result"><button class="dialogue-next" onClick={()=>setOpen(false)}>结束交谈 ▸</button></div>
      </Dialogue>}
    </WorldStage>
  </div>;
}
render(<Fixture/>,document.getElementById('app')!);
