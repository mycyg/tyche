import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  act,
  availableOptions,
  currentCard,
  reward,
  startRun,
  upgrade,
} from "../game/engine";
import { auditScore, liability } from "../game/endings";
import { patientCase } from "../game/cards";
import { actionMinutes, patientPayment, previewCheckModifier } from "../game/costs";
import { CASES, DEBUFFS, TALENTS } from "../game/catalog";
import {
  ACTORS,
  RELATION_LABELS,
  RULES,
  SKILL_LABELS,
  VITAL_LABELS,
} from "../game/rules";
import { shuffled } from "../game/random";
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
  Meta,
  Option,
  Run,
  Skill,
  Vital,
} from "../game/types";
import { Dice } from "./Dice";
import { cue } from "./audio";
import { registerGameTools } from "./WebMCP";
import { WorldStage } from "../world/WorldStage";
import { walkable } from "../world/navigation";
import { Bedside, PatientPortrait } from "../world/Bedside";
import { RecordBook, type RecordPage } from "./RecordBook";
import { TALENT_GUIDE } from "./copy";
import { GuideSteps, GuideManual, initialGuideState, parseGuide, reduceGuide, type GuideEvent } from "./Guide";

const money = (n: number) => `¥${Math.round(n).toLocaleString("zh-CN")}`;
const dayName = (n: number) =>
  n === 15 ? "鉴定庭" : `第 ${String(n).padStart(2, "0")} 天`;
