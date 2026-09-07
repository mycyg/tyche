import { useState } from 'preact/hooks';
import { RULES } from '../game/rules';
import { nextShiftForecast, scheduleTuning } from '../game/schedule-preview';
import type { Run } from '../game/types';
import { narrate } from './audio';
import { liveCap } from '../game/traits';
import { hasWorkedNight, isFullDayLeave } from '../game/duty-state';
import {pendingScheduledWork}from './scheduled-work';
import {pendingPeerReferralNotes}from '../game/peer-referrals';

export function Schedule({ r, borrow, handbook }: { r: Run; borrow: () => void; handbook: () => void }) {
  const [selected, setSelected] = useState(Math.min(RULES.days, r.day));
  const index = RULES.nightDays.indexOf(selected as never);
  const tuning = scheduleTuning(r, selected);
  const forecast = nextShiftForecast(r);
  const afterBorrow = nextShiftForecast(r, 1);
  const fullLeave = isFullDayLeave(r,selected);
  const nightBudget = fullLeave ? 0 : selected === r.day && r.nightBudget > 0 ? r.nightBudget : index >= 0 ? RULES.nightBudget[index] : tuning.addedNightBudget;
  const canBorrow = r.phase === 'play' && !r.emergency && r.borrowed < RULES.borrowMax && r.day < RULES.days && !isFullDayLeave(r);
  const appointments=pendingScheduledWork(r,selected),tomorrowAppointments=pendingScheduledWork(r,r.day+1);
  const narration = `${isFullDayLeave(r)?'今天已批准停诊休息，不能预支行动。到期的账单和私人事务仍需处理。':'白班使用行动值，夜班使用分钟。'}预支一次，今天增加一点行动，明天扣回一点；体力、精神和情绪上限各减少${RULES.borrowCapLoss}点。${r.day < RULES.days ? `按现有状态，明天预计${forecast.ap}点行动、${forecast.stamina}点体力。${forecast.leave?'明天已有停诊休息安排。':''}` : '这是最后一天，不能预支。'}`;
  return <div class="schedule">
    <p>当前为第 {r.day} 天 · {r.shiftPhase ?? '交班'}。白班剩余 {r.ap} 点行动{r.shiftPhase === '夜班' ? `，夜班剩余 ${Math.max(0, r.nightMinutes)} 分钟` : ''}。</p>
    <p>现在体力 {r.vitals.stamina}/{liveCap(r,'stamina')}，精神 {r.vitals.san}/{liveCap(r,'san')}，情绪 {r.vitals.emotion}/{liveCap(r,'emotion')}。斜线前是当前值，后面是本局上限。</p>
    <p>点日期查看计划；临时换班、休假和突发事件会调整安排。</p>
    <div class="schedule-grid">{Array.from({ length: RULES.days }, (_, i) => i + 1).map(day => {
      const added = scheduleTuning(r, day).addedNightBudget > 0;
      const leave = isFullDayLeave(r,day);
      const night = !leave && (RULES.nightDays.includes(day as never) || added || day === r.day && r.nightBudget > 0);
      const label = leave ? '已批准休假' : night ? added ? '白班 + 临时夜班' : '白班 + 夜班' : '白班';
      return <button key={day} aria-pressed={selected === day} aria-label={`第${day}天，${label}${day === r.day ? '，今天' : ''}`} class={`${day === r.day ? 'is-today' : ''} ${night ? 'is-night' : ''}`} onClick={() => setSelected(day)}><b>第 {day} 天{day === r.day ? ' · 今天' : ''}</b><span>{label}</span>{RULES.wageDays.includes(day as never) && <small>工资到账</small>}</button>;
    })}</div>
    <section class="schedule-detail"><h3>第 {selected} 天的安排</h3>
      {fullLeave ? <p>已批准停诊休息，常规患者工作由当班同事接管。当天行动值为 0，不能预支；到期账单、家庭事项和调查仍可能到来，选择中标明的行动和费用代价照常结算。</p> : <p>交班 → 查房 → 门诊 → 结算 → {nightBudget > 0 ? '夜班 → ' : ''}日终。当前阶段的待办处理完，才会开放下一阶段；同一阶段内可选择先处理谁。</p>}
      <p>体力在确认操作时扣除，数额写在选项旁。打开排班表、走动和阅读已经取得的病历不会扣行动或推进夜班时间；主动核查新线索按选项标价。</p>
      {nightBudget>0&&<p>每起急诊首次接诊另扣体力 {RULES.nightIncident.stamina} 点、精神 {RULES.nightIncident.san} 点，同一患者的后续步骤不重复扣；精神低于 {RULES.perception.fractured} 时另扣 {RULES.perception.nightExtraSan} 点精神，有幻听时再扣 {RULES.nightIncident.hallucinationSan} 点精神。具体处置与超时消耗另外计算。</p>}
      {nightBudget > 0 && <p>夜班可用 {nightBudget} 分钟{index >= 0 ? `，计划急诊 ${RULES.nightCases[index]} 起` : '，按临时接班安排接诊'}，突发事件另计。时间只随确认的处置消耗，打开病历或阅读说明不计时。</p>}
      {nightBudget > 0 && <p>分钟耗尽后，新到急诊须先电话交代并请二线接手，耗时 {RULES.nightTelephone.minutes} 分钟；不能据此记为已完成检查或领取正常接诊绩效。已开始的救治仍可继续。</p>}
      {nightBudget > 0 && <p>每项处置做完后，只要夜班剩余分钟小于零，该项就另扣体力 5 点、精神 3 点。之后继续处置也会再次计算；这些消耗不包含在白班行动值里。</p>}
      {!fullLeave && <p>计划接诊 {RULES.patientCount[selected - 1]} 位患者；原有住院患者、转入患者和来访另计。</p>}
      <p>日终检定基础要求 {RULES.dc[selected - 1] + (r.difficulty === 'attending' ? 2 : 0)} 点，实际加成与难度以掷骰前说明为准。</p>
      {!fullLeave && tuning.leave > 0 && <p>当天已有部分时段的离岗安排，常规工作以完成交接后的实际待办为准。</p>}
      {!fullLeave && (tuning.outpatientAP > 0 || tuning.wardAP > 0) && <p>已知额外消耗：{tuning.outpatientAP > 0 ? `每位门诊患者增加 ${tuning.outpatientAP} 点行动值。` : ''}{tuning.wardAP > 0 ? `每次查房增加 ${tuning.wardAP} 点行动值。` : ''}</p>}
      {!fullLeave && tuning.extraNightMinutes > 0 && <p>每起夜班急诊额外耗时 {tuning.extraNightMinutes} 分钟。</p>}
      {appointments.length>0&&<><h4>已经约好的事务</h4>{appointments.map(item=><p key={item.id}>{item.label}：{item.phase}需 {item.ap} 点行动。</p>)}<p>到时按预约占用行动；即使当天停诊休息，也不会自动取消。行动不足时仍按透支结算，处理经过会写入日记。</p></>}
      {pendingPeerReferralNotes(r,selected).map(note=><p key={note} class="guide-note">{note}</p>)}
    </section>
    {r.journal.some(entry=>entry.day===selected&&entry.id.startsWith('status-recovery:'))&&<section class="schedule-detail"><h3>当天解除的持续状态</h3>
      {r.journal.filter(entry=>entry.day===selected&&entry.id.startsWith('status-recovery:')).map(entry=><p key={entry.id}>{entry.result}</p>)}
    </section>}
    <section class="schedule-borrow"><h3>明天能安排多少工作</h3>
      {r.day < RULES.days ? <>
        <p>按现有状态，明天预计 {forecast.ap} 点行动，醒来时体力 {forecast.stamina}/{forecast.liveCap}。{forecast.leave ? '明天已有停诊或休假安排。' : ''}{forecast.afterNight ? hasWorkedNight(r) ? '已计入今天实际夜间出勤后的疲劳。' : '按今晚计划值班估算，尚未实际出勤。' : ''}未来的选择、检定和持续状态变化仍可能改变结果。</p>
        <p>这个体力值在完成日终、进入第 {forecast.day} 天时生效。今晚的操作仍消耗当前体力；精神按换日规则恢复，情绪不会因为睡到明天就自动回满。</p>
        {pendingPeerReferralNotes(r,r.day+1).map(note=><p key={note} class="guide-note">{note}</p>)}
        {tomorrowAppointments.length>0&&<p class="guide-note">以上是换日分配的额度，尚未扣除明天已约事务需要的 {tomorrowAppointments.reduce((sum,item)=>sum+item.ap,0)} 点行动。{tomorrowAppointments.map(item=>item.label).join('、')}到期后另行结算；行动不足时会损失体力和上限。</p>}
        <p>今天已预支 {r.borrowed}/{RULES.borrowMax} 点。{canBorrow ? `再预支 1 点，今天行动增加 1，明天预计剩 ${afterBorrow.ap} 点，醒来时体力 ${afterBorrow.stamina}/${afterBorrow.liveCap}；体力、精神、情绪上限各降低 ${RULES.borrowCapLoss} 点，本局睡眠不会补回这些上限。` : '当前不能再预支，已借用的行动仍在次日扣回。'}</p>
        {r.shiftPhase === '夜班' && <p class="guide-note">夜诊按分钟结算，不需要为夜诊预支行动；预支仍会减少明天的额度和本局上限。</p>}
        <button disabled={!canBorrow} onClick={borrow}>确认预支 1 点行动</button>
        {!canBorrow && <p class="guide-note">{isFullDayLeave(r) ? '停诊休假时不能预支。' : r.borrowed >= RULES.borrowMax ? '今日预支已到上限。' : '先完成当前结果、检定或中断事项，再预支行动。'}</p>}
      </> : <p>这是最后一个工作日，不能再预支。处理完夜班和日终事项后，进入本轮复核。</p>}
      <p>行动不够仍确认白班处置，会按缺少的每 1 点扣 {RULES.overtimeStamina} 点体力，三项上限各扣 {RULES.overtimeCapLoss} 点。咖啡和午睡只恢复当前体力，不增加行动值。</p>
      <p>行动值用完后，患者选项中会出现“今天先不处理，留给明天”。这不会扣体力，但未完成的诊疗和记录会留档，病情可能在等待中恶化；次日从未完成的步骤继续。午睡只能在门诊结束后的结算时段使用。</p>
    </section>
    <button class="secondary" onClick={handbook}>查看排班与体力说明</button>
    <button class="text-button" onClick={() => void narrate(narration)}>朗读排班说明</button>
  </div>;
}
