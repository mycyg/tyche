import { ENTITY_BY_ID } from '../content/patients';
import type { PatientEntity } from '../content/patients';
import type { Card, Effects, Option, Patient, Run } from './types';
import { runRandom } from './run-random';
import tuning from '../content/patients/tuning.json';
import {minorDialogue} from '../content/patients/participant-copy';
import {isPrivateEntryHistory} from '../content/patients/entry-copy';

export interface PatientGateCard extends Card {
  patientGate: { patientId: string; optionId: string; reason: 'self-pay' | 'arrears'; consentFlag: string; refusedFlag: string };
}
export interface PatientDirectorResult {
  card?: PatientGateCard;
  cards?: Card[];
  effects?: Effects;
  patch?: Partial<Patient>;
  returnCard?: Card;
  stopLocalCare?: boolean;
}
export const isPatientGate = (card: Card): card is PatientGateCard => 'patientGate' in card;
const flag = (p: Patient, name: string) => `patient:${p.uid}:${name}`;
const choiceKey = (o: Option) => o.clinicalChoice ?? o.id;
export const patientConsentFlag = (p: Patient, o: Option) => flag(p, `consent:${choiceKey(o)}`);
export const patientRefusalFlag = (p: Patient, o: Option) => flag(p, `refused:${choiceKey(o)}`);
/** Encounter-scoped evidence of a completed T12 full examination. Repeated
 * application of the same action cannot lower the tendency again. */
export const patientComplaintReliefFlag = (p: Patient, o: Option) => flag(p, `complaint-relief:${choiceKey(o)}`);
const isCheck = (o: Option) => o.cost > 0 && (o.mechanics?.operation !== undefined
  ? ['observe', 'exam', 'full-exam'].includes(o.mechanics.operation)
  : /检查|检验|化验|影像|超声|心电|核磁|CT|MRI|抽血|血气|培养/.test(o.label) && !/拒绝|不做|不查|省略/.test(o.label));

export function patientCheckAdjustment(r: Run, p: Patient, option: Option) {
  const entity = patientProfile(r, p);
  const result = { dcDelta: 0, advantage: false, disadvantage: false, automaticFailure: false };
  if (!entity || !option.check) return result;
  const history = option.mechanics?.checkOperation === 'history' || option.mechanics?.operation === 'history';
  const observation = ['observe', 'exam', 'full-exam'].includes(option.mechanics?.checkOperation ?? option.mechanics?.operation ?? '');
  const comfort = option.check.skill === 'comfort';
  const translated = !!r.facts[`preset:${p.caseId}:${p.uid}:entity:语言障碍:addressed`];
  const alone = /^(无|本人(?:（录音者）)?$)/.test(entity.companion);
  if (history) {
    result.dcDelta += entity.concealment;
    if (!alone && !option.id.endsWith(':private') && !isPrivateEntryHistory(option.id)) result.dcDelta += 2;
    if (entity.flags.includes('认知障碍')) { result.dcDelta += 2; result.automaticFailure = alone; }
    if (entity.flags.includes('语言障碍') && !translated) result.dcDelta += 2;
    if (entity.flags.includes('被押送')) result.dcDelta += 1;
    if (entity.flags.includes('医护同行')) result.dcDelta -= 1;
  }
  if (observation && entity.flags.includes('多重用药')) result.dcDelta += 1;
  if (comfort) {
    result.dcDelta += entity.complaintTendency;
    if (entity.flags.includes('语言障碍') && !translated) result.dcDelta += 1;
    if (entity.flags.includes('医护同行')) result.dcDelta += 1;
    if (entity.flags.includes('律师')) result.dcDelta += 2;
    if (entity.payment.startsWith('商保')) result.dcDelta += 1;
    result.advantage = entity.visit > 1 && entity.priorGood;
  }
  if (option.effects.discharge || /出院评估/.test(option.label)) {
    result.dcDelta += Number(entity.flags.includes('认知障碍')) * 2 - Number(entity.adherence === '高');
  }
  if (entity.flags.includes('关系户') && option.check.skill === 'persuade' && option.mechanics?.actor === 'chief') result.advantage = true;
  return result;
}