const KIND = {
  clinical: "接诊",
  ward: "病区",
  story: "来访",
  quick: "门诊",
  night: "夜班",
  rest: "交班之后",
  audit: "旧事回院",
};
const FICTION =
  "本作人物、医院、制度、病例与结局均为虚构，不构成医疗、法律或财务建议。含医疗事故、债务、精神崩溃与刑事判决情节。";
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
    <div class="rpg-title-content"><h1 class="rpg-title-logo">TYCHE</h1><p class="rpg-title-subtitle">十四天轮转。第十五天，鉴定庭。</p>
      <nav class="rpg-title-menu" aria-label="主菜单">
        {active && <button onClick={resume}>继续轮转 · 第 {save.run!.day} 天</button>}
        <button onClick={begin}>新的轮转</button>
        {save.run?.phase === 'ending' && <button onClick={resume}>上一份结局</button>}
        <button onClick={archive}>轮回档案</button><button onClick={settings}>设置与存档</button>
      </nav><small>{FICTION}</small><a href="https://github.com/mycyg/tyche" target="_blank" rel="noreferrer">GitHub · MIT</a>
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
    [difficulty, setDifficulty] = useState<Run["difficulty"]>("rotation");
  const talentOrder = shuffled(
    TALENTS,
    seed,
    `talents:${redraws}`,
  );
  const offered=talentOrder.filter((t) => !picks.includes(t.id)).slice(0, 6 - picks.length);
  const cards = [
    ...picks.map((id) => TALENTS.find((t) => t.id === id)!),
    ...offered,
  ].sort((a,b)=>talentOrder.indexOf(a)-talentOrder.indexOf(b));
  function toggle(id: string) {
    if (picks.includes(id)) setPicks(picks.filter((x) => x !== id));
    else if (
      picks.length < 3 &&
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
          <h1>你的名字在值班表上。</h1>
          <p>
            「先从五床看起。这层楼，你得接住。」
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
            <option value="attending">主治 · 检定难度 +2</option>
          </select>
        </label>
      </div>
      <div class="section-line">
        <h2>带上什么，留下什么</h2>
        <span>天赋 {picks.length} / 3</span>
      </div>
      <p class="muted small">选三项本领带进这次轮转，同类最多两项。点「选入」后仍可取消；重抽只更换未选中的天赋。</p>
      <div class="talent-grid">
        {cards.map((t) => {
          const picked=picks.includes(t.id), explanation=TALENT_GUIDE[t.id];
          const familyFull=picks.filter(id=>TALENTS.find(t=>t.id===id)?.family===t.family).length>=2;
          const blocked=!picked&&(picks.length>=3||familyFull);
          return <article
            key={t.id}
            class={`talent-card ${picked ? "chosen" : ""}`}
          >
            <span class="talent-top">
              <small>{t.family}</small>
              <span>{picked ? "■ 已选入" : ""}</span>
            </span>
            <h3>{t.name}</h3>
            <p class="talent-summary">{explanation?.summary??t.benefit}</p>
            <p class="talent-benefit"><b>本领</b> {t.benefit}</p>
            <p class="price"><b>代价</b> {t.price}</p>
            {explanation && <details class="talent-details"><summary>具体会怎样？</summary><p>{explanation.use}</p><p>{explanation.tradeoff}</p></details>}
            <button class="talent-select" aria-pressed={picked} disabled={blocked} onClick={()=>toggle(t.id)}>{picked?'取消选择':blocked?familyFull?'同类已选满两项':'已选满三项':'选入'}<span class="sr-only"> · {t.name}</span></button>
          </article>;
        })}
      </div>
      <div class="setup-footer">
        <button
          class="secondary"
          disabled={redraws >= 5}
          onClick={() => setRedraws(redraws + 1)}
        >
          重抽未锁定项 · {5 - redraws}
        </button>
        <button
          class="primary"
          disabled={picks.length !== 3 || !seed.trim()}
          onClick={() => begin(name, seed, picks, difficulty)}
        >
          接过胸牌 →
        </button>
      </div>
      <details class="help">
        <summary>上班之前</summary>
        <p>
          每天 10 行动值。最多预支明天 4 点，每点使三项上限各扣
          1。行动值不够仍能继续，每点透支扣 5 体力，并使三项上限各扣
          2。第十四天不能预支。
        </p>
        <p>
          病组预算以病人为单位结算，超支部分由你垫付。借贷按日计息，连续两天收入不够支付利息会结束本局。私人借款单列，不会自动免除。
        </p>
        <p>
          住院时间会带来费用与床位压力。未排除风险就出院，可能导致患者回院、家属录音与举报。
        </p>
        <p>
          日终掷一枚二十面骰，点数加上耐受加成，达到当天门槛就通过。后面的夜晚更难撑过。失败后从三项负面状态中选择一项；掷出 1
          选两项，掷出 20 可解除一项可恢复状态。
        </p>
        <p>
          SAN、体力、情绪归零有不同后果。来到鉴定庭后，隐患与对应责任公开。结局解锁带来经验，用于下一周目的属性成长。
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
              {r.vitals[key]}
              <small>/{r.caps[key]}</small>
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
                  {c.age<1?'婴儿':`${c.age} 岁`} · {c.sex}
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
  const overflow = Math.max(0, o.ap - r.ap);
  const card = currentCard(r);
  const patient = r.patients.find(p => p.uid === card?.patientId);
  const payment = patient ? patientPayment(r, patient, o) : undefined;
  const minutes = actionMinutes(r, o, card);
  return (
    <div class="choice-cost">
      <span>{o.ap > 0 ? `消耗 ${o.ap} 行动` : "不消耗行动"}</span>
      {minutes > 0 && <span>耗时 {minutes} 分钟</span>}
      {payment && payment.treatment > 0 && <span>诊疗记账 {money(payment.treatment)}</span>}
      {payment && (payment.treatment > 0 || payment.personal > 0) && <span class={payment.personal ? "danger" : ""}>{o.check && o.effects.bill ? "审核通过后自付" : "本次自付"} {money(payment.personal)}</span>}
      {!!o.effects.cash && (
        <span class={o.effects.cash < 0 ? "" : "positive"}>
          个人余额 {o.effects.cash > 0 ? "+" : "−"}
          {money(Math.abs(o.effects.cash))}
        </span>
      )}
      {!!o.effects.income && <span>收入 +{money(o.effects.income)}</span>}
      {o.check && (
        <span class="check-tag">
          {SKILL_LABELS[o.check.skill]}检定
        </span>
      )}
      {overflow > 0 && (
        <span class="danger">
          透支 {overflow} 点
          {detail
            ? ` · 体力 −${overflow * RULES.overtimeStamina} · 三项上限各 −${overflow * RULES.overtimeCapLoss}`
            : ""}
        </span>
      )}
    </div>
  );
}
function CheckPreview({ o, r }: { o: Option; r: Run }) {
  if (!o.check) return null;
  const check = o.check, modifier = previewCheckModifier(r,o,currentCard(r));
  const clinical = ["clinical", "night"].includes(currentCard(r)?.kind ?? "");
  const purpose = check.purpose ?? (clinical
    ? "能否一次完成这次核查"
    : ({ observe:"能否发现对方遗漏的信息",clinical:"能否按计划完成处置",record:"材料能否通过审核",persuade:"对方是否接受这项请求",comfort:"对方是否接受你的解释",endure:"能否承受这一轮压力" }[check.skill]));
  return <section class="check-explanation" aria-label="检定规则">
    <h3>{SKILL_LABELS[check.skill]}检定 · {purpose}</h3>
    <p>掷一枚二十面骰，得到 1—20 点。<strong>点数 {modifier >= 0 ? "+" : "−"} {Math.abs(modifier)} ≥ {check.dc + (r.difficulty === "attending" ? 2 : 0)}</strong> 就通过。</p>
    <p class="small muted">{SKILL_LABELS[check.skill]}加成 {modifier >= 0 ? "+" : ""}{modifier}。掷出 20 必过，掷出 1 必败。{check.skill === "comfort" && r.debuffs.includes("B11") ? "录音焦虑：掷两次，取较低点数。" : ""}</p>
    <p class="check-stakes"><b>未通过：</b>{check.failureHint ?? (clinical ? "仍会完成所选行动，但额外消耗 1 行动和 3 体力。" : check.failureText)}</p>
  </section>;
}
function PaymentPreview({ o, r }: { o: Option; r: Run }) {
  const patient = r.patients.find(p => p.uid === currentCard(r)?.patientId);
  if (!patient || (!o.cost && !o.effects.bill)) return null;
  const payment = patientPayment(r, patient, o);
  return <section class="payment-explanation" aria-label="费用去向">
    <h3>费用去向 · {patient.name}</h3>
    <p>患者累计诊疗费 {money(patient.spent)} → {money(payment.spent)}<br />病组预算 {money(patient.budget)}{payment.budget !== patient.budget && ` → ${money(payment.budget)}（审核通过后）`}</p>
    <p>{payment.personal > 0 ? `超出预算的部分由你承担，本次从个人余额扣 ${money(payment.personal)}。` : payment.refund > 0 ? `审核通过后退还已垫费用 ${money(payment.refund)}。` : "费用仍在预算内，本次不扣个人余额。"}</p>
    <small>诊疗费计入该患者的病组账本，不是医生收入。{o.check && o.effects.bill ? "若审核未通过，维持原预算。" : ""}</small>
  </section>;
}
function Dialogue({ actor, title, text, close, children, patient }: { actor?: string; title: string; text: string; close?: () => void; children?: ComponentChildren; patient?:{caseId:string;name:string} }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => { const listener = (e: KeyboardEvent) => { if(e.key === 'Escape' && close) { e.preventDefault(); e.stopPropagation(); close(); } }; const first = el.current?.querySelector<HTMLElement>('button'); first?.focus({preventScroll:true}); window.addEventListener('keydown',listener); return () => window.removeEventListener('keydown',listener); }, []);
  return <section class="rpg-dialogue" ref={el} role="dialog" aria-label={title}>
    {actor && ACTORS[actor] ? <div class="dialogue-portrait"><Portrait actor={actor} /></div> : patient && <div class="dialogue-portrait dialogue-patient"><PatientPortrait caseId={patient.caseId} name={patient.name} /></div>}
    <div class="dialogue-main"><div class="dialogue-heading"><h2>{actor && ACTORS[actor] ? ACTORS[actor].name : title}</h2>{actor && <span>{title}</span>}{close && <button onClick={close} aria-label="结束交谈">×</button>}</div>
      <div class="dialogue-body"><p class="dialogue-text">{text}</p><div>{children}</div></div>
    </div></section>;
}
function RpgScene({ r, onSelect, close, records }: { r:Run; onSelect:(id:string)=>void; close:()=>void; records:()=>void }) {
  const card = currentCard(r); if(!card) return null;
  const patient = r.patients.find(p=>p.uid === card.patientId);
  return <Dialogue actor={card.actor} patient={patient} title={patient ? patient.name+' · '+card.title : card.title} text={card.text} close={close}>
    <div class="dialogue-options">{availableOptions(r).map((o,i)=><button class="dialogue-option" key={o.id} onClick={()=>onSelect(o.id)}><b>{i+1}</b><span>{o.label}<Cost o={o} r={r} /></span></button>)}</div>
    {patient && <button class="dialogue-record" onClick={records}>翻开床头病历夹</button>}
  </Dialogue>;
}

