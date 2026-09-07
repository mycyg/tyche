import type { ComponentChildren } from "preact";
import {version as gameVersion}from '../../package.json';
import { useEffect, useRef, useState } from "preact/hooks";
import {
  act,
  availableOptions,
  currentCard,
  resignationAvailable,
  reward,
  startRun,
  upgrade,
} from "../game/engine";
import { auditScore, liability } from "../game/endings";
import { ENDING_DEFINITIONS } from '../game/endings';
import type { UpgradeKind } from '../game/engine';
import { patientCase } from "../game/cards";
import { actionMinutes, patientPayment, previewCheckModifier,previewCheckSources,checkDifficultySources,optionAp, checkDifficulty } from "../game/costs";
import {CheckBreakdown}from './CheckBreakdown';
import { talentContext, liveCap } from '../game/traits';
import { talentRerollsRemaining, drawTalentPool, talentCheck } from '../game/talents';
import { checkContext } from '../game/traits';
import { patientCheckAdjustment } from '../game/patient-director';
import { patientCheckParties } from '../game/patient-checks';
import {clinicalActionHelp,clinicalChoiceHelp} from './clinical-help';
import {paymentCopy} from './payment-copy';
import {scheduledChoiceWork}from './scheduled-work';
import {feedbackSource,feedbackVoiceActor}from './feedback-source';
import {displayNumber}from '../game/display-number';
import { CASES, DEBUFFS, TALENTS } from "../game/catalog";
import {
  ACTORS,
  RELATION_LABELS,
  RULES,
  SKILL_LABELS,
  VITAL_LABELS,
} from "../game/rules";
import { shuffled, random } from "../game/random";
import {
  decode,
  emptySave,
  encode,
  load,
  persist,
  type Save,
} from "../game/storage";
import type {
  Action,
  Card,
  Ending,
  Meta,
  Option,
  PartnerSetting,
  Run,
  Skill,
  Vital,
  Patient,
} from "../game/types";
import { Dice } from "./Dice";
import { cue, bindAudioLifecycle, configureAudio, setMusicScene, narrate, narrateDialogue, stopVoice } from "./audio";
import { musicSceneFor } from "./music-scene";
import { dialogueSegments } from './dialogue-voice';
import { clinicalVoiceActor } from './clinical-voice';
import { registerGameTools } from "./WebMCP";
import { WorldStage } from "../world/WorldStage";
import { worldCoffeeOffering,worldNapOffering } from '../world/refreshments';
import { walkable } from "../world/navigation";
import { Bedside, PatientPortrait } from "../world/Bedside";
import {incomeCoverage}from '../game/income-coverage';
import { RecordBook, type RecordPage } from "./RecordBook";
import { TALENT_GUIDE, choiceResourceCopy, visibleChoiceEffects } from "./copy";
import { GuideSteps, GuideManual, ContextGuide, initialGuideState, parseGuide, reduceGuide, type GuideEvent } from "./Guide";
import { Schedule } from './Schedule';
import { ArchiveLibrary } from './ArchiveLibrary';
import { patientAgeLabel } from '../content/clinical/identity';
import { operationCheckPurpose } from '../content/clinical/check-copy';
import { STORY_ENDINGS, TRUE_ENDING_ID, isStoryEndingId, storyEndingImagePath, type StoryEndingId } from '../content/story/endings';

const money = (n: number) => `¥${Math.round(n).toLocaleString("zh-CN")}`;
const dayName = (n: number) =>
  n === 15 ? "医疗纠纷复核" : `第 ${String(n).padStart(2, "0")} 天`;
const KIND = {
  clinical: "接诊",
  ward: "病区",
  story: "来访",
  quick: "门诊",
  night: "夜班",
  rest: "日终",
  audit: "旧事回院",
};
const FICTION =
  "本作人物、医院、制度、病例与结局均为虚构，不构成医疗、法律或财务建议。含医疗事故、债务、抑郁、精神崩溃与刑事判决情节。";
function deviceStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ComponentChildren;
  close?: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current!,
      previous = document.activeElement as HTMLElement;
    el.showModal();
    return () => {
      el.close();
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      class={`modal ${wide ? "modal-wide" : ""}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close?.();
      }}
    >
      <div class="modal-heading">
        <h2>{title}</h2>
        {close && (
          <button class="icon-button" aria-label="关闭" onClick={close}>
            ×
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
function Portrait({
  actor,
  small = false,
}: {
  actor: string;
  small?: boolean;
}) {
  const data = ACTORS[actor];
  if (!data) return null;
  if(data.portrait==='mother')return <div class={`portrait ${small?'portrait-small':''}`} role="img" aria-label="母亲，来电" style={{backgroundImage:`url(${import.meta.env.BASE_URL}art/mother.webp)`,backgroundSize:'cover',backgroundPosition:'center top'}} />;
  const map: Record<string, [string, string]> = {
    tang: ["a", "2.94%"],
    jiang: ["a", "50%"],
    li: ["a", "97.06%"],
    zhou: ["b", "2.94%"],
    ye: ["b", "50%"],
    father: ["b", "97.06%"],
  };
  const [sheet, position] = map[data.portrait];
  return (
    <div
      class={`portrait ${small ? "portrait-small" : ""}`}
      role="img"
      aria-label={`${data.name}，${data.role}`}
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}art/characters-${sheet}.webp)`,
        "--portrait-x": position,
      }}
    />
  );
}

function Title({ save, begin, resume, archive, settings }: { save: Save; begin: () => void; resume: () => void; archive: () => void; settings: () => void }) {
  const active = save.run && save.run.phase !== 'ending';
  return <main class="rpg-title"><div class="rpg-title-background" aria-hidden="true" />
    <div class="rpg-title-content"><h1 class="rpg-title-logo">TYCHE</h1><p class="rpg-title-subtitle">你是一名住院医师，今天起要接手病区的诊疗和值班工作。<br/>十四天后，患者的结局和你的处置记录会一起接受复核。</p>
      <nav class="rpg-title-menu" aria-label="主菜单">
        {active && <button aria-label={`继续轮转 · 第 ${save.run!.day} 天`} onClick={resume}>继续轮转 · 第 {save.run!.day} 天</button>}
        <button aria-label="新的轮转" onClick={begin}>新的轮转</button>
        {save.run?.phase === 'ending' && <button onClick={resume}>上一份结局</button>}
        <button onClick={archive}>结局与成长</button><button onClick={settings}>设置与存档</button>
      </nav><small>{FICTION}</small><a href="https://github.com/mycyg/tyche" target="_blank" rel="noreferrer">GitHub · MIT · v{gameVersion}</a>
    </div></main>;
}

