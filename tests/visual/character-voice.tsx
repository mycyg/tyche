import {render} from 'preact';
import {useLayoutEffect,useState} from 'preact/hooks';
import {Dialogue} from '../../src/ui/App';
import {bindAudioLifecycle,configureAudio} from '../../src/ui/audio';
import {CHARACTER_VOICES} from '../../src/shared/character-voices';
import '../../src/style.css';import '../../src/game.css';import '../../src/rpg.css';
function Fixture(){
  const [selected,setSelected]=useState('chief'),[active,setActive]=useState(''),[turn,setTurn]=useState(0),[voice,setVoice]=useState(true);
  useLayoutEffect(()=>bindAudioLifecycle(),[]);
  useLayoutEffect(()=>configureAudio({sound:true,music:false,voice}),[voice]);
  const talk=(speaker:string)=>{setActive(speaker);setTurn(n=>n+1);};
  return <main>
    <label>角色<select aria-label="角色" value={selected} onChange={e=>setSelected(e.currentTarget.value)}>{Object.entries(CHARACTER_VOICES).map(([id,actor])=><option value={id}>{actor.name}</option>)}</select></label>
    <button onClick={()=>talk(selected)}>交谈</button><button onClick={()=>talk('narrator')}>查看文字</button>
    <label><input type="checkbox" checked={voice} onChange={e=>setVoice(e.currentTarget.checked)}/>角色短语音</label>
    {active&&<Dialogue key={turn} actor={active==='narrator'?undefined:active} speechActor={active} title={active==='narrator'?'文字记录':CHARACTER_VOICES[active].name} text="病历已经归档。" close={()=>setActive('')}/>}
  </main>;
}
render(<Fixture/>,document.getElementById('app')!);
