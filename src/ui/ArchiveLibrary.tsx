import {useId,useMemo,useRef,useState} from 'preact/hooks';
import type {Meta} from '../game/types';
import {patientArt,patientArtFile,type PatientArtIdentity} from '../world/patients';
import {ARCHIVE_KINDS,ARCHIVE_PATIENT_SCOPE,archiveEntries,filterArchiveEntries,archiveEntryNarration,type ArchiveKind,type ArchiveStatus} from './archive-data';
export * from './archive-data';
import {narrate} from './audio';
import './archive-library.css';

function Portrait({identity,name}:{identity:PatientArtIdentity;name:string}) {
 const art=patientArt(identity);
 return <div class="archive-library__portrait" role="img" aria-label={name} style={{backgroundImage:`url(${import.meta.env.BASE_URL}art/${patientArtFile(art,'portrait')})`,backgroundSize:`${art.columns*100}% ${art.rows*100}%`,backgroundPosition:`${art.index%art.columns*100/(art.columns-1)}% ${Math.floor(art.index/art.columns)*100/(art.rows-1)}%`}}/>;
}
const PAGE_SIZE=24;
export function ArchiveLibrary({meta}:{meta:Meta}) {
 const id=useId(),entries=useMemo(()=>archiveEntries(meta),[meta]);
 const [kind,setKind]=useState<ArchiveKind>('patients'),[status,setStatus]=useState<ArchiveStatus>('known'),[query,setQuery]=useState(''),[group,setGroup]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<string>();
 const detail=useRef<HTMLElement>(null),selectedButton=useRef<HTMLButtonElement|null>(null);
 const filtered=useMemo(()=>filterArchiveEntries(entries,{kind,status,query,group}),[entries,kind,status,query,group]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),activePage=Math.min(page,pages-1),shown=filtered.slice(activePage*PAGE_SIZE,(activePage+1)*PAGE_SIZE);
 const selectedEntry=filtered.find(e=>e.key===selected&&e.known),category=ARCHIVE_KINDS.find(k=>k.id===kind)!;
 const counts=ARCHIVE_KINDS.map(k=>({kind:k.id,total:entries.filter(e=>e.kind===k.id).length,known:entries.filter(e=>e.kind===k.id&&e.known).length}));
 const current=counts.find(c=>c.kind===kind)!,groups=[...new Set(entries.filter(e=>e.kind===kind&&e.known).map(e=>e.group))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN'));
 const reset=()=>{setPage(0);setSelected(undefined);};
 return <section class="archive-library" aria-labelledby={`${id}-title`}>
  <header class="archive-library__header"><div><p class="archive-library__eyebrow">轮转收藏</p><h3 id={`${id}-title`}>留下的面孔与本领</h3><p>你可以在这里翻查接诊记录和已经收录的天赋。</p></div><span class="archive-library__total"><b>{entries.filter(e=>e.known).length}</b> 已收录</span></header>
  <nav class="archive-library__categories" aria-label="图鉴类别">{ARCHIVE_KINDS.map(k=>{const count=counts.find(c=>c.kind===k.id)!;return <button type="button" key={k.id} aria-pressed={kind===k.id} onClick={()=>{setKind(k.id);setGroup('');setQuery('');reset();}}><span>{k.label}</span><small>{count.known} / {count.total}</small></button>;})}</nav>
  <div class="archive-library__tools">
   <label class="archive-library__search"><span>查找记录</span><input type="search" placeholder="姓名、主诉或已收录规则" value={query} onInput={e=>{setQuery(e.currentTarget.value);reset();}}/></label>
   <label><span>收录情况</span><select value={status} onChange={e=>{setStatus(e.currentTarget.value as ArchiveStatus);if(e.currentTarget.value==='unknown')setGroup('');reset();}}><option value="known">已收录</option><option value="all">全部条目</option><option value="unknown">尚未收录</option></select></label>
   <label><span>{kind==='cases'||kind==='presets'?'科室':'类别'}</span><select value={group} onChange={e=>{setGroup(e.currentTarget.value);reset();}} disabled={!groups.length||status==='unknown'}><option value="">全部</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
  </div>
  <p class="archive-library__status" role="status">{category.label} · 已收录 {current.known} / {current.total}{query||group?` · 找到 ${filtered.length} 条`:''}<span>未见条目保持封存</span></p>
  {kind==='patients'&&<p class="archive-library__privacy">{ARCHIVE_PATIENT_SCOPE}</p>}
  <div class={`archive-library__body${selectedEntry?' has-detail':''}`}>
   {selectedEntry&&<section ref={detail} tabIndex={-1} class="archive-library__detail" id={`${id}-detail`} aria-labelledby={`${id}-detail-title`}>
    <div class="archive-library__detail-top">{selectedEntry.portrait&&<Portrait identity={selectedEntry.portrait} name={selectedEntry.name}/>}<div><small>{category.label} · 已收录</small><h4 id={`${id}-detail-title`}>{selectedEntry.name}</h4></div><button type="button" class="archive-library__close" aria-label="收起记录" onClick={()=>{setSelected(undefined);selectedButton.current?.focus();}}>×</button></div>
    <dl>{selectedEntry.fields.map((f,i)=><div key={`${f.label}:${i}`}><dt>{f.label}</dt><dd>{f.text}</dd></div>)}</dl>
    <button type="button" class="archive-library__read" onClick={()=>void narrate(archiveEntryNarration(selectedEntry))}>朗读这份记录</button>
    {(kind==='cases'||kind==='presets')&&<p class="archive-library__privacy">这里保留接诊时已知的资料。未核实的病史、检查结果与后续决定不在此页。</p>}
   </section>}
   <div class="archive-library__results">
    {shown.length?<ul class="archive-library__grid">{shown.map(e=><li key={e.key}>{e.known?<button type="button" class={`archive-library__card${selected===e.key?' is-selected':''}`} aria-expanded={selected===e.key} aria-controls={selected===e.key?`${id}-detail`:undefined} onClick={event=>{selectedButton.current=event.currentTarget;setSelected(e.key);requestAnimationFrame(()=>{detail.current?.scrollIntoView({block:'nearest'});detail.current?.focus({preventScroll:true});});}}>
     {e.portrait?<Portrait identity={e.portrait} name={e.name}/>:<span class="archive-library__mark" aria-hidden="true">{kind==='talents'?'✦':kind==='states'?'◌':'▤'}</span>}
     <span class="archive-library__card-text"><small>{e.group}</small><b>{e.name}</b><span>{e.summary}</span></span><span class="archive-library__open" aria-hidden="true">›</span>
    </button>:<div class="archive-library__locked"><span aria-hidden="true">◇</span><b>{e.name}</b><small>未收录</small></div>}</li>)}</ul>:<div class="archive-library__empty"><span aria-hidden="true">▤</span><h4>{query||group?'没有找到这份记录':status==='unknown'?'这一类已全部收录':`还没有收录${category.label}`}</h4><p>{query||group?'换一个姓名、主诉或关键词试试。':'轮转结束后，你接触过的患者和取得的资料会收录在这里。'}</p>{query||group?<button type="button" onClick={()=>{setQuery('');setGroup('');reset();}}>清除筛选</button>:status==='known'&&<button type="button" onClick={()=>{setStatus('all');reset();}}>查看收藏进度</button>}</div>}
    {pages>1&&<nav class="archive-library__pagination" aria-label="图鉴分页"><button type="button" disabled={activePage===0} onClick={()=>{setPage(activePage-1);setSelected(undefined);}}>上一页</button><span>第 {activePage+1} / {pages} 页</span><button type="button" disabled={activePage===pages-1} onClick={()=>{setPage(activePage+1);setSelected(undefined);}}>下一页</button></nav>}
   </div>
  </div>
 </section>;
}
export default ArchiveLibrary;