function Setup({
  meta,
  cancel,
  begin,
}: {
  meta: Meta;
  cancel: () => void;
  begin: (
    name: string,
    seed: string,
    ids: string[],
    difficulty: Run["difficulty"],
    partner: PartnerSetting,
  ) => void;
}) {
  const [name, setName] = useState("程医生"),
    [seed, setSeed] = useState(() =>
      Array.from(crypto.getRandomValues(new Uint32Array(2)))
        .map((x) => x.toString(36))
        .join("-"),
    );
  const [picks, setPicks] = useState<string[]>([]),
    [redraws, setRedraws] = useState(0),
    [difficulty, setDifficulty] = useState<Run["difficulty"]>("rotation"),
    [partner, setPartner] = useState<PartnerSetting>("none");
  let draw=0;
  const slots=meta.fourthSlot?4:3,maxRedraws=5+(meta.extraRedraws??0);
  const talentOrder=drawTalentPool(()=>random(seed,`talents:${redraws}:${draw++}`),TALENTS.length).map(id=>TALENTS.find(t=>t.id===id)!);
  const offered=talentOrder.filter((t) => !picks.includes(t.id)).slice(0, 9 - picks.length);
  const cards = [
    ...picks.map((id) => TALENTS.find((t) => t.id === id)!),
    ...offered,
  ].sort((a,b)=>talentOrder.indexOf(a)-talentOrder.indexOf(b));
  function toggle(id: string) {
    if (picks.includes(id)) setPicks(picks.filter((x) => x !== id));
    else if (
      picks.length < slots &&
      picks.filter(
        (x) =>
          TALENTS.find((t) => t.id === x)!.family ===
          TALENTS.find((t) => t.id === id)!.family,
      ).length < 2
    )
      setPicks([...picks, id]);
  }
  return (
    <main class="setup-page">
      <header class="page-heading">
        <button class="text-button" onClick={cancel}>
          ← 返回
        </button>
        <span class="eyebrow">南屏市中心医院 · 轮转登记</span>
      </header>
      <div class="setup-intro">
        <div>
          <p class="eyebrow">BEFORE THE FIRST SHIFT</p>
          <h1>今天开始，你管这组病人。</h1>
          <p>
            「先到护士站交班，核对哪几床还需要处理。有情况叫二线，别自己硬扛。」
            <br />
            唐济指了一下护士站，转身去了办公室。
          </p>
        </div>
        <Portrait actor="chief" small />
      </div>
      <div class="setup-fields">
        <label>
          姓名
          <input
            value={name}
            maxLength={12}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          轮转码
          <input
            value={seed}
            maxLength={48}
            onInput={(e) =>
              setSeed(e.currentTarget.value.replace(/[^\p{L}\p{N}-]/gu, ""))
            }
          />
        </label>
        <label>
          难度
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.currentTarget.value as Run["difficulty"])
            }
          >
            <option value="rotation">住院医 · 高难度</option>
            <option value="attending" disabled={!meta.attendingUnlocked}>{meta.attendingUnlocked?'主治 · 检定难度 +2，经验 ×1.5':'主治 · 在永久成长中用 20 悟性解锁'}</option>
          </select>
        </label>
        <label>
          伴侣
          <select
            value={partner}
            onChange={(e) =>
              setPartner(e.currentTarget.value as PartnerSetting)
            }
          >
            <option value="none">无</option>
            <option value="female">女性</option>
            <option value="male">男性</option>
          </select>
        </label>
      </div>
      <div class="section-line">
        <h2>选择你的天赋</h2>
        <span>天赋 {picks.length} / {slots}</span>
      </div>
      <p class="muted small">从九张卡里最多选三项本领{meta.fourthSlot?'，也可以带上第四项':''}，同类最多两项。每项都有代价，请看清本领与限制。选入后仍可取消；重抽只更换未选中的卡。</p>
      <div class="talent-grid">
        {cards.map((t) => {
          const picked=picks.includes(t.id), explanation=TALENT_GUIDE[t.id];
          const familyFull=picks.filter(id=>TALENTS.find(t=>t.id===id)?.family===t.family).length>=2;
          const blocked=!picked&&(picks.length>=slots||familyFull);
          return <article
            key={t.id}
            class={`talent-card ${picked ? "chosen" : ""}`}
          >
            <span class="talent-top">
              <small>{t.family}</small>
              <span>{picked ? "■ 已选入" : ""}</span>
            </span>
            <h3>{t.name}</h3>
            {explanation?.summary&&explanation.summary!==t.benefit&&<p class="talent-summary">{explanation.summary}</p>}
            <p class="talent-benefit"><b>本领</b> {t.benefit}</p>
            <p class="price"><b>代价</b> {t.price}</p>
            {explanation && <details class="talent-details"><summary>具体会怎样？</summary><p>{explanation.use}</p><p>{explanation.tradeoff}</p></details>}
            <button class="talent-select" aria-pressed={picked} disabled={blocked} onClick={()=>toggle(t.id)}>{picked?'取消选择':blocked?familyFull?'同类已选满两项':'天赋槽已满':'选入'}<span class="sr-only"> · {t.name}</span></button>
          </article>;
        })}
      </div>
      <div class="setup-footer">
        <button
          class="secondary"
          disabled={redraws >= maxRedraws}
          onClick={() => setRedraws(redraws + 1)}
        >
          重抽未锁定项 · 剩 {maxRedraws - redraws} 次
        </button>
        <button
          class="primary"
          disabled={picks.length < 3 || picks.length>slots || !seed.trim()}
          onClick={() => begin(name, seed, picks, difficulty, partner)}
        >
          接过胸牌 →
        </button>
      </div>
      <details class="help">
        <summary>上班之前</summary>
        <p>
          开局资金 {money(RULES.cash)}，其中房租 −{money(RULES.rent)} 已经直接扣除，实际到手 {money(RULES.cash - RULES.rent)}。
        </p>
        <p>
          你每天有 10 点基础行动值，最多预支明天的 4 点。每预支一点，体力、精神和情绪上限各减
          1 点。行动值不足时仍可继续处置，但每透支一点，就扣 5 点体力，三项上限还会各减
          2 点。第十四天不能预支。
        </p>
        <p>
          病组预算以病人为单位结算，超支部分由你垫付。借贷按日计息，连续两次结算时，近期实际日均收入都不够支付当天利息，会结束本局。私人借款单列，不会自动免除。
        </p>
        <p>
          住院时间会带来费用与床位压力。未排除风险就出院，可能导致患者回院、家属录音与举报。
        </p>
        <p>
          日终掷一枚二十面骰，点数加上耐受加成，达到当天门槛就通过。后面的夜晚更难撑过。失败后从三项负面状态中选择一项；掷出 1
          选两项，掷出 20 可解除一项可恢复状态。
        </p>
        <p>
          体力、精神和情绪分别记录，各自影响你的工作。状态耗尽会中断值班，甚至结束本局；十四天后将复核本局的处置与病历。探索病例和不同结局可获得经验，提高以后新局的能力。
        </p>
        <p>已有经验 {meta.xp}。姓名只保存在当前设备，不上传。</p>
      </details>
    </main>
  );
}
function Stats({ r }: { r: Run }) {
  return (
    <div class="stats">
      {(["stamina", "san", "emotion"] as Vital[]).map((key) => (
        <div
          class={`vital ${r.vitals[key] / r.caps[key] < 0.3 ? "critical" : ""}`}
          key={key}
        >
          <div>
            <span>{VITAL_LABELS[key]}</span>
            <span class="mono">
              {displayNumber(r.vitals[key])}
              <small>/{displayNumber(r.caps[key])}</small>
            </span>
          </div>
          <div
            class="meter"
            role="meter"
            aria-label={VITAL_LABELS[key]}
            aria-valuenow={r.vitals[key]}
            aria-valuemin={0}
            aria-valuemax={r.caps[key]}
          >
            <i style={{ width: `${(100 * r.vitals[key]) / r.caps[key]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function Board({ r }: { r: Run }) {
  const patients = r.patients.filter((p) => p.active && p.inpatient);
  return (
    <section class="ward-board">
      <div class="section-line">
        <h2>住院部</h2>
        <span>{patients.length} 人</span>
      </div>
      <p class="small muted">A、B、C 病房 · 五床—十六床 · {patients.length} / {RULES.ward.capacity} 床</p>
      {patients.length === 0 ? (
        <p class="empty-state">当前没有待复核的住院病人。</p>
      ) : (
        patients.map((p) => {
          const c = patientCase(p),
            stay = r.day - p.admitted + 1,
            over = stay > p.expectedDays;
          return (
            <div class={`bed-card ${over ? "overdue" : ""}`} key={p.uid}>
              <div class="bed-heading">
                <span class="bed-number">{p.bed ? `${p.bed} 床` : "加床"}</span>
                <span>
                  {patientAgeLabel(c.age)} · {c.sex}
                </span>
                {over && <b>超期</b>}
              </div>
              <h3>{p.name} · {c.title}</h3>
              <p class="stay">
                住院 {stay} / {p.expectedDays} 天{" "}
                <span>
                  {p.stability >= 2
                    ? "可评估出院"
                    : "风险未排除"}
                </span>
              </p>
              <div class="budget-line">
                <span>已用 {money(p.spent)}</span>
                <span>额度 {money(p.budget)}</span>
              </div>
              <div class="meter budget">
                <i
                  style={{
                    width: `${Math.min(100, (p.spent / p.budget) * 100)}%`,
                  }}
                />
              </div>
              <div class="bed-bottom">
                <span>
                  家属：
                  {p.patience > 60
                    ? "尚能沟通"
                    : p.patience > 25
                      ? "反复催问"
                      : "录音与投诉"}
                </span>
                {p.charged > 0 && (
                  <span class="danger">已垫 {money(p.charged)}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
function Cost({
  o,
  r,
  detail = false,
}: {
  o: Option;
  r: Run;
  detail?: boolean;
}) {
  const card = currentCard(r);
  const ap = optionAp(r,o,card);
  const patient = r.patients.find(p => p.uid === card?.patientId);
  const payment = patient ? patientPayment(r, patient, o) : undefined;
  const minutes = actionMinutes(r, o, card);
  const visibleEffects=visibleChoiceEffects(r,o.effects,card);
  return (
    <div class="choice-cost">
      <span>{card?.kind === 'night' ? '夜班 · 按分钟计时' : ap > 0 ? `消耗 ${ap} 点行动值` : "不消耗行动"}</span>
      {minutes > 0 && <span>耗时 {minutes} 分钟</span>}
      {choiceResourceCopy(r,o,card).map((row,i)=><span key={`resource-${i}`} class={row.danger?'danger':''}>{row.text}</span>)}
      {scheduledChoiceWork(r,o).map((text,i)=><span key={`scheduled-${i}`} class="danger">{text}</span>)}
      {payment && payment.treatment > 0 && <span>诊疗记账 {money(payment.treatment)}</span>}
      {payment && (payment.treatment > 0 || payment.personal > 0) && <span class={payment.personal ? "danger" : ""}>{o.check && o.effects.bill ? "审核通过后自付" : "本次自付"} {money(payment.personal)}</span>}
      {!!visibleEffects.cash && (
        <span class={visibleEffects.cash < 0 ? "danger" : "positive"}>
          {o.check&&card&&'authoredEventId'in card?'通过后个人余额':'个人余额'} {visibleEffects.cash > 0 ? "+" : "−"}
          {money(Math.abs(visibleEffects.cash))}
        </span>
      )}
      {!!visibleEffects.income && <span>{o.check?'通过后收入':'收入'} +{money(visibleEffects.income)}{r.debt>0?'（先还信用债）':''}</span>}
      {o.check && (
        <span class="check-tag">
          {o.chanceCheck?'事件概率掷骰':`${SKILL_LABELS[o.check.skill]}检定`}
        </span>
      )}
      {detail&&<span>「操作体力」与行动值分别扣除；标注「另扣」的代价还要相加。</span>}
    </div>
  );
}
function CheckPreview({ o, r }: { o: Option; r: Run }) {
  if (!o.check) return null;
  if(o.chanceCheck)return <section class="check-explanation" aria-label="事件概率掷骰"><h3>事件概率掷骰</h3><p>掷一枚二十面骰。点数达到 {o.chanceCheck.successAtLeast} 就通过，通过概率为 {(21-o.chanceCheck.successAtLeast)*5}%。</p><p class="small muted">这次只看骰子点数，不加能力，不触发大成功或大失败，也不能使用重掷。</p><p class="check-stakes"><b>未通过：</b>{o.check.failureHint??o.check.failureText}</p></section>;
  const check = o.check,card=currentCard(r),modifier = previewCheckModifier(r,o,card);
  const patient=r.patients.find(p=>p.uid===card?.patientId),adjustment=patient?patientCheckAdjustment(r,patient,o):undefined;
  const checkRules=talentCheck(talentContext(r),{...checkContext(r,card,o),advantage:adjustment?.advantage,disadvantage:adjustment?.disadvantage});
  const purpose = operationCheckPurpose(o);
  return <section class="check-explanation" aria-label="检定规则">
    <h3>{SKILL_LABELS[check.skill]}检定 · {purpose}</h3>
    {adjustment?.automaticFailure?<p class="warning-line">患者无法独立提供可靠病史，现场没有可以核实的陪同者。这种问法无法取得可靠信息，掷出 20 也不会凭空得到答案。</p>:<><p>掷一枚二十面骰，得到 1—20 点。<strong>点数 {modifier >= 0 ? "+" : "−"} {Math.abs(modifier)} ≥ {checkDifficulty(r,o,card)}</strong> 就通过。</p>
    <p class="small muted">{SKILL_LABELS[check.skill]}加成 {modifier >= 0 ? "+" : ""}{modifier}。掷出 20 必过，{r.talents.includes('T22')?'你的天赋使 1 和 2 都算大失败':'掷出 1 必败'}。{checkRules.advantage?'本次有优势：掷两次，取较高点数。':checkRules.disadvantage?'本次有劣势：掷两次，取较低点数。':''}</p></>}
    {patientCheckParties(r,patient,o)&&<p>现场有两拨家属，双方要分别检定，均通过才算取得同意。有一方通过，不代表另一方同意；重掷会同时重掷双方的点数。</p>}
    <CheckBreakdown modifiers={previewCheckSources(r,o,card)} difficulty={checkDifficultySources(r,o,card)}/>
    {!!checkRules.reasons.length&&<p class="small muted">{checkRules.reasons.join('；')}。</p>}
    <p class="check-stakes"><b>未通过：</b>{check.failureHint ?? check.failureText}</p>
    <p class="small muted">{check.skill==='endure'?`抗压大失败另扣 ${RULES.critical.sanLoss} 点精神。`:'大失败还会留下本次诊疗、沟通或记录的额外缺项。'}掷骰、接受点数及执行选择合算一次费用；重掷不再另收行动和费用。</p>
  </section>;
}
function PaymentPreview({ o, r }: { o: Option; r: Run }) {
  const patient = r.patients.find(p => p.uid === currentCard(r)?.patientId);
  if (!patient || (!o.cost && !o.effects.bill)) return null;
  const {payment,allowance,cash,approval} = paymentCopy(r, patient, o);
  return <section class="payment-explanation" aria-label="费用去向">
    <h3>费用去向 · {patient.name}</h3>
    <p>患者累计诊疗费 {money(patient.spent)} → {money(payment.spent)}<br />病组基础预算 {money(patient.budget)}<br />{allowance}</p>
    <p>{cash}</p>
    <small>诊疗费计入该患者的病组账本，不是医生收入。{approval ? "若申请未通过，不追加预算。" : ""}</small>
  </section>;
}
function Dialogue({ actor, title, text, close, children, patient, speechActor }: { actor?: string; title: string; text: string; close?: () => void; children?: ComponentChildren; patient?:Patient;speechActor?:string }) {
  const el = useRef<HTMLElement>(null);
  const voiceActor=speechActor??actor??(patient?clinicalVoiceActor(patient.caseId,patientCase(patient).sex):'narrator');
  const speech=dialogueSegments(text,voiceActor);
  useEffect(() => { void narrateDialogue(text, voiceActor); return stopVoice; }, [text, voiceActor]);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if(e.defaultPrevented||document.querySelector('dialog[open]'))return;if(e.key === 'Escape' && close) { e.preventDefault(); e.stopPropagation(); close(); } }; const first = el.current?.querySelector<HTMLElement>('button'); first?.focus({preventScroll:true}); window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener); }, []);
  return <section class="rpg-dialogue" ref={el} role="dialog" aria-label={title}>
    {actor && ACTORS[actor] ? <div class="dialogue-portrait"><Portrait actor={actor} /></div> : patient && <div class="dialogue-portrait dialogue-patient"><PatientPortrait caseId={patient.caseId} name={patient.name} patient={patient} /></div>}
    <div class="dialogue-main"><div class="dialogue-heading"><h2>{title}</h2>{actor && ACTORS[actor] && <span>{ACTORS[actor].name}</span>}<button class="voice-replay" onClick={()=>void narrateDialogue(text, voiceActor)} aria-label="重听这段话">重听</button>{close && <button onClick={close} aria-label="结束交谈">×</button>}</div>
      <div class="dialogue-body"><p class="dialogue-text">{speech.map((part,i)=><span key={i} class={part.speaker==='narrator'?'dialogue-narration':'dialogue-speech'}>{part.text}</span>)}</p><div>{children}</div></div>
    </div></section>;
}
/** Parity with the dedicated "collapse" (stamina) modal's quantified text: SAN/emotion zero only
 * ever reach this scene once per run (engine ends the run outright on the second occurrence), so
 * this is always describing the run's one rescue attempt for that vital. */
function EmergencyNotice({ r, card }: { r: Run; card: Card }) {
  const emergency = r.emergency;
  if (!emergency || emergency.resolved || emergency.cardId !== card.id || emergency.vital === 'stamina') return null;
  const text = emergency.vital === 'san'
    ? '精神归零本局只有一次自救机会。这次选择的结果决定能不能继续当班；精神再次归零会直接结束轮转，没有第二次机会。'
    : '情绪归零本局只有一次现场处理机会。这次选择决定恢复多少、怎样交接；情绪再次归零会结束轮转。';
  return <aside class="clinical-action-help emergency-notice" aria-label={`${VITAL_LABELS[emergency.vital]}归零说明`}><strong>{VITAL_LABELS[emergency.vital]}归零</strong><p>{text}</p></aside>;
}
function RpgScene({ r, onSelect, close, records }: { r:Run; onSelect:(id:string)=>void; close:()=>void; records:()=>void }) {
  const card = currentCard(r); if(!card) return null;
  const patient = r.patients.find(p=>p.uid === card.patientId);
  const help=clinicalActionHelp(r,card);
  return <Dialogue actor={card.actor} patient={patient} title={patient ? patient.name+' · '+card.title : card.title} text={card.text} close={close}>
    <EmergencyNotice r={r} card={card} />
    {help&&<aside class="clinical-action-help" aria-label="本组操作说明"><strong>本组操作</strong><p>{help}</p></aside>}
    <div class="dialogue-options">{availableOptions(r).filter(o=>o.interaction!=='graph-continue').map((o,i)=><button class="dialogue-option" key={o.id} onClick={()=>onSelect(o.id)}><b>{i+1}</b><span>{o.label}<Cost o={o} r={r} /><ClinicalChoiceNotice r={r} o={o}/></span></button>)}</div>
    {availableOptions(r).filter(o=>o.interaction==='graph-continue').map(o=><button class="dialogue-next graph-continue" key={o.id} onClick={()=>onSelect(o.id)}>{o.label} ▸</button>)}
    {patient && <button class="dialogue-record" onClick={records}>翻开床头病历夹</button>}
  </Dialogue>;
}
function ClinicalChoiceNotice({r,o}:{r:Run;o:Option}) {
  const text=clinicalChoiceHelp(r,currentCard(r),o);
  return text?<small class="clinical-step-warning">{text}</small>:null;
}
function RecoveryPrompt({r,action,close,confirm}:{r:Run;action:'coffee'|'nap';close:()=>void;confirm:()=>void}) {
  const offer=action==='coffee'?worldCoffeeOffering(r):worldNapOffering(r);
  const text=[offer.text,`现在体力 ${r.vitals.stamina}/${liveCap(r,'stamina')}。恢复不超过上限，也不会补回行动值或已经降低的上限。`].join('\n');
  useEffect(()=>{void narrate(text);return stopVoice;},[text]);
  return <Modal title={action==='coffee'?'值班室 · 咖啡':'值班室 · 午睡'} close={close}>
    <p class="feedback-text">{text}</p>
    {action==='coffee'&&r.cash<worldCoffeeOffering(r).price&&<p class="warning-line">个人余额不足，确认购买后需要另行处理支付缺口，不会自动替你贷款。</p>}
    <div class="modal-actions"><button class="secondary" onClick={close}>先不使用</button><button class="primary" disabled={!offer.allowed||r.phase!=='play'} onClick={confirm}>{action==='coffee'?'确认购买这一杯':'确认午睡'}</button></div>
  </Modal>;
}

function RollView({
  r,
  done,
  reroll,
  motion,
  sound,
}: {
  r: Run;
  done: () => void;
  reroll: () => void;
  motion: boolean;
  sound: boolean;
}) {
  const [toss, setToss] = useState<{x:number;y:number} | null>(null),
    [settled, setSettled] = useState(false);
  const [partyIndex,setPartyIndex]=useState(0);
  const thrown = useRef(false);
  const cast = !!toss;
  function throwDice(velocity = {x:.6,y:-.9}) {
    if(thrown.current) return;
    thrown.current = true;
    cue(sound,"dice");
    setToss(velocity);
  }
  const overall = r.roll!,party=overall.group?.members[partyIndex];
  const roll = party?{...overall,...party,second:party.dice[1],advantage:party.mode==='advantage'}:overall;
  const moreParties=!!overall.group&&partyIndex<overall.group.members.length-1;
  function nextParty(){thrown.current=false;setToss(null);setSettled(false);setPartyIndex(partyIndex+1);}
  return (
    <Modal title={roll.label}>
      <div class="roll-content">
        <p class="eyebrow">
          {party?`多人安抚 · ${party.party}（${partyIndex+1}/2）`:roll.kind === "day" ? `${dayName(r.day)} / 日终检定` : roll.chance?'事件概率掷骰':"能力检定"}
        </p>
        <Dice key={`${overall.id}:${overall.revision??0}:${partyIndex}`} roll={roll} motion={motion && !settled} toss={toss}
          onToss={throwDice} onImpact={()=>cue(sound,"dice")}
          onDone={() => setSettled(true)} />
        <div class="roll-math">
          <span>{settled ? roll.face : "骰子点数"}</span>
          {!roll.chance&&<span>
            {roll.modifier >= 0 ? "+" : "−"} {Math.abs(roll.modifier)}
          </span>}
          <span>{settled && roll.face+roll.modifier<roll.dc?'＜':'≥'}</span>
          <b>{roll.dc}</b>
        </div>
        <p class="muted small">{roll.chance?`只看自然点数，达到 ${roll.dc} 即通过。通过概率 ${(21-roll.dc)*5}%，本次不能重掷。`:roll.blockedReason??<>二十面骰：1—20 点；加成后达到门槛就通过。<br />掷出 20 必过 · {r.talents.includes('T22')?'你的「再来一次」让 1 和 2 都算大失败':'掷出 1 必败'}</>}</p>
        {!roll.chance&&<CheckBreakdown modifiers={roll.modifierSources} difficulty={roll.difficultySources}/>}
        {settled && (
          <div
            class={`roll-result ${roll.success ? "positive" : "danger"}`}
            aria-live="polite"
          >
            <b>{roll.face}</b>
            <span>
              {roll.chance?(roll.success?'通过':'未通过'):roll.blockedReason?'缺少可靠信息来源':roll.critical==='success'||roll.face===20&&roll.success
                ? "大成功"
                : roll.critical==='failure'||roll.face === 1
                  ? "大失败"
                  : roll.success
                    ? "成功"
                    : "失败"}
            </span>
            <small>
              总值 {roll.face + roll.modifier} / 难度 {roll.dc}
              {roll.second !== undefined ? roll.advantage?' · 优势：两次取高':' · 劣势：两次取低' : ""}
            </small>
          </div>
        )}
        {overall.group&&<div class="small" aria-label="两拨家属的意见">{overall.group.members.map((member,index)=><p key={member.party}>{member.party}：{index<partyIndex||index===partyIndex&&settled?`${member.success?'同意':'尚未同意'} · 骰点 ${member.dice.join('、')}${member.mode==='advantage'?'（取高）':member.mode==='disadvantage'?'（取低）':''}，能力修正 ${member.modifier>=0?'+':''}${member.modifier}，要求 ${member.dc}`:'等待掷骰'}</p>)}{settled&&!moreParties&&<p class={overall.success?'positive':'danger'}>{overall.success?'双方均已同意。':'仍有家属未同意，不能按达成一致处理。'}</p>}</div>}
        {!cast ? (
          <button
            class="primary full"
            onClick={() => {
              throwDice();
            }}
          >
            掷二十面骰
          </button>
        ) : settled ? (
          <><button class="primary full" onClick={moreParties?nextParty:done}>
            {moreParties?'继续与第二拨家属沟通 →':'接受结果 →'}
          </button>{!moreParties&&!roll.chance&&!roll.blockedReason&&r.pendingCheck&&(talentRerollsRemaining(talentContext(r))+(r.metaRerolls??0)>0)&&<button class="secondary full" onClick={reroll}>{overall.group?'使用 1 次重掷 · 双方都重新掷骰':'使用 1 次重掷 · 必须接受新点数'}</button>}</>
        ) : (
          <button class="secondary full" onClick={() => setSettled(true)}>
            直接看点数
          </button>
        )}
      </div>
    </Modal>
  );
}
function Dossier({ r, compact = false }: { r: Run; compact?: boolean }) {
  const grouped = Array.from(
    new Set(r.hazards.map((h) => `${h.scope.kind}:${h.scope.id}`)),
  );
  return (
    <div class="dossier">
      <div class="dossier-totals">
        <span>
          复核风险 <b>{auditScore(r)}</b>
        </span>
        <span>
          隐患 <b>{r.hazards.length}</b>
        </span>
        <span>
          严重临床损害 <b>{r.patients.filter((p) => p.damage >= 2).length}</b>
        </span>
      </div>
      {grouped.length === 0 && (
        <p class="empty-state">本轮没有记录到处置隐患。</p>
      )}
      {grouped.map((group) => {
        const hs = r.hazards.filter(
            (h) => `${h.scope.kind}:${h.scope.id}` === group,
          ),
          patient = r.patients.find((p) => p.uid === hs[0].scope.id),
          scores = patient ? liability(r, patient) : null;
        return (
          <details
            class="dossier-group"
            key={group}
            open={!compact && grouped.length < 3}
          >
            <summary>
              {patient
                ? `${patient.name} · ${patientCase(patient).title}`
                : hs[0].scope.kind === "project"
                  ? "科研项目卷宗"
                  : "个人与关系卷宗"}
              <span>{hs.length} 条</span>
            </summary>
            {scores && (
              <p class="small muted">
                责任分值 {scores.L.toFixed(1)} ·{" "}
                {patient!.damage >= 2 ? "严重损害已发生" : "未记录严重临床损害"}
              </p>
            )}
            {hs.map((h) => (
              <div class="hazard" key={h.id}>
                <span class="hazard-day">
                  第 {h.day} 天 · {{R:'诊疗',C:'沟通',D:'病历',F:'费用'}[h.type]}风险 {h.weight}
                </span>
                <h4>{h.reason}</h4>
                <p>当时的选择：{h.choice}</p>
                <p class="norm">制度依据：{h.norm}</p>
                {h.causal && (
                  <small>这一事项需要结合该患者的实际损害判断责任。</small>
                )}
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}
function Tribunal({ r, dispatch }: { r: Run; dispatch: (a: Action) => void }) {
  return (
    <main class="tribunal-page">
      <p class="eyebrow">第十五天 · 医疗纠纷复核</p>
      <h1>核对这十四天的处置</h1>
      <p class="tribunal-lead">
        医务科把相关病历、费用记录和同事说明放在你面前。
        需要核对的事项已经逐项列出。
      </p>
      <Dossier r={r} />
      <section class="last-question">
        <p class="eyebrow">最后一次陈述</p>
        <h2>「对这些记录，你有什么要说的？」</h2>
        <button
          class="choice"
          onClick={() => dispatch({ type: "testify", response: "facts" })}
        >
          <b>有疏漏就承认，但责任须对应事实。</b>
        </button>
        <button
          class="choice"
          onClick={() => dispatch({ type: "testify", response: "admit" })}
        >
          <b>如移交刑事程序，申请认罪认罚。</b>
        </button>
        <button
          class="choice"
          onClick={() => dispatch({ type: "testify", response: "silent" })}
        >
          <b>保持沉默。</b>
        </button>
        <p class="small muted">
          陈述不改写已经发生的行为。是否移交刑事程序，取决于实际损害、对应责任与立案检定。
        </p>
      </section>
    </main>
  );
}
/** Design doc 18 §7 verbatim. Never paraphrase, trim or add a summarizing line under it. */
const SUPPORT_PARAGRAPHS = [
  "人生的路还很长，医生只是职业的一种选择，未来还有很多可能。",
  "如果这段故事让你难受，先放下游戏。找家人、朋友，或者其他你信任的人，吃顿饭、散会儿步，聊聊最近过得怎么样。不知道怎么开口，也可以只说：“我最近有点撑不住，能陪我一会儿吗？”",
  "你可以休息，可以换一条路，也可以寻求专业帮助。遇到困难时就可以开口，不必一个人扛着。",
  "本游戏纯属虚构。它不是对你的评价，也不能替你决定未来。",
];
/** Shown after every dark main ending (all but END-40). No victory sound, no unlock banner, no reward copy. */
function SupportCard({ toTitle }: { toTitle?: () => void }) {
  const [resting, setResting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { void narrate(SUPPORT_PARAGRAPHS.join('\n')); return stopVoice; }, []);
  if (resting) return null;
  return (
    <section class="ending-support" aria-label="写给你的话">
      <h2>写给你</h2>
      {SUPPORT_PARAGRAPHS.map((text, i) => <p key={i}>{text}</p>)}
      {expanded && (
        <div class="ending-support-info">
          <p>中国大陆心理援助热线：<b>12356</b>。号码依据<a href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml" target="_blank" rel="noopener noreferrer">国家卫生健康委通知</a>。</p>
          <p>其他地区：<a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a> 提供查找当地支持资源的入口。</p>
          <p>若担心自己会立即伤害自己，请联系身边可信任的人，并寻求当地的紧急援助。</p>
        </div>
      )}
      <div class="ending-support-actions">
        <button class="secondary" onClick={() => setResting(true)}>先休息一下</button>
        {toTitle && <button class="secondary" onClick={toTitle}>返回标题</button>}
        <button class="secondary" aria-expanded={expanded} onClick={() => setExpanded(x => !x)}>查看支持信息</button>
      </div>
    </section>
  );
}
/** Renders one of the 40 END-xx main endings: image on top, book text below.
 * `r` and `meta` are omitted in the ?preview-ending= developer route, which skips
 * the case-file folds and the live experience summary rather than fabricate a Run. */
function StoryEndingPage({
  ending,
  storyId,
  r,
  meta,
  next,
  archive,
  share,
  toTitle,
}: {
  ending: Ending;
  storyId: StoryEndingId;
  r?: Run;
  meta?: Meta;
  next?: () => void;
  archive?: () => void;
  share?: () => void;
  toTitle?: () => void;
}) {
  const story = STORY_ENDINGS[storyId];
  const dark = storyId !== TRUE_ENDING_ID;
  useEffect(() => { void narrate([story.title, story.author, ...story.paragraphs].join('\n')); return stopVoice; }, [storyId]);
  return (
    <main class="ending-page ending-page-story">
      <img
        class="ending-story-image"
        src={`${import.meta.env.BASE_URL}${storyEndingImagePath(storyId)}`}
        width={1672}
        height={941}
        loading="lazy"
        alt={story.scene}
      />
      <div class="ending-intro ending-intro-story">
        <span class="eyebrow">
          {ending.id} / {ending.category} ·{" "}
          {r ? (r.day >= 15 ? "十四天之后" : `第 ${r.day} 天终止`) : "结局预览"}
        </span>
        <h1>{story.title}</h1>
        <span class="ending-story-author">{story.author}</span>
      </div>
      <article class="ending-paper">
        <div class="document-header">南屏市 · 轮转结算文书</div>
        {story.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
        {r?.roll?.kind === "tribunal" && (
          <p class="court-roll">
            刑事程序检定：骰点 {r.roll.face} / 要求 {r.roll.dc} ·{" "}
            {r.roll.success ? "未移交刑事程序" : "移交刑事程序"}
          </p>
        )}
        <footer>
          <p>本作人物、机构、制度、病例与结局均属虚构。</p>
        </footer>
      </article>
      {ending.annexes.length > 0 && (
        <section class="annexes">
          <h2>后来</h2>
          {ending.annexes.map((text, i) => (
            <div class="annex" key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{text}</p>
            </div>
          ))}
        </section>
      )}
      {dark && <SupportCard toTitle={toTitle} />}
      {r && (
        <>
          <details class="end-fold">
            <summary>事情从哪一天开始</summary>
            <Timeline r={r} onlyFacts />
          </details>
          <details class="end-fold">
            <summary>完整案卷</summary>
            <Dossier r={r} compact />
          </details>
        </>
      )}
      {r && meta && (
        <div class="end-summary">
          <span>已归档结局 <b>{meta.endings.length}</b></span>
          <span>可用经验 <b>{meta.xp}</b></span>
          <span>轮转码 <b>{r.seed}</b></span>
        </div>
      )}
      <div class="end-actions">
        {archive && <button class="primary" onClick={archive}>成长与旧档案</button>}
        {next && <button class="secondary" onClick={next}>再来一局</button>}
        {share && <button class="secondary" onClick={share}>分享这次结局</button>}
      </div>
    </main>
  );
}
function EndingView({
  r,
  meta,
  next,
  archive,
  share,
}: {
  r: Run;
  meta: Meta;
  next: () => void;
  archive: () => void;
  share: () => void;
}) {
  const e = r.ending!;
  const storyId = isStoryEndingId(e.storyId) ? e.storyId : undefined;
  useEffect(() => {
    if (storyId) return; // StoryEndingPage narrates the book text itself.
    void narrate([e.title, e.decision, e.epilogue, ...e.annexes].join('\n'));
    return stopVoice;
  }, [e.id, storyId]);
  if (storyId) return <StoryEndingPage ending={e} storyId={storyId} r={r} meta={meta} next={next} archive={archive} share={share} />;
  return (
    <main class="ending-page">
      <div class="ending-room" aria-hidden="true" />
      <div class="ending-intro">
        <span class="eyebrow">
          {e.id} / {e.category} ·{" "}
          {r.day >= 15 ? "十四天之后" : `第 ${r.day} 天终止`}
        </span>
        <h1>{e.title}</h1>
        <span class="ending-stamp">归档</span>
      </div>
      <article class="ending-paper">
        <div class="document-header">南屏市 · 轮转结算文书</div>
        <p>{e.decision}</p>
        <div class="paper-divider" />
        <div class="epilogue">{e.epilogue}</div>
        {r.roll?.kind === "tribunal" && (
          <p class="court-roll">
            刑事程序检定：骰点 {r.roll.face} / 要求 {r.roll.dc} ·{" "}
            {r.roll.success ? "未移交刑事程序" : "移交刑事程序"}
          </p>
        )}
        <footer>
          <p>本作人物、机构、制度、病例与结局均属虚构。</p>
          {['X20','X21','X22','X23','X24','X25','X26'].includes(e.id)&&<p>参考资源 · <a href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml" target="_blank" rel="noopener noreferrer">全国统一心理援助热线 12356</a></p>}
        </footer>
      </article>
      {e.annexes.length > 0 && (
        <section class="annexes">
          <h2>后来</h2>
          {e.annexes.map((text, i) => (
            <div class="annex" key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{text}</p>
            </div>
          ))}
        </section>
      )}
      <details class="end-fold">
        <summary>事情从哪一天开始</summary>
        <Timeline r={r} onlyFacts />
      </details>
      <details class="end-fold">
        <summary>完整案卷</summary>
        <Dossier r={r} compact />
      </details>
      <div class="end-summary">
        <span>
          已归档结局 <b>{meta.endings.length}</b>
        </span>
        <span>
          可用经验 <b>{meta.xp}</b>
        </span>
        <span>
          轮转码 <b>{r.seed}</b>
        </span>
      </div>
      <div class="end-actions">
        <button class="primary" onClick={archive}>
          成长与旧档案
        </button>
        <button class="secondary" onClick={next}>
          再来一局
        </button>
        <button class="secondary" onClick={share}>
          分享这次结局
        </button>
      </div>
    </main>
  );
}
function Timeline({ r, onlyFacts = false }: { r: Run; onlyFacts?: boolean }) {
  const entries = onlyFacts
    ? r.journal.filter(
        (j) =>
          j.flags.length > 0 ||
          (j.scope.kind === "patient" &&
            r.patients.find((p) => p.uid === j.scope.id)?.readmitted),
      )
    : r.journal;
  return (
    <div class="timeline">
      {entries.length === 0 ? (
        <p class="empty-state">这份记录还没有写下第一行。</p>
      ) : (
        [...entries].reverse().map((j) => (
          <article key={j.id}>
            <span class="timeline-day">D{String(j.day).padStart(2, "0")}</span>
            <div>
              <h3>{j.title}</h3>
              <p class="chosen-line">{j.choice}</p>
              <p>{j.result}</p>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
function Archive({
  meta,
  change,
}: {
  meta: Meta;
  change: (kind: UpgradeKind, key?: string) => void;
}) {
  const names=Object.fromEntries(ENDING_DEFINITIONS.map(e=>[e.id,e.title]));
  return (
    <div class="archive">
      <div class="archive-summary">
        <b>{meta.xp}</b>
        <span>
          可用经验
          <br />
          <small>
            完成 {meta.runs} 次轮转 · 记录 {meta.cases.length} 份病例
          </small>
        </span>
      </div>
      <p class="small muted">成长从下一局开始生效。旧档案留在当前设备。</p>
      <h3>悟性 · 可用 {meta.insight??0}</h3>
      <p class="small muted">完成重点病例且未留下严重问题、收录新资料、获得新结局和完成最终复核，都能获得悟性。经验用于提升基础属性，悟性用于解锁新的开局选择。</p>
      <div class="upgrade-grid">
        {([
          ['fourth-slot','第四个天赋槽',RULES.meta.fourthSlotCost,!!meta.fourthSlot,'开局可多选一项天赋'],
          ['redraw','开局多重抽一次',RULES.meta.redrawCost,(meta.extraRedraws??0)>=RULES.meta.redrawMax,`已增加 ${meta.extraRedraws??0} 次，最多增加 5 次`],
          ['reroll-token','每局一枚重掷令牌',RULES.meta.rerollCost,!!meta.rerollToken,'每个新局额外获得一次重掷'],
          ['attending','主治难度',RULES.meta.attendingCost,!!meta.attendingUnlocked,'所有检定难度 +2，经验 ×1.5'],
        ] as const).map(([kind,label,cost,full,detail])=><button class="upgrade" key={kind} disabled={full||(meta.insight??0)<cost} onClick={()=>change(kind)}><span>{label}</span><small>{detail}</small><small>{full?'已解锁':`${cost} 悟性`}</small></button>)}
      </div>
      <h3>留下的本领</h3>
      <div class="upgrade-grid">
        {(Object.keys(SKILL_LABELS) as Skill[]).map((key) => (
          <button
            class="upgrade"
            disabled={meta.xp < 3 || meta.skills[key] >= 3}
            onClick={() => change("skill", key)}
            key={key}
          >
            <span>
              {SKILL_LABELS[key]} <b>+{meta.skills[key]}</b>
            </span>
            <small>{meta.skills[key] >= 3 ? "已满" : "经验 3 · 永久 +1"}</small>
          </button>
        ))}
      </div>
      <button class="upgrade" disabled={(meta.depressionRank??0)>=RULES.meta.depressionMax||meta.xp<RULES.meta.depressionCost} onClick={()=>change('depression')}><span>开局压力积累 −{(meta.depressionRank??0)*5}</span><small>{(meta.depressionRank??0)>=RULES.meta.depressionMax?'已满':'3 经验 · 开局抑郁倾向再减 5'}</small></button>
      <h3>多撑一会</h3>
      <div class="upgrade-grid">
        {(Object.keys(VITAL_LABELS) as Vital[]).map((key) => (
          <button
            class="upgrade"
            disabled={meta.xp < 4 || meta.caps[key] >= 3}
            onClick={() => change("cap", key)}
            key={key}
          >
            <span>
              {VITAL_LABELS[key]}上限 <b>+{meta.caps[key] * 5}</b>
            </span>
            <small>{meta.caps[key] >= 3 ? "已满" : "经验 4 · 永久 +5"}</small>
          </button>
        ))}
        <button
          class="upgrade"
          disabled={meta.xp < 2 || meta.cashRank >= 3}
          onClick={() => change("cash")}
        >
          <span>
            积蓄 <b>+{money(meta.cashRank * 1000)}</b>
          </span>
          <small>{meta.cashRank >= 3 ? "已满" : "经验 2 · 开局 +¥1,000"}</small>
        </button>
      </div>
      <h3>结局簿 · {meta.endings.length}</h3>
      <div class="ending-collection">
        {Object.entries(names).map(([id, name]) => (
          <div class={meta.endings.includes(id) ? "unlocked" : ""} key={id}>
            <small>{id}</small>
            <b>{meta.endings.includes(id) ? name : "未归档"}</b>
          </div>
        ))}
      </div>
      <ArchiveLibrary meta={meta}/>
    </div>
  );
}

export function App() {
  const [initial] = useState(() => load(deviceStorage()));
  const [save, setSave] = useState<Save>(initial.save),
    ref = useRef(save);
  ref.current = save;
  const [view, setView] = useState<"title" | "setup" | "game">("title");
  const [panel, setPanel] = useState<
    "settings" | "archive" | "journal" | "ward" | "character" | "handbook" | "schedule" | null
  >(null);
  const [handbookQuery,setHandbookQuery]=useState('');
  const [warning, setWarning] = useState(initial.warning),
    [selected, setSelected] = useState<string | null>(null);
  const [imported, setImported] = useState<Save | null>(null),
    [replacement, setReplacement] = useState<Run | null>(null);
  const [notice, setNotice] = useState("");
  const [utility,setUtility]=useState<'coffee'|'nap'|null>(null);
  const [resigning,setResigning]=useState(false);
  const [encounter, setEncounter] = useState<string | null>(null);
  const [bedside,setBedside]=useState<string|null>(null);
  const [recordPatient,setRecordPatient]=useState<string|undefined>();
  const [recordPage,setRecordPage]=useState<RecordPage>('admission');
  const [ambient, setAmbient] = useState<{title:string;text:string;actor?:string}|null>(null);
  const r = save.run;
  /** QA/screenshot route for the 40 story endings: ?preview-ending=END-07. Reads only the URL; never touches save data. */
  const previewId: StoryEndingId | null = (() => {
    if (typeof location === "undefined") return null;
    const id = new URLSearchParams(location.search).get("preview-ending") ?? undefined;
    return isStoryEndingId(id) ? id : null;
  })();
  function exitEndingPreview() {
    const url = new URL(location.href);
    url.searchParams.delete("preview-ending");
    location.href = url.toString();
  }
  useEffect(bindAudioLifecycle, []);
  useEffect(() => configureAudio(save.settings), [save.settings]);
  useEffect(() => {
    const night = !!r && r.queue.slice(r.cursor).some(c=>c.kind==='night') && !r.queue.slice(r.cursor).some(c=>!['night','rest'].includes(c.kind));
    const good = !!r?.ending && (['X33','X34','X36'].includes(r.ending.id) || r.ending.storyId === TRUE_ENDING_ID);
    setMusicScene(musicSceneFor({
      inGame: view === 'game',
      phase: r?.phase ?? 'play',
      san: r?.vitals.san ?? 100,
      day: r?.day ?? 1,
      night,
      endingGood: good,
      card: r ? currentCard(r) : undefined,
    }));
  }, [view, r?.day, r?.phase, r?.cursor, r?.vitals.san]);
  const guide=parseGuide(save.guide??{version:1,enabled:false,seen:[]});
  const welcome=view==='game'&&r?.phase==='play'&&guide.enabled&&!guide.seen.includes('welcome-seen');
  function commit(next: Save) {
    ref.current = next;
    setSave(next);
    const storage = deviceStorage();
    const error=storage ? persist(next, storage) : "浏览器存储不可用。请导出存档。";
    setWarning(error);
    return !error;
  }
  function dispatch(a: Action): Run | null {
    const previous = ref.current.run;
    if (!previous) return null;
    const next = act(previous, a);
    if (next !== previous) {
      let nextGuide=parseGuide(ref.current.guide??{version:1,enabled:false,seen:[]});
      const observed=(event:GuideEvent)=>{nextGuide=reduceGuide(nextGuide,{type:'observe',event});};
      if(a.type==='choose'&&currentCard(previous)?.patientId) {
        observed('choice-committed');
        if(!availableOptions(previous).find(option=>option.id===a.id)?.check) observed('choice-without-check');
      }
      if(a.type==='ack-roll'&&previous.roll?.kind==='choice') observed('choice-roll-seen');
      if(next.day>previous.day || (next.phase==='roll'&&next.roll?.kind==='day')) observed('handoff-completed');
      cue(ref.current.settings.sound, a.type === "choose" ? "choice" : "paper");
      commit({
        ...ref.current,
        guide:nextGuide,
        run: next,
        meta: next.ending ? reward(ref.current.meta, next) : ref.current.meta,
      });
      setSelected(null);
      setUtility(null);
    }
    return next;
  }
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(
    () =>
      registerGameTools(
        () => ref.current.run,
        (a) => dispatchRef.current(a),
      ),
    [],
  );
  useEffect(() => {
    document.documentElement.classList.toggle(
      "large-text",
      save.settings.largeText,
    );
    document.documentElement.classList.toggle(
      "reduce-motion",
      !save.settings.motion,
    );
  }, [save.settings]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]') ||
        (e.target as HTMLElement)?.matches("input,textarea,select") ||
        panel ||
        selected ||
        utility ||
        view !== "game" ||
        r?.phase !== "play" || !encounter || !!ambient ||
        encounter !== (currentCard(r)?.patientId ?? currentCard(r)?.id)
      )
        return;
      if (/^[1-9]$/.test(e.key)) {
        const o = availableOptions(r).filter(o=>o.interaction!=='graph-continue')[Number(e.key) - 1];
        if (o) {
          e.preventDefault();
          setSelected(o.id);
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [r, view, panel, selected, utility, encounter, ambient]);
  function begin(
    name: string,
    seed: string,
    ids: string[],
    difficulty: Run["difficulty"],
    partner: PartnerSetting = "none",
  ) {
    const identity=`${seed}:${Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(36)).join('-')}`;
    const next = startRun(seed, name, ids, save.meta, difficulty, identity, { partner });
    if (r && r.phase !== "ending") setReplacement(next);
    else {
      commit({ ...save, run: next, guide:save.guide??initialGuideState() });
      setEncounter(null);setBedside(null);setAmbient(null);
      setView("game");
    }
  }
  async function share() {
    if (!r?.ending) return;
    const text = `我在 Tyche 的第 ${Math.min(14, r.day)} 天，走到了「${r.ending.title}」。轮转码：${r.seed}。`;
    try {
      if (navigator.share)
        await navigator.share({
          title: `Tyche · ${r.ending.title}`,
          text,
          url: "https://mycyg.github.io/tyche/",
        });
      else {
        await navigator.clipboard.writeText(
          `${text}\nhttps://mycyg.github.io/tyche/`,
        );
        setNotice("结局与轮转码已复制。");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        download(
          "tyche-ending.txt",
          `${text}\nhttps://mycyg.github.io/tyche/`,
          "text/plain",
        );
        setNotice("已导出结局文字。");
      }
    }
  }
  const chosen =
    r?.phase === "play"
      ? availableOptions(r).find((x) => x.id === selected)
      : undefined;
  useEffect(()=>{if(chosen){void narrate(chosen.label,'hero');return stopVoice;}},[chosen?.id]);
  const game = r && view === "game";
  const activeCard = r ? currentCard(r) : undefined;
  const feedbackCard=r?feedbackSource(r):undefined;
  const talking = !!(r?.phase === "play" && activeCard && (r.emergency||encounter === (activeCard.patientId ?? activeCard.id)));
  function observeGuide(event:GuideEvent) {
    const before=parseGuide(ref.current.guide??{version:1,enabled:false,seen:[]});
    const after=reduceGuide(before,{type:'observe',event});
    if(after!==before) commit({...ref.current,guide:after});
  }
  function closeEncounter(){setEncounter(null);setBedside(null);setAmbient(null);}
  function openHandbook(topic=''){setHandbookQuery(topic);setPanel('handbook');}
  function openSchedule(){observeGuide('schedule-open');setPanel('schedule');}
  function openRecoveryGuide(){observeGuide('recovery-open');openHandbook('体力');}
  function openRecords(patientId?:string,page:RecordPage='admission') {
    setRecordPatient(patientId);setRecordPage(page);setPanel('journal');
    if(patientId || ref.current.run?.patients.length) observeGuide('chart-open');
  }
  function visit(card: Card) { dispatch({type:"focus",id:card.id}); setEncounter(card.patientId ?? card.id); setBedside(ref.current.run?.patients.some(p=>p.uid===card.patientId&&p.active)?card.patientId??null:null); setAmbient(null); }
  function continueFeedback() {
    const next=dispatch({type:'continue'});
    if(next?.phase==='play' && encounter!==(currentCard(next)?.patientId??currentCard(next)?.id)) closeEncounter();
    if(next && r && next.day!==r.day) closeEncounter();
    if(next && bedside && !next.patients.find(p=>p.uid===bedside)?.active) setBedside(null);
  }
  function savePosition(p: NonNullable<Run["world"]>) { const run = ref.current.run; if(!run || run.phase !== "play" || !walkable(p)) return; if(run.world && Math.hypot(run.world.x-p.x,run.world.y-p.y)<1 && run.world.facing === p.facing) return; commit({...ref.current,run:{...run,world:{x:p.x,y:p.y,facing:p.facing,day:run.day}}}); }
  return (
    <div
      class="app-shell"
      style={{ "--pressure": r ? Math.min(1, (r.day - 1) / 13) : 0 }}
    >
      {previewId ? (
        <div class="rpg-terminal">
          <button class="secondary rpg-terminal-back" onClick={exitEndingPreview}>
            退出预览 · 返回标题
          </button>
          <StoryEndingPage
            ending={{ id: previewId, storyId: previewId, title: STORY_ENDINGS[previewId].title, category: "结局预览", decision: "", epilogue: "", annexes: [], court: false }}
            storyId={previewId}
            toTitle={exitEndingPreview}
          />
        </div>
      ) : (
        <>
      {view === "title" && (
        <Title
          save={save}
          begin={() => setView("setup")}
          resume={() => setView("game")}
          archive={() => setPanel("archive")}
          settings={() => setPanel("settings")}
        />
      )}
      {view === "setup" && (
        <Setup meta={save.meta} begin={begin} cancel={() => setView("title")} />
      )}
      {game && (
        r.phase === 'ending' ? <div class="rpg-terminal"><button class="secondary rpg-terminal-back" onClick={()=>setView('title')}>返回标题</button><EndingView r={r} meta={save.meta} next={()=>setView('setup')} archive={()=>setPanel('archive')} share={()=>void share()} /></div>
        : r.phase === 'tribunal' ? <div class="rpg-terminal"><Tribunal r={r} dispatch={dispatch} /></div>
        : <WorldStage r={r} motion={save.settings.motion} visualInterference={save.settings.visualInterference} dialogueOpen={talking || !!ambient || r.phase === 'feedback' || welcome} frozen={r.phase !== 'play' || !!panel || !!selected || !!utility || talking || !!ambient || !!bedside || welcome || !!replacement || !!imported}
            onEncounter={visit} onPatient={id=>{setBedside(id);setEncounter(null);setAmbient(null);}} onBedNear={()=>observeGuide('bed-near')}
            guide={!talking&&!ambient&&!bedside&&!welcome&&r.phase==='play'?<>{guide.enabled&&<GuideSteps state={guide} onOpenManual={()=>openHandbook()} onOpenSchedule={openSchedule} onOpenRecovery={openRecoveryGuide} onSkip={()=>commit({...ref.current,guide:reduceGuide(guide,{type:'skip'})})}/>}<ContextGuide r={r} open={openHandbook}/></>:undefined}
            onAmbient={(title,text,actor)=>{setAmbient({title,text,actor});}} onMenu={p=>p==='journal'?openRecords():p==='schedule'?openSchedule():setPanel(p)} onAction={a=>{closeEncounter();if(a.type==='coffee'||a.type==='nap'){observeGuide('recovery-open');setUtility(a.type);}else dispatch(a);}}
            onPosition={savePosition} onTitle={()=>setView('title')}>
          {bedside && <Bedside r={r} patientId={bedside} motion={save.settings.motion} onRecords={page=>openRecords(bedside,page)} onClose={closeEncounter} />}
          {talking && <RpgScene r={r} onSelect={setSelected} close={closeEncounter} records={()=>openRecords(activeCard?.patientId)} />}
          {welcome && <Dialogue actor="nurse" title="第一班 · 带教" text="“先看右上角的当班待办，点一项就能走过去。走近人物或病床，按 E，也可以点右下角的交互键。接诊前先翻床头病历夹；没查过的，别当成正常。排班和状态不明白，就翻值班手册。”"><div class="dialogue-result"><button class="dialogue-next" onClick={()=>observeGuide('welcome-seen')}>开始值班 ▸</button><button class="text-button" onClick={()=>commit({...ref.current,guide:reduceGuide(guide,{type:'skip'})})}>我熟悉操作，跳过指引</button></div></Dialogue>}
          {ambient && <Dialogue actor={ambient.actor} title={ambient.title} text={ambient.text} close={()=>setAmbient(null)}><div class="dialogue-result"><button class="dialogue-next" onClick={()=>setAmbient(null)}>结束交谈 ▸</button></div></Dialogue>}
          {r.phase === 'feedback' && r.feedback && <Dialogue actor={feedbackCard?.actor} speechActor={feedbackVoiceActor(r)} patient={r.patients.find(p=>p.uid===feedbackCard?.patientId)} title={r.feedback.title} text={r.feedback.text}><div class="dialogue-result"><div class="delta-list">{r.feedback.changes.map((t,i)=><span key={i}>{t}</span>)}</div><button class="dialogue-next" onClick={continueFeedback}>{r.feedback.next === 'check' ? '结束本日 · 掷骰' : r.feedback.next === 'day' ? r.day === 14 ? '参加医疗纠纷复核 ▸' : '迎接下一天 ▸' : '继续 ▸'}</button>{resignationAvailable(r) && <button class="text-button" onClick={()=>setResigning(true)}>提桶跑路</button>}</div></Dialogue>}
        </WorldStage>
      )}
      {warning && (
        <div class="storage-warning" role="status">
          <span>{warning}</span>
          <button onClick={() => download("tyche-progress.json", encode(save))}>
            导出存档
          </button>
        </div>
      )}
      {notice && (
        <div class="toast" role="status">
          {notice}
        </div>
      )}
      {game&&r&&utility&&<RecoveryPrompt r={r} action={utility} close={()=>setUtility(null)} confirm={()=>{const action=utility;setUtility(null);dispatch({type:action});}}/>}
      {game&&r&&resigning&&<Modal title="提桶跑路" close={()=>setResigning(false)}>
        <p class="feedback-text">你现在就去更衣室收拾东西，轮转到今天为止。已经发生的诊疗、费用和记录都留在原处，之后仍会有人来核对。</p>
        <p class="small muted">确认后进入离职场景，本局不再继续。</p>
        <div class="modal-actions"><button class="secondary" onClick={()=>setResigning(false)}>再想一下</button><button class="primary danger" disabled={!resignationAvailable(r)} onClick={()=>{setResigning(false);dispatch({type:'resign'});}}>确认离职</button></div>
      </Modal>}
      {chosen && r && (
        <Modal title="确认这次选择" close={() => setSelected(null)}>
          <p class="confirm-choice">{chosen.label}</p>
          <Cost o={chosen} r={r} detail />
          <ClinicalChoiceNotice r={r} o={chosen}/>
          <p class="small muted">{currentCard(r)?.kind==='night'?'这次按夜班分钟结算，不扣白班行动值。':'行动值决定能安排多少事务，体力反映做完这些事有多疲劳。'} 阅读说明、打开病历和停下来考虑都不计时。</p>
          <PaymentPreview o={chosen} r={r} />
          <CheckPreview o={chosen} r={r} />
          {currentCard(r)?.kind!=='night'&&Math.max(0, optionAp(r,chosen,currentCard(r)) - r.ap) > 0 && (
            <p class="warning-line">
              这次行动会透支身体，三项上限在本局内无法通过睡眠恢复。当前值高于新上限时，会先降到新上限，再扣本次体力；因此满体力时，实际下降可能多于标出的体力消耗。
            </p>
          )}
          <p class="small muted">
            {chosen.check?'先掷骰，接受点数后执行并结算。返回标题或刷新不会改变已经掷出的点数。':'确认后执行并留下记录，已执行的选择不能撤回。'}
          </p>
          <div class="modal-actions">
            <button class="secondary" onClick={() => setSelected(null)}>
              再想一下
            </button>
            <button
              class="primary"
              onClick={() => dispatch({ type: "choose", id: chosen.id })}
            >
              就这样做
            </button>
          </div>
        </Modal>
      )}
      {game && r.phase === "roll" && r.roll && (
        <RollView
          key={`${r.roll.id}:${r.roll.revision??0}`}
          r={r}
          motion={
            save.settings.motion &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          }
          sound={save.settings.sound}
          done={() => dispatch({ type: "ack-roll" })}
          reroll={()=>dispatch({type:'reroll'})}
        />
      )}
      {game && r.phase === "debuff" && (
        <Modal title="夜里留下的东西">
          <p class="feedback-text">
            {r.roll?.face === 1
              ? "你没能缓过这一夜的疲劳，需要从下面三项持续状态中选两项。"
              : "你这一夜没有缓过来，需要从下面三项持续状态中选一项。"}
          </p>
          <p class="eyebrow">还需选择 {r.debuffPicks} 项</p>
          <div class="debuff-choices">
            {r.offered.map((id) => {
              const d = DEBUFFS.find((x) => x.id === id)!;
              return (
                <button
                  class="debuff-card"
                  key={id}
                  onClick={() => dispatch({ type: "debuff", id })}
                >
                  <h3>{d.name}</h3>
                  <p>{d.text}</p>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {game && r.phase === "funding" && (
        <Modal title="余额不足">
          <p class="feedback-text">
            资金缺口 <strong>{money(-r.cash)}</strong>
            。已提交的处置与费用记录留在账上。
          </p>
          <p class="small">
            信用借贷按日计息。当前日利率{" "}
            {(
              100 *
              (0.03 +
                (r.talents.includes("T24") ? 0.01 : 0) +
                (r.debuffs.includes("B17") ? 0.01 : 0))
            ).toFixed(0)}
            %。
          </p>
          <div class="choices">
            <button
              class="choice"
              onClick={() => dispatch({ type: "fund", method: "credit" })}
            >
              <b>刷信用额度，补齐差额</b>
            </button>
            {!r.facts["family-funding"] && (
              <button
                class="choice"
                onClick={() => dispatch({ type: "fund", method: "family" })}
              >
                <b>向家里求助 ¥5,000</b>
                <small>本局一次 · 家人 −2 · 情绪 −10</small>
              </button>
            )}
            {!r.facts["asset-sold"] && (
              <button
                class="choice"
                onClick={() => dispatch({ type: "fund", method: "asset" })}
              >
                <b>卖掉闲置设备 · ¥3,500</b>
                <small>本局一次 · 情绪 −5</small>
              </button>
            )}
            <button
              class="choice danger"
              onClick={() => dispatch({ type: "fund", method: "stop" })}
            >
              <b>不再垫付，终止轮转</b>
            </button>
          </div>
        </Modal>
      )}
      {panel && (
        <Modal
          title={
            {
              settings: "设置与存档",
              archive: "旧档案",
              journal: "床头病历夹",
              ward: "住院部",
              character: r?.name ?? "值班医生",
              handbook:"值班手册",
              schedule:"本次轮转 · 排班表",
            }[panel]
          }
          close={() => setPanel(null)}
          wide={panel !== "settings"}
        >
          {panel === "archive" && (
            <Archive
              meta={save.meta}
              change={(kind, key) =>
                commit({ ...save, meta: upgrade(save.meta, kind, key) })
              }
            />
          )}
          {panel === "ward" && (r ? <Board r={r} /> : <p>还没有开始轮转。</p>)}
          {panel === 'schedule' && r && <Schedule r={r} borrow={()=>{setPanel(null);dispatch({type:'borrow'});}} handbook={()=>openHandbook('排班')} />}
          {panel === "journal" &&
            (r ? <><RecordBook r={r} initialPatient={recordPatient} initialPage={recordPage}/><details class="help"><summary>值班日记 · 其他经历</summary><Timeline r={r}/></details></> : <p>还没有记录。</p>)}
          {panel==='handbook' && <GuideManual key={handbookQuery} initialQuery={handbookQuery} onClose={()=>setPanel(null)}/>}
          {panel === "character" && r && (
            <div class="character-stats">
              <Stats r={r} />
              <div class="relation-grid">
                {Object.entries(RELATION_LABELS).map(([k, label]) => (
                  <div key={k}>
                    <span>{label}</span>
                    <b>
                      {"■".repeat(r.relations[k as keyof Run["relations"]])}
                      <i>
                        {"□".repeat(
                          5 - r.relations[k as keyof Run["relations"]],
                        )}
                      </i>
                    </b>
                  </div>
                ))}
              </div>
              <p>
                声望 {displayNumber(r.reputation)} / 100 · 抑郁倾向 {displayNumber(r.depression)} / 100
              </p>
              <p>
                私人借款 {money(r.privateDebt)} · 待收款 {money(r.receivable)}
              </p>
              <p>
                当日收入 {money(r.income)} · 当日利息 {money(r.interest)}
              </p>
              <p>{incomeCoverage(r).days?`近期实际日均收入 ¥${incomeCoverage(r).daily.toLocaleString('zh-CN',{maximumFractionDigits:2})}（${incomeCoverage(r).days} 个结算日）`:'近期平均收入待结算'} · 连续未覆盖利息 {r.uncoveredDays}/{RULES.debtGrace} 日</p>
              <h3>天赋</h3>
              {r.talents.map((id) => {
                const t = TALENTS.find((t) => t.id === id);
                return (
                  t && (
                    <p key={id}>
                      <b>{t.name}</b><br/><small>本领：{TALENT_GUIDE[id].summary}<br/>代价：{TALENT_GUIDE[id].tradeoff}<br/>{TALENT_GUIDE[id].use}</small>
                    </p>
                  )
                );
              })}
              <h3>持续状态与不适</h3>
              {r.debuffs.length === 0 && (
                <p class="muted">暂时没有持续不适。</p>
              )}
              {r.debuffs.map((id) => {
                const d = DEBUFFS.find((x) => x.id === id);
                return (
                  d && (
                    <p key={id}>
                      <b class="danger">{d.name}</b>　{d.text}
                    </p>
                  )
                );
              })}
            </div>
          )}
          {panel === "settings" && (
            <div class="settings">
              <h3>声音</h3>
              {(['music', 'voice', 'sound'] as const).map(channel => {
                const label = {music:'背景音乐', voice:'对白与文字朗读', sound:'操作音效'}[channel];
                const key = `${channel}Volume` as 'musicVolume' | 'voiceVolume' | 'soundVolume';
                const defaultLevel = {music:.4, voice:.85, sound:.5}[channel];
                return <div class="audio-setting" key={channel}>
                  <label class="setting-row"><span>{label}</span><input type="checkbox" checked={save.settings[channel] !== false} onChange={e=>commit({...save,settings:{...save.settings,[channel]:e.currentTarget.checked}})} /></label>
                  <label class="audio-volume"><span>{label}音量</span><input type="range" min="0" max="100" step="5" value={Math.round((save.settings[key] ?? defaultLevel)*100)} onInput={e=>commit({...save,settings:{...save.settings,[key]:Number(e.currentTarget.value)/100}})} /><output>{Math.round((save.settings[key] ?? defaultLevel)*100)}%</output></label>
                </div>;
              })}
              <button class="secondary full" onClick={()=>void narrate('先核对床号和姓名。家属刚送来的药也看一下，别漏了院外用药。','nurse')}>试听语音</button>
              <p class="small muted">对白播放时，音乐会降低音量。字幕始终保留；关掉声音不影响选择和检定。</p>
              <h3>画面与阅读</h3>
              <label class="setting-row">
                <span>低精神状态的画面与环境干扰</span>
                <input
                  type="checkbox"
                  checked={save.settings.visualInterference !== false}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    commit({
                      ...save,
                      settings: { ...save.settings, visualInterference: value },
                    });
                  }}
                />
              </label>
              <p class="small muted">关闭环境干扰可避免画面变暗和异常人影，状态数值与检定规则不变。检查的重要结果不会被隐藏。</p>
              <label class="setting-row">
                <span>角色、骰子与界面动效</span>
                <input
                  type="checkbox"
                  checked={save.settings.motion}
                  onChange={(e) =>
                    commit({
                      ...save,
                      settings: {
                        ...save.settings,
                        motion: e.currentTarget.checked,
                      },
                    })
                  }
                />
              </label>
              <label class="setting-row">
                <span>大号文字</span>
                <input
                  type="checkbox"
                  checked={save.settings.largeText}
                  onChange={(e) =>
                    commit({
                      ...save,
                      settings: {
                        ...save.settings,
                        largeText: e.currentTarget.checked,
                      },
                    })
                  }
                />
              </label>
              <p class="small muted">
                存档只保存在此设备的浏览器中。更换设备或清理网站数据之前，请先导出。
              </p>
              {view === "game" && <button class="secondary full" onClick={() => { if(!commit(ref.current)){setNotice('本次进度未能写入浏览器，请先导出存档。');return;}setPanel(null); setView("title"); }}>{warning?'重试保存并返回标题':'保存并返回标题'}</button>}
              {r && <button class="secondary full" onClick={openSchedule}>查看排班表</button>}
              <button class="secondary full" onClick={()=>openHandbook()}>翻开值班手册</button>
              {r && <button class="secondary full" onClick={()=>{commit({...ref.current,guide:initialGuideState()});closeEncounter();setPanel(null);setView('game');}}>重新开启上岗指引</button>}
              <button
                class="secondary full"
                onClick={() => download("tyche-progress.json", encode(save))}
              >
                导出全部进度
              </button>
              <label class="import-label secondary">
                导入存档
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const input = e.currentTarget;
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 3_000_000)
                        throw new Error("存档文件过大。");
                      setImported(decode(await file.text()));
                    } catch (error) {
                      setNotice((error as Error).message || "无法读取存档。");
                    }
                    input.value = "";
                  }}
                />
              </label>
              <details class="help">
                <summary>操作与规则</summary>
                <p>
                  WASD / 方向键移动，E / 空格交互，J 打开病历；1—9 选择当前编号选项，确认后执行。Esc 关闭最上层可返回窗口，在病区打开设置。手机可横屏或竖屏游玩。游戏没有现实时间倒计时，可以停下阅读。
                </p>
                <p>
                  骰子结果在选择提交时确定。刷新或退出不会重掷。相同轮转码在相同天赋、成长和选择下可重现事件。
                </p>
                <p>
                  危险的提前出院有 80%
                  概率引发次日严重恶化回院；出院录音、后续举报与实际伤害共同进入个案调查。住院期的费用申诉也需要检定。
                </p>
                <p>{FICTION}</p>
              </details>
              <a
                class="source-link"
                href="https://github.com/mycyg/tyche"
                target="_blank"
                rel="noreferrer"
              >
                源码与问题反馈 · GitHub
              </a>
            </div>
          )}
        </Modal>
      )}
      {imported && (
        <Modal title="替换当前存档" close={() => setImported(null)}>
          <p>
            导入 {imported.meta.runs} 次轮转记录
            {imported.run ? `，当前进度为${dayName(imported.run.day)}` : ""}
            。本机当前进度将被替换。
          </p>
          <div class="modal-actions">
            <button
              class="secondary"
              onClick={() => download("tyche-before-import.json", encode(save))}
            >
              先导出现有进度
            </button>
            <button
              class="primary"
              onClick={() => {
                commit(imported);
                setImported(null);
                setPanel(null);
                setView("title");
              }}
            >
              确认导入
            </button>
          </div>
        </Modal>
      )}
      {replacement && (
        <Modal title="开始新的轮转？" close={() => setReplacement(null)}>
          <p>
            目前这局还没有结束。新轮转将替换当前进度，已获得的经验与档案保留。
          </p>
          <div class="modal-actions">
            <button
              class="secondary"
              onClick={() => {
                setReplacement(null);
                setView("game");
              }}
            >
              回到当前轮转
            </button>
            <button
              class="primary"
              onClick={() => {
                commit({ ...save, run: replacement,guide:save.guide??initialGuideState() });
                closeEncounter();
                setReplacement(null);
                setView("game");
              }}
            >
              开始新轮转
            </button>
          </div>
        </Modal>
      )}
        </>
      )}
    </div>
  );
}