export function patientProfile(r: Run, p: Pick<Patient, 'entityId' | 'uid'>): (PatientEntity & { visit: number; priorGood: boolean; nonAdherent: boolean }) | undefined {
  const original = p.entityId ? ENTITY_BY_ID.get(p.entityId) : undefined;
  if (!original) return;
  const current = r.patients.findIndex(previous => previous.uid === p.uid);
  const prior = r.patients.filter((previous, index) => previous.entityId === p.entityId && previous.uid !== p.uid && (current < 0 || index < current));
  const priorGood = prior.some(previous => !!r.facts[`preset:${previous.caseId}:${previous.uid}:success`] && previous.damage <= previous.mitigated);
  const complaint = original.flags.includes('律师') ? 3 : Math.max(original.complaintTendency, original.flags.includes('自媒体') ? 2 : 0);
  const snapshot = (p as Patient).preset?.entityProfile;
  const relief = Object.keys(r.facts).filter(key => key.startsWith(`patient:${p.uid}:complaint-relief:`)).length;
  return { ...(snapshot ?? original), visit: prior.length + 1, priorGood,
    concealment: snapshot?.concealment ?? Math.max(0, original.concealment - Number(prior.length > 0)),
    complaintTendency: Math.max(0, (snapshot?.complaintTendency ?? Math.min(3, complaint + Number(prior.length > 0 && !priorGood))) - relief),
    nonAdherent: prior.length > 0 && original.adherence === '低',
  };
}

/** Called before charging, committing, or rolling the requested clinical option.
 * A gate only confirms consent; the original clinical choice remains unexecuted. */
export function preflightPatientChoice(r: Run, p: Patient, card: Card, option: Option): PatientDirectorResult {
  if (isPatientGate(card)) return {};
  const entity = patientProfile(r, p);
  if (!entity || !isCheck(option)) return {};
  const consentFlag = patientConsentFlag(p, option), refusedFlag = patientRefusalFlag(p, option);
  if (r.facts[consentFlag] || r.facts[refusedFlag]) return {};
  const arrears = entity.payment.includes('欠费');
  const selfPay = entity.payment.startsWith('自费') || entity.payment.includes('未备案');
  if (!arrears && (!selfPay || runRandom(r, `${p.uid}:refusal:${choiceKey(option)}`) >= .2)) return {};
  const id = flag(p, `gate:${choiceKey(option)}`);
  const decline: Effects = { flags: [refusedFlag, flag(p, 'refused-examination')] };
  const consent: Effects = { flags: [consentFlag, ...(arrears ? [flag(p, 'arrears-assessment-approved')] : [])] };
  const minor=minorDialogue(entity),speaker=minor?.listener??'患者',actor=minor?'family' as const:'patient' as const;
  const gate: PatientGateCard = { id, kind: card.kind, shiftPhase: card.shiftPhase ?? r.shiftPhase,
    scope: { kind: 'patient', id: p.uid }, patientId: p.uid, caseId: p.caseId, last: false,
    title: arrears ? `${p.name} · 检查费还没有着落` : `${p.name} · 这项检查能不能不做`,
    text: `${minor?speaker:p.name}还没有同意「${option.label}」。这项检查尚未执行，也尚未记入费用。${arrears ? '患者账户有欠费，需要说明必要性及后续结算安排。' : `${speaker}担心自付费用，希望先了解检查目的、替代选择和不检查的风险。`}${minor?'签字须核实监护人权限或紧急备案，不能只凭陪诊关系代签。':''}`,
    patientGate: { patientId: p.uid, optionId: option.id, reason: arrears ? 'arrears' : 'self-pay', consentFlag, refusedFlag },
    options: [
      { id: `${id}:explain`, label: minor?`向${speaker}解释必要性、费用及风险，核实授权与具体同意`:arrears ? '说明必要性与援助途径，征得同意后再执行' : '解释检查目的、费用和不做的风险，询问本人决定', ap: 0, minutes: 3, cost: 0,
        mechanics: { operation: 'comfort', actor, quality: 'correct' }, effects: consent,
        result: `${minor?'这项检查的具体同意及监护人权限或备案依据已核实':'患者同意了这项检查'}。请回到原处置页核对代价并确认执行；目前还没有检查结果。`,
        check: { skill: 'comfort', dc: tuning.clinicalDc[Math.max(0, Math.min(13, r.day - 1))], purpose: `确认${speaker}是否理解并愿意接受这项检查`, failureHint: `${speaker}仍拒绝，原检查不会执行。`, failure: decline, failureText: `${speaker}仍然拒绝。你记录了已解释的风险，原检查尚未执行。需要重新选择可接受的安排。` } },
      { id: `${id}:signed`, label: '尊重拒绝，签署具体拒检记录并另选方案', ap: 0, minutes: 3, cost: 0,
        mechanics: { operation: 'refusal-signature', actor, quality: 'correct' }, effects: decline,
        result: `拒绝的项目、已解释的风险和${minor?'监护人权限或备案依据及具体决定':'患者决定'}均已记录。该检查未执行、未收费；原处置页保留其他可选安排。` },
      { id: `${id}:unsigned`, label: '接受拒检，但不签具体拒绝记录', ap: 0, minutes: 1, cost: 0,
        mechanics: { operation: 'other', actor: 'patient', quality: 'incorrect', unsignedConsent: true },
        effects: { ...decline, hazards: [{ type: 'C', weight: entity.flags.includes('律师') ? 30 : 15, reason: '接受拒检但未留下具体知情拒绝记录', norm: '说明拒绝项目、风险及替代方案，并记录本人决定。', causal: false }] },
        result: '检查没有执行，也没有收费；这次拒绝缺少具体记录。' },
    ],
  };
  return { card: gate };
}