function RollView({
  r,
  done,
  motion,
  sound,
}: {
  r: Run;
  done: () => void;
  motion: boolean;
  sound: boolean;
}) {
  const [toss, setToss] = useState<{x:number;y:number} | null>(null),
    [settled, setSettled] = useState(false);
  const thrown = useRef(false);
  const cast = !!toss;
  function throwDice(velocity = {x:.6,y:-.9}) {
    if(thrown.current) return;
    thrown.current = true;
    cue(sound,"dice");
    setToss(velocity);
  }
  const roll = r.roll!;
  return (
    <Modal title={roll.label}>
      <div class="roll-content">
        <p class="eyebrow">
          {roll.kind === "day" ? `${dayName(r.day)} / 结束检定` : "命运检定"}
        </p>
        <Dice roll={roll} motion={motion && !settled} toss={toss}
          onToss={throwDice} onImpact={()=>cue(sound,"dice")}
          onDone={() => setSettled(true)} />
        <div class="roll-math">
          <span>{settled ? roll.face : "骰子点数"}</span>
          <span>
            {roll.modifier >= 0 ? "+" : "−"} {Math.abs(roll.modifier)}
          </span>
          <span>{settled && roll.face+roll.modifier<roll.dc?'＜':'≥'}</span>
          <b>{roll.dc}</b>
        </div>
        <p class="muted small">二十面骰：1—20 点；加成后达到门槛就通过。<br />掷出 20 必过 · 掷出 1 必败</p>
        {settled && (
          <div
            class={`roll-result ${roll.success ? "positive" : "danger"}`}
            aria-live="polite"
          >
            <b>{roll.face}</b>
            <span>
              {roll.face === 20
                ? "大成功"
                : roll.face === 1
                  ? "大失败"
                  : roll.success
                    ? "成功"
                    : "失败"}
            </span>
            <small>
              总值 {roll.face + roll.modifier} / 难度 {roll.dc}
              {roll.second !== undefined ? " · 安抚取低" : ""}
            </small>
          </div>
        )}
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
          <button class="primary full" onClick={done}>
            接受结果 →
          </button>
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
          审查值 <b>{auditScore(r)}</b>
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
                  D{String(h.day).padStart(2, "0")} · {h.type} {h.weight}
                </span>
                <h4>{h.reason}</h4>
                <p>当时的选择：{h.choice}</p>
                <p class="norm">制度依据：{h.norm}</p>
                {h.causal && (
                  <small>因果事项 · 仍与本名患者的实际结局对应</small>
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
      <p class="eyebrow">DAY 15 / THE INQUIRY</p>
      <h1>现在，逐条读出。</h1>
      <p class="tribunal-lead">
        桌上没有骰盅。只有这一轮留下的记录。
        <br />
        有关同事、项目和病人的材料，分卷放在你面前。
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
            立案 d20：{r.roll.face} / 门槛 {r.roll.dc} ·{" "}
            {r.roll.success ? "未移交刑事程序" : "移交刑事程序"}
          </p>
        )}
        <footer>本作人物、机构、制度、病例与结局均属虚构。</footer>
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
  change: (kind: "skill" | "cap" | "cash", key?: string) => void;
}) {
  const names: Record<string, string> = {
    X01: "一年",
    X02: "缓刑",
    X06: "统方",
    X07: "暂停执业",
    X09: "追回",
    X11: "原件",
    X14: "调解",
    X17: "值班室",
    X20: "抢救室",
    X21: "病假条",
    X22: "值班室的窗",
    X24: "接走",
    X25: "解除劳动合同",
    X26: "白噪音",
    X28: "利息",
    X29: "催收",
    X31: "提桶",
    X32: "离职后的询问",
    X33: "下一站",
    X34: "联络人",
    X35: "延期",
    X36: "带组",
  };
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
    "settings" | "archive" | "journal" | "ward" | "character" | "handbook" | null
  >(null);
  const [warning, setWarning] = useState(initial.warning),
    [selected, setSelected] = useState<string | null>(null);
  const [imported, setImported] = useState<Save | null>(null),
    [replacement, setReplacement] = useState<Run | null>(null);
  const [notice, setNotice] = useState("");
  const [encounter, setEncounter] = useState<string | null>(null);
  const [bedside,setBedside]=useState<string|null>(null);
  const [recordPatient,setRecordPatient]=useState<string|undefined>();
  const [recordPage,setRecordPage]=useState<RecordPage>('admission');
  const [speaker, setSpeaker] = useState<string | undefined>();
  const [ambient, setAmbient] = useState<{title:string;text:string;actor?:string}|null>(null);
  const r = save.run;
  const guide=parseGuide(save.guide??{version:1,enabled:false,seen:[]});
  const welcome=view==='game'&&r?.phase==='play'&&guide.enabled&&!guide.seen.includes('welcome-seen');
  function commit(next: Save) {
    ref.current = next;
    setSave(next);
    const storage = deviceStorage();
    setWarning(
      storage ? persist(next, storage) : "浏览器存储不可用。请导出存档。",
    );
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
        (e.target as HTMLElement)?.matches("input,textarea,select") ||
        panel ||
        selected ||
        view !== "game" ||
        r?.phase !== "play" || !encounter || !!ambient ||
        encounter !== (currentCard(r)?.patientId ?? currentCard(r)?.id)
      )
        return;
      if (/^[1-4]$/.test(e.key)) {
        const o = availableOptions(r)[Number(e.key) - 1];
        if (o) {
          e.preventDefault();
          setSelected(o.id);
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [r, view, panel, selected, encounter, ambient]);
  function begin(
    name: string,
    seed: string,
    ids: string[],
    difficulty: Run["difficulty"],
  ) {
    const next = startRun(seed, name, ids, save.meta, difficulty);
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
  const game = r && view === "game";
  const activeCard = r ? currentCard(r) : undefined;
  const talking = !!(r?.phase === "play" && activeCard && encounter === (activeCard.patientId ?? activeCard.id));
  function observeGuide(event:GuideEvent) {
    const before=parseGuide(ref.current.guide??{version:1,enabled:false,seen:[]});
    const after=reduceGuide(before,{type:'observe',event});
    if(after!==before) commit({...ref.current,guide:after});
  }
  function closeEncounter(){setEncounter(null);setBedside(null);setAmbient(null);}
  function openRecords(patientId?:string,page:RecordPage='admission') {
    setRecordPatient(patientId);setRecordPage(page);setPanel('journal');
    if(patientId || ref.current.run?.patients.length) observeGuide('chart-open');
  }
  function visit(card: Card) { dispatch({type:"focus",id:card.id}); setEncounter(card.patientId ?? card.id); setBedside(ref.current.run?.patients.some(p=>p.uid===card.patientId&&p.active)?card.patientId??null:null); setSpeaker(card.actor); setAmbient(null); }
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
        : <WorldStage r={r} motion={save.settings.motion} dialogueOpen={talking || !!ambient || r.phase === 'feedback' || welcome} frozen={r.phase !== 'play' || !!panel || !!selected || talking || !!ambient || !!bedside || welcome || !!replacement || !!imported}
            onEncounter={visit} onPatient={id=>{setBedside(id);setEncounter(null);setAmbient(null);}} onBedNear={()=>observeGuide('bed-near')}
            guide={guide.enabled&&!talking&&!ambient&&!bedside&&!welcome&&r.phase==='play'?<GuideSteps state={guide} onOpenManual={()=>setPanel('handbook')} onSkip={()=>commit({...ref.current,guide:reduceGuide(guide,{type:'skip'})})}/>:undefined}
            onAmbient={(title,text,actor)=>{setAmbient({title,text,actor});setSpeaker(actor);}} onMenu={p=>p==='journal'?openRecords():setPanel(p)} onAction={a=>{closeEncounter();setSpeaker(undefined);dispatch(a);}}
            onPosition={savePosition} onTitle={()=>setView('title')}>
          {bedside && <Bedside r={r} patientId={bedside} motion={save.settings.motion} onRecords={page=>openRecords(bedside,page)} onClose={closeEncounter} />}
          {talking && <RpgScene r={r} onSelect={setSelected} close={closeEncounter} records={()=>openRecords(activeCard?.patientId)} />}
          {welcome && <Dialogue actor="nurse" title="第一班 · 带教" text="“先去五床。走近患者，按 E 或点交互。床头夹先翻一翻，没查过的，别当成正常。今天做什么，由你决定。”"><div class="dialogue-result"><button class="dialogue-next" onClick={()=>observeGuide('welcome-seen')}>先去看患者 ▸</button><button class="text-button" onClick={()=>commit({...ref.current,guide:reduceGuide(guide,{type:'skip'})})}>我熟悉操作，跳过指引</button></div></Dialogue>}
          {ambient && <Dialogue actor={ambient.actor} title={ambient.title} text={ambient.text} close={()=>setAmbient(null)}><div class="dialogue-result"><button class="dialogue-next" onClick={()=>setAmbient(null)}>结束交谈 ▸</button></div></Dialogue>}
          {r.phase === 'feedback' && r.feedback && <Dialogue actor={speaker} patient={r.patients.find(p=>p.uid===bedside)} title={r.feedback.title} text={r.feedback.text}><div class="dialogue-result"><div class="delta-list">{r.feedback.changes.map((t,i)=><span key={i}>{t}</span>)}</div><button class="dialogue-next" onClick={continueFeedback}>{r.feedback.next === 'check' ? '结束本日 · 掷骰' : r.feedback.next === 'day' ? r.day === 14 ? '前往鉴定庭 ▸' : '迎接下一天 ▸' : '继续 ▸'}</button></div></Dialogue>}
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
      {chosen && r && (
        <Modal title="确认这次选择" close={() => setSelected(null)}>
          <p class="confirm-choice">{chosen.label}</p>
          <Cost o={chosen} r={r} detail />
          <PaymentPreview o={chosen} r={r} />
          <CheckPreview o={chosen} r={r} />
          {Math.max(0, chosen.ap - r.ap) > 0 && (
            <p class="warning-line">
              这次行动会透支身体，三项上限在本局内无法通过睡眠恢复。
            </p>
          )}
          <p class="small muted">
            确认后留下记录；返回标题或刷新不改变已经掷出的结果。
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
          key={r.roll.id}
          r={r}
          motion={
            save.settings.motion &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          }
          sound={save.settings.sound}
          done={() => dispatch({ type: "ack-roll" })}
        />
      )}
      {game && r.phase === "debuff" && (
        <Modal title="夜里留下的东西">
          <p class="feedback-text">
            {r.roll?.face === 1
              ? "这一夜，你没能撑住。三项中留下两项。"
              : "这一夜没能缓过来。三项中留下一个。"}
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
            待补差额 <strong>{money(-r.cash)}</strong>
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
      {game && r.phase === "collapse" && (
        <Modal title="你得先坐下来">
          <p class="feedback-text">
            姜蓉扶住你，把凳子拉到身后。「别站着了。」
          </p>
          <p class="small muted">
            第一次体力归零。体力上限 −20，恢复至上限的一半；再次归零将结束轮转。
          </p>
          <div class="choices">
            <button
              class="choice"
              onClick={() => dispatch({ type: "collapse", method: "help" })}
            >
              <b>请同事接一会班</b>
              <small>同事关系 −1</small>
            </button>
            <button
              class="choice"
              onClick={() => dispatch({ type: "collapse", method: "report" })}
            >
              <b>向科室报告身体状况</b>
              <small>声望 −15</small>
            </button>
            <button
              class="choice"
              onClick={() => dispatch({ type: "collapse", method: "clinic" })}
            >
              <b>去做评估 · ¥600</b>
              <small>解除胃痛</small>
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
          {panel === "journal" &&
            (r ? <><RecordBook r={r} initialPatient={recordPatient} initialPage={recordPage}/><details class="help"><summary>值班日记 · 其他经历</summary><Timeline r={r}/></details></> : <p>还没有记录。</p>)}
          {panel==='handbook' && <GuideManual onClose={()=>setPanel(null)}/>}
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
                声望 {r.reputation} / 100 · 抑郁 {r.depression} / 100
              </p>
              <p>
                私人借款 {money(r.privateDebt)} · 待收款 {money(r.receivable)}
              </p>
              <p>
                当日收入 {money(r.income)} · 当日利息 {money(r.interest)}
              </p>
              <h3>天赋</h3>
              {r.talents.map((id) => {
                const t = TALENTS.find((t) => t.id === id);
                return (
                  t && (
                    <p key={id}>
                      <b>{t.name}</b>　{TALENT_GUIDE[t.id]?.summary??t.benefit}<br/><small>本领：{t.benefit}。代价：{t.price}。</small>
                    </p>
                  )
                );
              })}
              <h3>身上留下的东西</h3>
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
              <label class="setting-row">
                <span>音效</span>
                <input
                  type="checkbox"
                  checked={save.settings.sound}
                  onChange={(e) => {
                    const value = e.currentTarget.checked;
                    commit({
                      ...save,
                      settings: { ...save.settings, sound: value },
                    });
                    cue(value);
                  }}
                />
              </label>
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
              {view === "game" && <button class="secondary full" onClick={() => { setPanel(null); setView("title"); }}>保存并返回标题</button>}
              <button class="secondary full" onClick={()=>setPanel('handbook')}>翻开值班手册</button>
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
                  点击选项后确认；键盘 1—4 选择当前选项，Esc
                  关闭可返回的窗口。手机可横屏或竖屏游玩。游戏没有现实时间倒计时，可以随时停下阅读。
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
    </div>
  );
}
