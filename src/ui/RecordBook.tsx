import { useId, useState } from "preact/hooks";
import { CASES } from "../game/catalog";
import { awaitingBed } from "../game/cards";
import type { Entry, Patient, Run } from "../game/types";
import "./record-book.css";

const PAGES = ["入院登记", "问诊与检查", "处置与交班", "费用"] as const;
const money = (amount: number) => `¥${amount.toLocaleString("zh-CN")}`;
const patientName = (p: Patient) => p.name;
const admissionDay=(day:number)=>day<1?`轮转前 ${1-day} 天`:`第 ${day} 日`;
const patientStatus = (p: Patient) => p.active ? p.inpatient ? "在院" : "就诊中" : p.dischargedDay !== undefined ? "已出院" : "已结束";

function Notes({ entries }: { entries: Entry[] }) {
  return entries.length ? <ol class="record-book__notes">
    {entries.map((entry, index) => <li key={`${entry.id}:${entry.day}:${index}`}>
      <div class="record-book__note-meta"><span>第 {entry.day} 日</span><span>{entry.title}</span></div>
      <p class="record-book__action">动作：{entry.choice}</p>
      <p class="record-book__result">{entry.result || "尚未留下这项记录"}</p>
    </li>)}
  </ol> : <p class="record-book__empty">尚未留下这项记录</p>;
}

export type RecordPage='admission'|'checks'|'treatment'|'fees';
export function RecordBook({ r, initialPatient, initialPage='admission' }: { r: Run; initialPatient?: string; initialPage?:RecordPage }) {
  const bedName=(p:Patient)=>p.inpatient&&p.bed?`${p.bed} 床`:awaitingBed(r,p)?'留观区':p.dischargedDay!==undefined?'离院病历':'门诊 / 急诊';
  const id = useId();
  const [selected, setSelected] = useState(initialPatient);
  const [page, setPage] = useState(['admission','checks','treatment','fees'].indexOf(initialPage));
  const patients = [...r.patients].sort((a, b) =>
    Number(b.active && b.inpatient) - Number(a.active && a.inpatient) || b.admitted - a.admitted || a.bed - b.bed);
  const patient = patients.find(p => p.uid === selected) ?? patients[0];
  const clinical = CASES.find(c => c.id === patient?.caseId);
  if (!patient) return <div class="record-book record-book--empty"><p>病历夹内尚无患者登记。</p></div>;
  const entries = r.journal.filter(entry => entry.scope.kind === "patient" && entry.scope.id === patient.uid);
  // Match the actual option IDs against the selected patient's scoped journal.
  // Case history and findings are never used as a substitute for obtained notes.
  const examinationIds = new Set(clinical?.steps.filter(step => /-s[12]$/.test(step.id))
    .flatMap(step => step.options.map(option => `${patient.uid}:${option.id}`)) ?? []);
  const examinations = entries.filter(entry => examinationIds.has(entry.id));
  const treatment = entries.filter(entry => !examinationIds.has(entry.id));
  const stay = Math.max(1, (patient.dischargedDay !== undefined && !patient.active ? patient.dischargedDay : r.day) - patient.admitted + 1);
  const over = patient.inpatient && stay > patient.expectedDays;
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
          <small>{admissionDay(p.admitted)}入院 · {patientStatus(p)}</small>
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
          <div><span class="record-book__kicker">{bedName(patient)} · {patientStatus(patient)}</span><h3>{PAGES[page]}</h3></div>
          <span class="record-book__stamp">{patientName(patient)}</span>
        </header>
        {page === 0 && <>
          <dl class="record-book__registration">
            <div><dt>姓名</dt><dd>{patientName(patient)}</dd></div>
            <div><dt>性别 / 年龄</dt><dd>{clinical ? `${clinical.sex} / ${clinical.age<1?'婴儿':`${clinical.age} 岁`}` : "尚未留下这项记录"}</dd></div>
            <div><dt>入院日</dt><dd>{admissionDay(patient.admitted)}</dd></div>
            <div><dt>床号</dt><dd>{bedName(patient)}</dd></div>
            <div><dt>{patient.inpatient ? "住院时长" : "就诊时长"}</dt><dd>{stay} 天</dd></div>
            <div><dt>科室</dt><dd>{clinical?.department ?? "尚未留下这项记录"}</dd></div>
          </dl>
          <section class="record-book__complaint"><h4>主诉</h4><p>{clinical?.complaint ?? "尚未留下这项记录"}</p></section>
          {patient.dischargedDay !== undefined && <p class="record-book__footnote">第 {patient.dischargedDay} 日出院{patient.readmitted ? "，后再次入院。" : "。"}</p>}
        </>}
        {page === 1 && <Notes entries={examinations} />}
        {page === 2 && <Notes entries={treatment} />}
        {page === 3 && <>
          <section class="record-book__complaint"><h4>费用所属病组</h4><p>{clinical?.dipGroup ?? "尚未留下这项记录"}</p></section>
          <dl class="record-book__fees">
            <div><dt>当前病组预算</dt><dd>{money(patient.budget)}</dd></div>
            <div><dt>累计诊疗费</dt><dd>{money(patient.spent)}</dd></div>
            <div class="record-book__paid"><dt>医生已垫付</dt><dd>{money(patient.charged)}</dd></div>
          </dl>
          <p class="record-book__footnote">诊疗费记在患者的病组账上，不等于医生的个人余额。其中实际产生的超支自付会扣减个人余额；“医生已垫付”为累计已扣金额，已扣除退回的款项。</p>
          {patient.inpatient && <div class={`record-book__stay ${over ? "is-overdue" : ""}`}>
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