/** Never turns a refused test into a completed graph requirement. If all choices
 * are unavailable, the engine's real transfer interaction stops local care. */
export function patientVisibleOptions(r: Run, p: Patient, card: Card, options: Option[] = card.options): Option[] {
  if (isPatientGate(card)) return options;
  const visible = options.filter(o => !r.facts[patientRefusalFlag(p, o)]);
  if (visible.length || !Object.keys(r.facts).some(key => key.startsWith(flag(p, 'refused:')))) return visible;
  return [{ id: `${card.id}:patient-transfer`, label: '联系可接收的团队，带原始记录转接', ap: 1, minutes: 20, cost: 0,
    interaction: 'transfer', mechanics: { operation: 'consult', actor: 'other', quality: 'correct' },
    effects: { flags: [flag(p, 'transferred-after-refusal')] },
    result: '接收团队已经确认。未执行的检查仍标为未完成，原病史、拒检记录与当前风险一并转交。' }];
}

/** Post-commit effects are returned to the engine for a single atomic settlement. */
export function afterPatientChoice(r: Run, p: Patient, card: Card, option: Option, success = true, terminalOutcome = false, actualEffects?: Effects): PatientDirectorResult {
  const entity = patientProfile(r, p);
  if (!entity) return {};
  const effects: Effects = { flags: [] };
  const cards: Card[] = [];
  let stopLocalCare = false;
  const add = (key: string) => { effects.flags!.push(flag(p, key)); };
  const once = (key: string) => !r.facts[flag(p, key)] && !effects.flags!.includes(flag(p, key));
  const notice = (key: string, title: string, text: string) => cards.push({ id: flag(p, key), kind: card.kind, shiftPhase: card.shiftPhase ?? r.shiftPhase,
    scope: { kind: 'patient', id: p.uid }, patientId: p.uid, caseId: p.caseId, title, text, last: false,
    options: [{ id: flag(p, `${key}:ack`), label: '核对记录，继续处理这位患者', ap: 0, minutes: 0, cost: 0, result: '消息与原处置记录一并保留。', effects: {} }] });
  const operation = option.mechanics?.operation;
  const history = operation === 'history' || /问诊|补问|病史/.test(option.label);
  if (!isPatientGate(card) && history && once('recording-checked')) {
    add('recording-checked');
    const probability = entity.flags.includes('自媒体') || entity.companion.includes('录音者') ? 1 : [0, .1, .3, .6][entity.complaintTendency];
    if (runRandom(r, `${p.uid}:recording`) < probability) {
      add('recorded'); effects.emotion = -5;
      notice('recording-notice', `${p.name} · 正在录音`, '患者或陪同者正在记录本次交流。你知道谈话会被保留，需要继续说明病情与决定，同时保护其他患者的资料。录音本身不代表已经发生投诉。');
    }
  }
  if (!success && operation === 'comfort' && (entity.companion.includes('录音者') || r.facts[flag(p, 'recorded')])) effects.emotion = (effects.emotion ?? 0) - 5;
  if (!success && option.check?.skill === 'comfort' && entity.flags.includes('精神障碍史') && once('left-without-completing-care') && runRandom(r, `${p.uid}:left-after-comfort:${option.id}`) < tuning.departureAfterFailedComfortRate) {
    add('left-without-completing-care'); stopLocalCare = true;
    effects.hazards = [{ type: 'R', weight: 10, reason: '沟通失败后患者自行离院，必要评估尚未完成', norm: '应记录尚未完成的评估、已解释的风险和可用的返院联络方式。', causal: false }];
    notice('departure-notice', `${p.name} · 自行离院`, '患者离开了诊区，本次必要评估尚未完成。你保留了已做与未做的项目，并记录离院经过和返院联络方式。这不是同意转院，也没有接收团队确认。');
  }
  const applied = actualEffects ?? (!success && option.check ? option.check.failure : option.effects);
  if (entity.flags.includes('医护同行') && applied.hazards?.some(h => h.type === 'R') && once(`peer-notice:${option.id}`)) {
    add(`peer-notice:${option.id}`); effects.reputation = (effects.reputation ?? 0) - 2;
    notice(`peer-warning:${option.id}`, `${p.name} · 指出遗漏`, '患者指出了本次必要评估中的遗漏。原选择已经记入病历，后续仍可重新评估和补救。');
  }
  if (entity.flags.includes('VIP') && /拒绝.*(?:加急|加项)|公平分级/.test(option.label) && once('vip-queue-refused')) {
    add('vip-queue-refused'); effects.reputation = (effects.reputation ?? 0) - 2;
  }
  const terminal = stopLocalCare || terminalOutcome || option.next === 'END' || applied.discharge || option.interaction === 'transfer';
  if (terminal && once('outcome-reviewed')) {
    add('outcome-reviewed');
    const bad = stopLocalCare || p.damage > p.mitigated || r.hazards.some(h => h.scope.kind === 'patient' && h.scope.id === p.uid) ||
      !!applied.hazards?.length || r.facts[`preset:${p.caseId}:${p.uid}:followup-neglected`];
    if (bad && runRandom(r, `${p.uid}:complaint`) < [0, .1, .25, .5][entity.complaintTendency]) {
      add('complaint'); effects.reputation = (effects.reputation ?? 0) - 5;
      const wouldEscalate = r.reputation < 20 || entity.flags.includes('VIP');
      const suppression = `complaint-suppressed:${p.uid}`;
      const suppressed = wouldEscalate && !!r.facts[suppression];
      if (suppressed) { effects.clear = [...effects.clear ?? [], suppression]; add('complaint-escalation-postponed'); }
      const escalated = wouldEscalate && !suppressed;
      if (escalated) add('complaint-escalated');
      notice('complaint-notice', entity.flags.includes('律师') ? `${p.name} · 来函要求复核` : `${p.name} · 提出投诉`,
        `${entity.flags.includes('律师') ? '患者递交了书面函件' : '患者要求复核本次处置'}，争议材料包括这位患者的原始记录与后续情况。${escalated ? '医务科已经直接受理，需要按原记录回应。' : suppressed ? '家属暂时没有向上升级，科室先核对经过。此前隐瞒的说法、初次投诉和诊疗风险仍然保留。' : '科室先核对具体经过，投诉不会自动替代事实认定。'}`);
    }
    if (entity.flags.includes('自媒体')) {
      add(bad ? 'video-posted' : 'video-positive'); effects.reputation = (effects.reputation ?? 0) + (bad ? -15 : 3);
      if (bad) notice('video-notice', `${p.name} · 公开视频`, '患者发布了本次就诊的视频，医务科要求核对视频与对应病历。视频出现的内容、未拍到的过程和真实后果需要分别说明。');
    }
    if (entity.payment.includes('欠费') && r.facts[flag(p, 'arrears-assessment-approved')]) {
      add('arrears-billing'); notice('arrears-notice', `${p.name} · 后续催缴`, '必要评估已经完成，收费处联系患者核对欠费和可用援助。催缴记录属于患者账户，不是把全部账单转为医生自付。');
    }
  }
  return { effects, cards, stopLocalCare };
}
