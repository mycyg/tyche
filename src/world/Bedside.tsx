import { useEffect, useRef, useState } from 'preact/hooks';
import { patientCase } from '../game/cards';
import type { Patient, Run } from '../game/types';
import { patientArt, patientArtFile } from './patients';
import { patientAgeLabel } from '../content/clinical/identity';
import { patientDisplay } from '../ui/patient-display';
import { observeLayout } from './observe-layout';
import './bedside.css';

export function PatientPortrait({caseId,name,patient,motion=false,bed=false}: {caseId:string;name:string;patient?:Patient;motion?:boolean;bed?:boolean}) {
  const art=patientArt(patient??{caseId}),{index,columns,rows}=art;
  return <div role="img" aria-label={name} class={`patient-portrait ${motion && caseId !== 'C020' ? 'patient-breathing' : ''}`}
    style={{backgroundImage:`url(${import.meta.env.BASE_URL}art/${patientArtFile(art,bed?'bedside':'portrait')})`,backgroundSize:`${columns*100}% ${rows*100}%`,backgroundPosition:`${index%columns*100/(columns-1)}% ${Math.floor(index/columns)*100/(rows-1)}%`,animationDelay:`-${index*.47}s`}} />;
}

export function Bedside({r,patientId,motion,onRecords,onClose}: {r:Run;patientId:string;motion:boolean;onRecords:(page?:'admission'|'checks'|'treatment'|'fees')=>void;onClose:()=>void}) {
  const p=r.patients.find(p=>p.uid===patientId);
  const box=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const [detail,setDetail]=useState(false);
  useEffect(()=>{
    const el=box.current!;
    return observeLayout(el,()=>{const width=Math.min(el.clientWidth,el.clientHeight*1.5);setSize(previous=>previous.width===width?previous:{width,height:width/1.5});});
  },[]);
  useEffect(()=>setDetail(false),[patientId]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open],.rpg-dialogue,.rpg-map-menu'))return;
      event.preventDefault();event.stopPropagation();
      if(detail){setDetail(false);box.current?.querySelector<HTMLButtonElement>('.hotspot-person')?.focus({preventScroll:true});}
      else onClose();
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[detail,onClose]);
  if(!p) return null;
  const c=patientCase(p);
  const display=patientDisplay(r,p);
  const entry=r.journal.filter(e=>e.scope.kind==='patient'&&e.scope.id===p.uid).at(-1);
  return <div class="bedside-view" ref={box} aria-label={`${p.name}的床旁`}>
    <div class="bedside-set" style={size}>
      <img class="bedside-background" src={`${import.meta.env.BASE_URL}art/bedside.webp`} alt="病床、监护仪、床头病历夹和药盒" />
      <div class="bedside-person" style={{left:'26.5%',top:'34%',width:'47%'}}><PatientPortrait caseId={p.caseId} name={p.name} patient={p} motion={motion && p.active && p.damage<3} bed /></div>
      <button class="bedside-hotspot hotspot-person" aria-label={`查看${p.name}的主诉`} onClick={()=>setDetail(x=>!x)} />
      <button class="bedside-hotspot hotspot-monitor" aria-label="查看监护与检查记录" onClick={()=>onRecords('checks')} />
      <button class="bedside-hotspot hotspot-chart" aria-label="翻开床头病历" onClick={()=>onRecords('admission')} />
      <button class="bedside-hotspot hotspot-medicine" aria-label="核对已执行的医嘱" onClick={()=>onRecords('treatment')} />
    </div>
    <div class="bedside-nameplate"><b>{display.place} · {p.name}</b><span>{patientAgeLabel(c.age)} · {c.sex} · {display.duration}{p.caseId==='C020'?' · 善后交接':''} · {display.team}</span></div>
    <button class="bedside-back" onClick={onClose}>返回病区</button>
    {detail && <aside class="bedside-note"><button aria-label="收起主诉" onClick={()=>setDetail(false)}>×</button><h3>入院主诉</h3><p>{c.complaint}</p><small>{entry ? `最近记录 · 第 ${entry.day} 天：${entry.choice}` : '尚未完成床旁核查。'}</small></aside>}
    <nav class="bedside-tools" aria-label="床旁物件"><button onClick={()=>setDetail(x=>!x)}>患者</button><button onClick={()=>onRecords('checks')}>监护记录</button><button onClick={()=>onRecords('admission')}>病历夹</button><button onClick={()=>onRecords('treatment')}>医嘱单</button></nav>
  </div>;
}
