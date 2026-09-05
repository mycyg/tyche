import { useEffect, useRef, useState } from 'preact/hooks';
import { awaitingBed, patientCase } from '../game/cards';
import type { Run } from '../game/types';
import { patientArtIndex } from './patients';
import './bedside.css';

export function PatientPortrait({caseId,name,motion=false,bed=false}: {caseId:string;name:string;motion?:boolean;bed?:boolean}) {
  const index=Math.max(0,Math.min(19,patientArtIndex(caseId)));
  return <div role="img" aria-label={name} class={`patient-portrait ${motion && caseId !== 'C020' ? 'patient-breathing' : ''}`}
    style={{backgroundImage:`url(${import.meta.env.BASE_URL}art/${bed?'bedside-patients':'patient-portraits'}.webp)`,backgroundPosition:`${index%5*25}% ${Math.floor(index/5)*100/3}%`,animationDelay:`-${index*.47}s`}} />;
}

export function Bedside({r,patientId,motion,onRecords,onClose}: {r:Run;patientId:string;motion:boolean;onRecords:(page?:'admission'|'checks'|'treatment'|'fees')=>void;onClose:()=>void}) {
  const p=r.patients.find(p=>p.uid===patientId);
  const box=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const [detail,setDetail]=useState(false);
  useEffect(()=>{
    const el=box.current!;
    const observer=new ResizeObserver(()=>{const width=Math.min(el.clientWidth,el.clientHeight*1.5);setSize({width,height:width/1.5});});
    observer.observe(el);return()=>observer.disconnect();
  },[]);
  useEffect(()=>setDetail(false),[patientId]);
  if(!p) return null;
  const c=patientCase(p);
  const waiting=awaitingBed(r,p);
  const place=p.bed?`${p.bed} 床`:p.caseId==='C020'?'善后交接':waiting?'留观区':c.dipGroup.includes('门诊')?'门诊诊位':'急诊诊位';
  const careDay=p.inpatient?'住院':waiting?'留观':'接诊';
  const entry=r.journal.filter(e=>e.scope.kind==='patient'&&e.scope.id===p.uid).at(-1);
  return <div class="bedside-view" ref={box} aria-label={`${p.name}的床旁`}>
    <div class="bedside-set" style={size}>
      <img class="bedside-background" src={`${import.meta.env.BASE_URL}art/bedside.webp`} alt="病床、监护仪、床头病历夹和药盒" />
      <div class="bedside-person"><PatientPortrait caseId={p.caseId} name={p.name} motion={motion && p.damage<3} bed /></div>
      <button class="bedside-hotspot hotspot-person" aria-label={`查看${p.name}的主诉`} onClick={()=>setDetail(x=>!x)} />
      <button class="bedside-hotspot hotspot-monitor" aria-label="查看监护与检查记录" onClick={()=>onRecords('checks')} />
      <button class="bedside-hotspot hotspot-chart" aria-label="翻开床头病历" onClick={()=>onRecords('admission')} />
      <button class="bedside-hotspot hotspot-medicine" aria-label="核对已执行的医嘱" onClick={()=>onRecords('treatment')} />
    </div>
    <div class="bedside-nameplate"><b>{place} · {p.name}</b><span>{c.age<1?'婴儿':`${c.age} 岁`} · {c.sex}{p.caseId==='C020'?' · 善后交接':` · ${careDay}第 ${r.day-p.admitted+1} 天`}</span></div>
    <button class="bedside-back" onClick={onClose}>返回病区</button>
    {detail && <aside class="bedside-note"><button aria-label="收起主诉" onClick={()=>setDetail(false)}>×</button><h3>入院主诉</h3><p>{c.complaint}</p><small>{entry ? `最近记录 · 第 ${entry.day} 天：${entry.choice}` : '尚未完成床旁核查。'}</small></aside>}
    <nav class="bedside-tools" aria-label="床旁物件"><button onClick={()=>setDetail(x=>!x)}>患者</button><button onClick={()=>onRecords('checks')}>监护记录</button><button onClick={()=>onRecords('admission')}>病历夹</button><button onClick={()=>onRecords('treatment')}>医嘱单</button></nav>
  </div>;
}
