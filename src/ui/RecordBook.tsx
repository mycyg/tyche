import { useId, useState } from "preact/hooks";
import { patientCase } from "../game/cards";
import type { Entry, Patient, Run } from "../game/types";
import { ENTITY_BY_ID } from '../content/patients';
import { patientAgeLabel } from '../content/clinical/identity';
import { patientBaseline, patientNotes, patientReports, priorShiftHandover } from './record-notes';
import {clinicalDisposition} from '../game/clinical-disposition';
import {billingEpisodeSummaries} from '../content/events/billing-episodes';
import {patientDisplay} from './patient-display';
import {reportReviewLines}from '../content/clinical/report-reading';
import "./record-book.css";

const PAGES = ["入院登记", "问诊与检查", "处置与交班", "费用"] as const;
const money = (amount: number) => `¥${amount.toLocaleString("zh-CN")}`;
const patientName = (p: Patient) => p.name;
const admissionDay=(day:number)=>day<1?`轮转前 ${1-day} 天`:`第 ${day} 日`;

function Notes({ entries }: { entries: Entry[] }) {
  return entries.length ? <ol class="record-book__notes">
    {entries.map((entry, index) => <li key={`${entry.id}:${entry.day}:${index}`}>
      <div class="record-book__note-meta"><span>第 {entry.day} 日</span><span>{entry.title}</span></div>
      <p class="record-book__action">处置：{entry.choice}</p>
      <p class="record-book__result">{entry.result || "尚未留下这项记录"}</p>
    </li>)}
  </ol> : <p class="record-book__empty">本班尚未记录这项内容。</p>;
}

export type RecordPage='admission'|'checks'|'treatment'|'fees';
export function RecordBook({ r, initialPatient, initialPage='admission' }: { r: Run; initialPatient?: string; initialPage?:RecordPage }) {
  const bedName=(p:Patient)=>patientDisplay(r,p).place;
  const id = useId();
  const [selected, setSelected] = useState(initialPatient);
  const [page, setPage] = useState(['admission','checks','treatment','fees'].indexOf(initialPage));
  const patients = [...r.patients].sort((a, b) =>
    Number(b.active && b.inpatient) - Number(a.active && a.inpatient) || b.admitted - a.admitted || a.bed - b.bed);
  const patient = patients.find(p => p.uid === selected) ?? patients[0];
  const clinical = patient ? patientCase(patient) : undefined;
  if (!patient) return <div class="record-book record-book--empty"><p>病历夹内尚无患者登记。</p></div>;
  const notes = patientNotes(r, patient);
  const baseline = patientBaseline(patient);
  const reports = patientReports(r, patient);
  const entity = patient.entityId ? ENTITY_BY_ID.get(patient.entityId) : undefined;
  const age = entity ? `${entity.age}${/岁|月|周|天|小时/.test(entity.age) ? '' : ' 岁'}` : clinical ? patientAgeLabel(clinical.age) : '';
  const display = patientDisplay(r,patient),stay=display.stay;
  const over = patient.active && patient.inpatient && stay !== undefined && stay > patient.expectedDays;
  const panelId = `${id}-page`;
  return <div class="record-book">
    <aside class="record-book__index" aria-label="患者病历索引">
      <p class="record-book__index-heading">患者索引 <span>{patients.length}</span></p>
      <div class="record-book__patients">
        {patients.map(p => <button type="button" key={p.uid}
          class={`record-book__patient ${patient.uid === p.uid ? "is-selected" : ""}`}
          aria-pressed={patient.uid === p.uid}
          onClick={() => { setSelected(p.uid); setPage(0); }}>
          <span class="record-book__bed">{bedName(p)}</span>
          <strong>{patientName(p)}</strong>
          <small>{admissionDay(p.admitted)}登记 · {patientDisplay(r,p).status}</small>
        </button>)}
      </div>
    </aside>
    <section class="record-book__folder" aria-label={`${patientName(patient)}的病历夹`}>
      <div class="record-book__tabs" role="tablist" aria-label="病历分页">
        {PAGES.map((label, index) => <button type="button" role="tab" key={label}
          id={`${id}-tab-${index}`} aria-selected={page === index} aria-controls={panelId}
          tabIndex={page === index ? 0 : -1}
          onClick={() => setPage(index)}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % PAGES.length
              : event.key === "ArrowLeft" ? (index + PAGES.length - 1) % PAGES.length
                : event.key === "Home" ? 0 : event.key === "End" ? PAGES.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setPage(next);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
          }}>{label}</button>)}
      </div>
      <article class="record-book__paper" role="tabpanel" id={panelId}
        aria-labelledby={`${id}-tab-${page}`} tabIndex={0} key={`${patient.uid}:${page}`}>
        <header class="record-book__paper-heading">
          <div><span class="record-book__kicker">{bedName(patient)} · {display.status}</span><h3>{PAGES[page]}</h3></div>
          <span class="record-book__stamp">{patientName(patient)}</span>
        </header>
        {page === 0 && <>
          <dl class="record-book__registration">
            <div><dt>姓名</dt><dd>{patientName(patient)}</dd></div>
            <div><dt>性别 / 年龄</dt><dd>{clinical ? `${entity?.sex ?? clinical.sex} / ${age}` : "尚未留下这项记录"}</dd></div>
            <div><dt>入院日</dt><dd>{admissionDay(patient.admitted)}</dd></div>
            <div><dt>床号</dt><dd>{bedName(patient)}</dd></div>
            <div><dt>本院照护分工</dt><dd>{display.team}</dd></div>
            <div><dt>本次就诊时长</dt><dd>{stay === undefined ? '结束日期未登记' : `${stay} 天`}</dd></div>
            <div><dt>科室</dt><dd>{clinical?.department ?? "尚未留下这项记录"}</dd></div>
          </dl>
          <section class="record-book__complaint"><h4>主诉</h4><p>{clinical?.complaint ?? "尚未留下这项记录"}</p></section>
          <section class="record-book__complaint"><h4>就诊时已提供的体征与观察</h4>{baseline.observations.length ? baseline.observations.map((text, i) => <p key={i}>{text}</p>) : <p>尚未提供。后续取得的观察与检查记录见「问诊与检查」。</p>}</section>
          {patient.dischargedDay !== undefined && <p class="record-book__footnote">第 {patient.dischargedDay} 日出院{patient.readmitted ? "，后再次入院。" : "。"}</p>}
        </>}
        {page === 1 && <>
          <section><h4>就诊时已提供的病史</h4>{baseline.history.length ? baseline.history.map((text, i) => <p key={i}>{text}</p>) : <p>尚未提供。</p>}</section>
          <section><h4>补问病史与查阅原始资料</h4><Notes entries={notes.history} /></section>
          <h4>已取得的检查回报</h4>
          {!reports.length && <p class="record-book__empty">尚未取得独立检查报告。已执行的观察与检查记录列在下方；没有报告不等于结果正常。</p>}
          {reports.map(report => <section class="clinical-report" key={report.id}>
            <div class="section-line"><h4>{report.title}</h4></div>
            <p class="report-prose">{report.skimmedNow ? report.skimmed : report.full}</p>
            {report.skimmedNow&&reportReviewLines(report.full,report.skimmed).length>0&&<section aria-label="报告中的数值与关键记录"><h5>数值与关键记录</h5>{reportReviewLines(report.full,report.skimmed).map(line=><p class="report-prose" key={line}>{line}</p>)}</section>}
            {report.skimmedNow && <details><summary>逐项查看完整报告</summary><p class="report-prose">{report.full}</p></details>}
          </section>)}
          <section><h4>观察与检查经过</h4><Notes entries={notes.examination} /></section>
        </>}
        {page === 2 && <>
          {priorShiftHandover(patient)&&<section class="record-book__complaint"><h4>接班时收到的说明</h4><p>{priorShiftHandover(patient)}</p></section>}
          {clinicalDisposition(patient).destination&&<section class="record-book__complaint"><h4>离院去向</h4><p>{clinicalDisposition(patient).destination}</p></section>}
          <Notes entries={notes.treatment} />
        </>}
        {page === 3 && <>
          <section class="record-book__complaint"><h4>费用所属病组</h4><p>{clinical?.dipGroup ?? "尚未留下这项记录"}</p></section>
          <dl class="record-book__fees">
            <div><dt>当前病组预算</dt><dd>{money(patient.budget)}</dd></div>
            <div><dt>累计诊疗费</dt><dd>{money(patient.spent)}</dd></div>
            <div class="record-book__paid"><dt>你已垫付</dt><dd>{money(patient.charged)}</dd></div>
          </dl>
          <p class="record-book__footnote">诊疗费记在患者的病组账上，不等于你的个人余额。“你已垫付”只计算实际从你余额扣过的钱，并减去退回的款项；原主管组承担的旧超支不计入其中。</p>
          {billingEpisodeSummaries(r,patient).map(episode=><section class="record-book__complaint" key={episode.id}><h4>{episode.title}</h4><p>{episode.text}</p></section>)}
          {patient.active && patient.inpatient && stay !== undefined && <div class={`record-book__stay ${over ? "is-overdue" : ""}`}>
            <strong>{over ? `已超过预计住院天数 ${stay - patient.expectedDays} 天` : `病组预计住院 ${patient.expectedDays} 天`}</strong>
            <p>{over ? "超期会影响病组额度，后续诊疗与费用仍需复核。" : `目前住院 ${stay} 天。`}</p>
          </div>}
        </>}
      </article>
      <nav class="record-book__page-turn" aria-label="翻阅病历">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>← 上一页</button>
        <span>{page + 1} / {PAGES.length}</span>
        <button type="button" disabled={page === PAGES.length - 1} onClick={() => setPage(page + 1)}>下一页 →</button>
      </nav>
    </section>
  </div>;
}
