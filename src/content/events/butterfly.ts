import data from './authored.json';
import type { Effects, Scope } from '../../game/types';
import { compileClauses, EVENT_BY_ID, mergeEventEffects } from './catalog';
import {RULES}from '../../game/rules';
import type {DeadlineChange}from './butterfly-deadlines';
import type {PatientReviewEvidence}from './patient-review';

export type ButterflyId = 'BTF-001' | 'BTF-002' | 'BTF-003' | 'BTF-004';
export interface ButterflySubjects { patientId?: string; actorId: string; projectId?: string; datasetId?: string; paymentId?: string; recordId?: string; shiftId?: string; sponsorId?: string; familyActorId?: string; familyBillId?:string; offerAssetId?:string; recipientIds?: string[] }
export interface ButterflyFact {
  id: string; type: string; scope: Scope; sourceChoiceId: string; day: number;
  subjects: ButterflySubjects; knownBy: string[]; amount?: number;
  deadlineChanges?:DeadlineChange[];
  reviewEvidence?:PatientReviewEvidence;
  observations?: { actorId: string; source: string; day: number; channel: 'present' | 'delivered-record' | 'direct-message' }[];
}
export interface ButterflyState {
  entrySource?:'department-teaching'|'existing-complaint';
  id: string; chain: ButterflyId; subjects: ButterflySubjects; scope: Scope;
  cursor: string; consumed: string[]; consumedResources: string[]; facts: ButterflyFact[];
  commitments: { id: string; type: string; actorId: string; task: string; status: 'accepted' | 'completed' | 'cancelled'; due: number; source: string; completedDay?:number;resumeDay?:number }[];
  receivable: number; privateDebt: number; paid: number;
  receivableDueDay?:number;privateDebtDueDay?:number;
  receivableAttempts?:{due:number;day:number;roll:number;received:number}[];
  status: 'active' | 'dormant' | 'closed'; resolution?: string;
}
export interface ButterflyWorld {
  day: number; cash: number; ap: number;
  /** Actual independent facts, never inferred from a player's virtue or relations. */
  facts: readonly string[];
  actorAvailable: boolean;
  conditions?: Readonly<Record<string, boolean>>;
  repaymentAvailable?: number;
  boundPatientId?: string;
  boundProjectId?: string;
  boundFamilyBillId?:string;
  final?: boolean;
  freeSubmissionCosts?:boolean;
  transactionId?:string;
  reviewChainIds?:readonly string[];
}
export interface ButterflyChoice {
  id: string; localId: string; label: string; requires: string; cost: string; outcome: string; targets: string[];
  produces: string[]; consumes: string[];
}
export interface ButterflyNode {
  id: string; localId: string; title: string; text: string; entrance: string;
  requiredFacts: string[]; options: ButterflyChoice[];
  source: { path: string; sha256: string };
}

// These are observed facts or explicit actions, not moral standings. Completion facts
// are produced only by completeButterflyCommitment, never by accepting the request.
const emits: Record<string, Record<string, string[]>> = {
  'BTF-001': {
    N01a: ['cover_accepted'], N01b: ['cover_refused'], N01c: ['cover_accepted', 'shift_registered'], N01d: ['partial_cover_accepted'],
    N02a: ['handoff_requested'], N02b: ['patient_work_retained'], N02c: ['alternative_handoff_requested'], N02d: ['early_repayment_requested'],
    N03a: ['own_witness_recorded'], N03b: ['correction_submitted'], N03c: ['witness_declined'], N03d: ['false_exam_entry'],
    N04a: ['witness_delivered'], N04b: ['own_statement_submitted'], N04c: ['records_retained'], N04d: ['shared_false_witness'],
    N05a: ['transfer_information_requested'], N05b: ['original_record_requested'], N05c: ['transfer_pending'], N05d: ['assistant_unavailable', 'alternative_information_requested'],
    N06a: ['complete_statement_submitted'], N06b: ['limited_statement_submitted'], N06c: ['department_false_statement', 'department_support_accepted'], N06d: ['independent_reply_submitted'],
    N07a: ['family_delegation_requested'], N07b: ['work_postponed','family_attendance_chosen'], N07c: ['deadline_change_requested'], N07d: ['division_requested'],
    N08a: ['correction_submitted', 'prior_version_retained'], N08b: ['witness_delivered'], N08c: ['incomplete_items_reported'], N08d: ['concealed_prior_entry'],
  },
  'BTF-002': {
    N01a: ['loan_made'], N01b: ['loan_made'], N01c: ['loan_refused'], N01d: ['time_help_accepted'],
    N02a: ['early_repayment_requested'], N02b: ['funding_requested'], N02c: ['family_told'], N02d: ['time_help_requested'], N02e: ['financial_need_disclosed'],
    N03a: ['repayment_received'], N03b: ['repayment_date_retained'], N03c: ['time_help_accepted'], N03d: ['repayment_extended'],
    N04a: ['conditional_offer_accepted'], N04b: ['offer_refused'], N04c: ['written_terms_requested'], N04d: ['offer_pending','offer_return_requested'],
    N05a: ['exchange_performed', 'prescription_data_delivered'], N05b: ['cooperation_ended'], N05c: ['public_information_delivered'], N05d: ['delegated_exchange_requested'],
    N06a: ['repayment_allocated'], N06b: ['private_repayment_received'], N06c: ['repayment_extended'], N06d: ['personal_help_ended'],
    N07a: ['family_told'], N07b: ['family_false_explanation'], N07c: ['optional_expense_reduced'], N07d: ['unconditional_loan_accepted'],
    N08a: ['own_participation_disclosed', 'cooperation_ended'], N08b: ['false_project_statement'], N08c: ['liaison_role_accepted'], N08d: ['original_material_submitted', 'cooperation_ended'],
  },
  'BTF-003': {
    N01a: ['explanation_delivered'], N01b: ['recording_pause_requested'], N01c: ['witness_attendance_requested'], N01d: ['written_explanation_reviewed'],
    N02a: ['joint_discussion_requested'], N02b: ['patient_privacy_retained'], N02c: ['discussion_postponed'], N02d: ['limited_disclosure'],
    N03a: ['original_record_requested'], N03b: ['contemporary_record_submitted'], N03c: ['record_missing_registered'], N03d: ['authorized_public_response'],
    N04a: ['handoff_requested', 'record_delivery_requested'], N04b: ['formal_preservation_requested'], N04c: ['record_missing'], N04d: ['patient_authorization_requested'],
    N05a: ['evidence_scope_submitted'], N05b: ['correction_submitted'], N05c: ['false_patient_statement'], N05d: ['matched_witness_requested'],
    N06a: ['limited_review_disclosure'], N06b: ['private_excerpt_protected'], N06c: ['unauthorized_disclosure'], N06d: ['joint_meeting_requested'],
    N07a: ['own_error_acknowledged'], N07b: ['supported_error_acknowledged'], N07c: ['false_handoff_statement'], N07d: ['handoff_record_submitted'],
    N08a: ['followup_handoff_requested'], N08b: ['successor_handoff_requested'], N08c: ['formal_reply_submitted'], N08d: ['voluntary_contact_ended'],
  },
  'BTF-004': {
    N01a: ['slides_presented'], N01b: ['original_file_retained', 'unverified_slides_removed'], N01c: ['lecture_cancelled', 'notice_retained'], N01d: ['original_file_retained', 'citation_gap_noted', 'unverified_slides_removed'],
    N02a: ['zhou_saw_original'], N02b: ['source_delivery_requested'], N02c: ['citation_gap_disclosed'], N02d: ['source_preservation_requested'],
    N03a: ['source_responsibility_requested'], N03b: ['project_participation_accepted'], N03c: ['recommendation_declined'], N03d: ['scapegoat_statement'],
    N04a: ['joint_verification_accepted'], N04b: ['labor_exchange_accepted','clinical_explanation_accepted'], N04c: ['self_verification_accepted'], N04d: ['contribution_division_accepted'],
    N05a: ['project_accepted'], N05b: ['project_refused'], N05c: ['original_data_requested'], N05d: ['limited_contribution_accepted'],
    N06a: ['honest_submission', 'submitted'], N06b: ['submitted'], N06c: ['submission_postponed'], N06d: ['authorship_withdrawn'],
    N07a: ['methods_explained'], N07b: ['limited_research_reply','supplement_required'], N07c: ['supplement_required'], N07d: ['collaborator_witness_requested'],
    N08a: ['original_submitted'], N08b: ['missing_attachments_reported'], N08c: ['reply_false'], N08d: ['inquiry_ignored'],
  },
};
const entrances: Record<string, string[][]> = {
  'BTF-001': [[], ['cover_completed', 'family_event', 'handoff_pending'], ['false_exam_discovered'], ['false_exam_discovered'], ['related_transfer'], ['statement_request_delivered'], ['commitment_collision'], ['record_due']],
  'BTF-002': [[], ['family_bill_due', 'cash_gap'], ['repayment_reply_received'], ['financial_need_disclosed', 'cash_gap', 'representative_offer'], ['conditional_offer_accepted', 'exchange_request_received'], ['payment_due'], ['family_finance_question'], ['review_due']],
  'BTF-003': [[], ['patient_can_express', 'private_request'], ['same_patient_dispute', 'complaint_delivered'], ['holder_contacted'], ['evidence_review_due'], ['privacy_conflict'], ['own_error_or_actual_query'], ['patient_followup_due']],
  'BTF-004': [[], ['same_dataset_request'], ['chief_meeting_requested'], ['materials_received', 'collaboration_agreed'], ['same_project_invitation'], ['manuscript_due'], ['submitted', 'defense_due'], ['submitted', 'inquiry_delivered']],
};
const consumeByFact: Record<string, string[]> = {
  cover_completed: ['BTF-001:N02', 'BTF-001:N05'], favor_available: ['BTF-001:N02a', 'BTF-001:N05a'],
  loan_made: ['BTF-002:N02a', 'BTF-002:N03', 'BTF-002:N06'], financial_need_disclosed: ['BTF-002:N04'],
  conditional_offer_accepted: ['BTF-002:N05', 'XJ-02'], original_file_retained: ['BTF-004:N02a', 'BTF-004:N04', 'BTF-004:N08a'],
  witness_delivered: ['BTF-003:N05d', 'XJ-03'], record_received: ['BTF-003:N05', 'BTF-003:N06', 'XJ-03'],
  verification_completed: ['BTF-004:N05d', 'BTF-004:N06a'], problem_known: ['BTF-004:N06b', 'BTF-004:N08c'],
  submitted: ['BTF-004:N07', 'BTF-004:N08'], exchange_performed: ['BTF-002:N08', 'XJ-02'],
};
const consumed: Record<string, string[]> = {
  'BTF-001:N02a': ['favor_available'], 'BTF-001:N05a': ['favor_available'], 'BTF-001:N07d': ['assistant_commitment'],
  'BTF-003:N01d': ['written_explanation'], 'BTF-003:N02d': ['limited_patient_authorization'], 'BTF-003:N03d': ['public_authorization'],
  'BTF-003:N05d': ['witness_commitment'], 'BTF-003:N06d': ['meeting_commitment'], 'BTF-003:N08b': ['successor_commitment'],
  'BTF-004:N02a': ['project_share_authorization'], 'BTF-004:N07d': ['witness_commitment'],
};

export const BUTTERFLY_GRAPHS = data.butterflies.map(g => ({ ...g, nodes: g.nodes.map((n, i): ButterflyNode => ({
  id: n.id, localId: n.localId, title: n.title, text: n.text, entrance: n.entrance, source: n.source,
  requiredFacts: entrances[g.id][i],
  options: n.options.map(o => ({ ...o, produces: emits[g.id][o.localId] ?? [], consumes: consumed[o.id] ?? [] })),
})) }));
export const BUTTERFLY_NODES = BUTTERFLY_GRAPHS.flatMap(g => g.nodes);
export const BUTTERFLY_RESOLUTIONS = BUTTERFLY_GRAPHS.flatMap(g => g.resolutions);
export const BUTTERFLY_FACT_CONNECTIONS = Object.entries(consumeByFact).map(([fact, consumers]) => ({ fact, consumers, producers: BUTTERFLY_NODES.flatMap(n => n.options.filter(o => o.produces.includes(fact)).map(o => o.id)), completionOnly: ['cover_completed', 'favor_available', 'record_received', 'verification_completed', 'problem_known'].includes(fact) }));

export const BUTTERFLY_MERGES = data.merges.map(m => ({ ...m, claims: ({
  'XJ-01': ['BTF-001:N07', 'BTF-002:N07', 'BTF-004:LABOR'],
  'XJ-02': ['BTF-002:N05', 'BTF-002:N08', 'BTF-004:N05', 'BTF-004:N08'],
  'XJ-03': ['BTF-001:N06', 'BTF-003:N05', 'BTF-003:N06', 'BTF-003:N07', 'BTF-003:N08', 'BTF-004:N07', 'BTF-004:N08'],
} as Record<string, string[]>)[m.id], continuations: ({
  'XJ-01': { 'BTF-001:N07': 'BTF-001:N08', 'BTF-002:N07': 'BTF-002:N06', 'BTF-004:LABOR': 'BTF-004:N05' },
  'XJ-02': { 'BTF-002:N05': 'BTF-002:N06', 'BTF-002:N08': 'BTF-002:resolve', 'BTF-004:N05': 'BTF-004:N06', 'BTF-004:N08': 'BTF-004:resolve' },
  'XJ-03': { 'BTF-001:N06': 'BTF-001:N07', 'BTF-003:N05': 'BTF-003:N08', 'BTF-003:N06': 'BTF-003:N08', 'BTF-003:N07': 'BTF-003:N08', 'BTF-003:N08': 'BTF-003:resolve', 'BTF-004:N07': 'BTF-004:N08', 'BTF-004:N08': 'BTF-004:resolve' },
} as Record<string, Record<string, string>>)[m.id] }));

export function startButterfly(chain: ButterflyId, id: string, subjects: ButterflySubjects, entry = 'N01'): ButterflyState {
  if (chain === 'BTF-003' && !subjects.patientId) throw new Error('Recording chain requires a concrete patient');
  if (chain === 'BTF-004' && !subjects.projectId) throw new Error('Research chain requires a project');
  return { id, chain, subjects, scope: subjects.projectId ? { kind: 'project', id: subjects.projectId } : subjects.patientId ? { kind: 'patient', id: subjects.patientId } : { kind: 'personal', id: subjects.actorId },
    cursor: `${chain}:${entry}`, consumed: [], consumedResources: [], facts: [], commitments: [], receivable: 0, privateDebt: 0, paid: 0, status: 'active' };
}
const factSet = (s: ButterflyState, w: ButterflyWorld) => new Set([...s.facts.map(f => f.type), ...w.facts]);
export function butterflyNodeEligible(s: ButterflyState, node: ButterflyNode, w: ButterflyWorld): boolean {
  if (s.status === 'closed' || s.consumed.includes(node.id) || !node.id.startsWith(s.chain)) return false;
  if (s.subjects.patientId && w.boundPatientId && s.subjects.patientId !== w.boundPatientId) return false;
  if (s.subjects.projectId && w.boundProjectId && s.subjects.projectId !== w.boundProjectId) return false;
  const facts = factSet(s, w);
  if(s.entrySource==='existing-complaint'&&['BTF-003:N01','BTF-003:N02'].includes(node.id))return false;
  if(node.id==='BTF-003:N03'&&facts.has('dispute_resolved'))return false;
  if(node.id==='BTF-002:N02'&&!facts.has('loan_made')&&!facts.has('time_help_completed'))return false;
  return node.requiredFacts.every(f => facts.has(f));
}
export function butterflyChoices(s: ButterflyState, w: ButterflyWorld): { choice: ButterflyChoice; available: boolean; reason?: string }[] {
  const node = BUTTERFLY_NODES.find(n => n.id === s.cursor);
  if (!node || s.status === 'closed') return [];
  const facts = factSet(s, w);
  return node.options.map(original => {
    const choice=original.id==='BTF-003:N05c'&&w.conditions?.[original.id]!==true
      ?{...original,label:'保留意见，请继续核对',requires:'始终',cost:'情绪 −5',produces:['evidence_opinion_retained'],targets:['BTF-003:N08']}:original;
    let available = /始终/.test(choice.requires) || w.conditions?.[choice.id] === true || w.conditions?.[choice.requires] === true;
    if (/余额足够/.test(choice.requires)) available = w.cash >= (choice.localId === 'N01a' ? 3000 : 1500);
    if (choice.consumes.some(f => !facts.has(f) || s.consumedResources.includes(f))) available = false;
    if (/李恂|周乔|到岗|在岗/.test(choice.requires)&&!w.actorAvailable&&w.conditions?.[choice.id]!==true)available=false;
    if (s.chain === 'BTF-002' && choice.localId === 'N03a') available = (w.repaymentAvailable ?? 0) > 0 && s.receivable > 0;
    if (s.chain === 'BTF-002' && choice.localId === 'N06b') available = s.privateDebt > 0;
    if (s.chain === 'BTF-002' && ['N06c', 'N06d'].includes(choice.localId)) available = s.receivable > 0 && (choice.localId !== 'N06d' || facts.has('repayment_missed'));
    if (s.chain === 'BTF-004' && choice.localId === 'N02a') available = facts.has('original_file_retained') && facts.has('project_share_authorization');
    if (s.chain === 'BTF-004' && choice.localId === 'N05d') available = facts.has('verification_completed') && facts.has('real_contribution');
    if (s.chain === 'BTF-004' && choice.localId === 'N08c') available = facts.has('verified_problem') && facts.has('problem_known');
    const requiredCash=Math.max(0,-(butterflyChoiceCost(s,choice,w).effects.cash??0));
    if(requiredCash>w.cash)return {choice,available:false,reason:`需要个人余额 ${requiredCash} 元；请先安排资金。`};
    return { choice, available, ...(available ? {} : { reason: choice.requires }) };
  });
}
/** Knowledge requires a recorded transfer, never a relationship score. */
export function observeButterflyFact(state: ButterflyState, factId: string, actorId: string, channel: 'present' | 'delivered-record' | 'direct-message', source: string, day: number): ButterflyState {
  const fact = state.facts.find(f => f.id === factId);
  if (!fact || !source || day < fact.day) return state;
  if (channel === 'delivered-record' && !fact.subjects.recipientIds?.includes(actorId)) return state;
  const next = structuredClone(state), target = next.facts.find(f => f.id === factId)!;
  if (target.knownBy.includes(actorId)) return state;
  target.knownBy.push(actorId);
  (target.observations ??= []).push({ actorId, channel, source, day });
  return next;
}
function addFact(s: ButterflyState, type: string, source: string, w: ButterflyWorld, amount?: number) {
  const id=`${s.id}:${source}:${type}`;if(s.facts.some(f=>f.id===id))return;
  s.facts.push({ id, type, scope: s.scope, subjects: { ...s.subjects }, sourceChoiceId: source, day: w.day, knownBy: ['player'], ...(amount === undefined ? {} : { amount }) });
}
const completionFacts: Record<string, string[]> = {
  cover_accepted: ['cover_completed', 'favor_available'], partial_cover_accepted: ['cover_completed', 'favor_available'],
  handoff_requested: ['handoff_completed'], alternative_handoff_requested: ['handoff_completed'], time_help_accepted: ['time_help_completed'], time_help_requested:['time_help_completed'],
  family_delegation_requested:['family_task_completed'],family_delegate_requested:['family_task_completed'],family_attendance_chosen:['family_attendance_completed'],
  joint_verification_accepted: ['verification_completed'], self_verification_accepted: ['verification_completed'], labor_exchange_accepted: ['verification_completed'],
  clinical_explanation_accepted:['clinical_explanation_completed'],
  deadline_change_requested:['deadline_change_confirmed'],
  record_delivery_requested: ['record_received'], formal_preservation_requested: ['record_received'],
  matched_witness_requested: ['witness_delivered'], collaborator_witness_requested: ['witness_delivered'],
  witness_attendance_requested:['witness_attended'],
  source_delivery_requested:['zhou_saw_original'],source_preservation_requested:['source_preserved'],
  original_data_requested:['original_file_retained','source_materials_received'],
  offer_return_requested:['offer_returned'],
  contribution_division_accepted:['verification_completed','real_contribution'],
  liaison_role_accepted: ['liaison_appointed'], division_requested: ['division_completed'], followup_handoff_requested: ['handoff_completed'], successor_handoff_requested: ['handoff_completed'],
};
export function completeButterflyCommitment(state: ButterflyState, commitmentId: string, w: ButterflyWorld): ButterflyState {
  const s = structuredClone(state), c = s.commitments.find(c => c.id === commitmentId);
  if (!c || c.status !== 'accepted') return state;
  if (!w.actorAvailable || w.day > c.due && /cover_accepted/.test(c.type)) return state;
  if (!w.facts.includes(`completed:${commitmentId}`)) return state;
  c.status = 'completed';
  c.completedDay=w.day;
  if(w.day>c.due){addFact(s,'duty_overdue',c.source,w);addFact(s,'commitment_completed_late',c.source,w);}
  for (const type of completionFacts[c.type] ?? []) {
    addFact(s, type, c.source, w);
    const delivered=s.facts.find(f=>f.id===`${s.id}:${c.source}:${type}`)!;
    delivered.knownBy=[...new Set([...delivered.knownBy,c.actorId])];
  }
  if(c.type==='partial_cover_accepted')addFact(s,'favor_one_ward_review',c.source,w);
  if ((completionFacts[c.type] ?? []).includes('verification_completed') && w.facts.includes('dataset_has_problem')) {
    addFact(s, 'verified_problem', c.source, w); addFact(s, 'problem_known', c.source, w);
  }
  return s;
}

/** Store the task owner, not whichever actor introduced this storyline. */
export function commitmentOwner(chain:ButterflyState,type:string,source:string):string{
 if(/cover_accepted/.test(type)||['self_verification_accepted','clinical_explanation_accepted','deadline_change_requested'].includes(type)||type==='time_help_accepted'&&source==='BTF-002:N01d'||type==='family_attendance_chosen')return'player';
 if(/family_delegat|family_delegate/.test(type))return'brother';
  if(type==='liaison_role_accepted')return'tang';
 if(type==='offer_return_requested')return'cashier';
 if(/source_preservation|formal_preservation|record_delivery/.test(type))return'records-office';
 if(type==='witness_attendance_requested'||/alternative|successor/.test(type))return'jiang';
 return chain.chain==='BTF-004'?'zhou':'li';
}
function acceptCommitment(s:ButterflyState,type:string,source:string,task:string,w:ButterflyWorld){
 if(!completionFacts[type])return;
 const id=`${s.id}:${source}:${type}`;if(s.commitments.some(c=>c.id===id))return;
 s.commitments.push({id,type,actorId:commitmentOwner(s,type,source),task,status:'accepted',due:Math.min(RULES.days+1,w.day+1),source});
}

export function resolveButterfly(s: ButterflyState, w: ButterflyWorld): string {
  const f = factSet(s, w), any = (...types: string[]) => types.some(t => f.has(t));
  let r = 'R05';
  if (s.chain === 'BTF-001') r = any('false_exam_entry', 'shared_false_witness', 'department_false_statement', 'concealed_prior_entry') ? 'R04' : any('duty_overdue', 'transfer_pending') ? 'R03' : f.has('witness_delivered') ? 'R02' : any('cover_completed', 'correction_submitted', 'handoff_completed') ? 'R01' : 'R05';
  if (s.chain === 'BTF-002') r = f.has('review_opened') ? 'R04' : any('exchange_performed', 'liaison_appointed') ? 'R03' : s.privateDebt > 0 || s.receivable > 0 ? 'R02' : any('repayment_received', 'bill_paid', 'time_help_completed') ? 'R01' : 'R05';
  if (s.chain === 'BTF-003') r = f.has('formal_case_unresolved') ? 'R03' : any('own_error_acknowledged', 'correction_submitted', 'false_patient_statement', 'false_handoff_statement') ? 'R02' : any('trust_broken', 'unauthorized_disclosure') ? 'R04' : any('dispute_resolved', 'normal_discharge') || f.has('explanation_delivered') && !f.has('same_patient_dispute') ? 'R01' : 'R05';
  if (s.chain === 'BTF-004') r = any('knowingly_false_submission', 'knowingly_false_statement', 'reply_false', 'scapegoat_statement') ? 'R04' : f.has('formal_inquiry_unresolved') ? 'R03' : any('project_refused', 'submission_postponed', 'authorship_withdrawn') ? 'R02' : any('honest_submission', 'unverified_slides_removed', 'real_contribution') ? 'R01' : 'R05';
  return `${s.chain}:${r}`;
}
/** Select one true epilogue variant; alternative histories never leak into the UI. */
export function butterflyResolutionView(s: ButterflyState, w: ButterflyWorld): { id: string; title: string; text: string; facts: ButterflyFact[] } {
  const id = resolveButterfly(s, w), result = BUTTERFLY_RESOLUTIONS.find(r => r.id === id)!;
  const facts = factSet(s, w), r = id.split(':')[1];
  let prefix = '';
  if (s.chain === 'BTF-001' && r === 'R01') prefix = facts.has('handoff_completed') ? '互助已兑现' : facts.has('cover_completed') ? '人情未用' : '仅更正成立';
  if (s.chain === 'BTF-001' && r === 'R05') prefix = facts.has('cover_refused') ? '拒绝时' : facts.has('cover_accepted') ? '未完成时' : '仅独立事件入场时';
  if (s.chain === 'BTF-002' && r === 'R01') prefix = facts.has('bill_paid') ? '正文' : '没有家庭付款而仅还款完成时';
  if (s.chain === 'BTF-002' && r === 'R02') prefix = facts.has('bill_paid') ? '已支付家庭费用时' : '没有家庭付款时';
  if (s.chain === 'BTF-002' && r === 'R03') prefix = facts.has('liaison_appointed') ? '已实际接替时' : facts.has('cooperation_ended') ? '已停止交换但风险未结时' : '未接替但继续交换时';
  if (s.chain === 'BTF-002' && r === 'R05') prefix = s.receivable > 0 ? '借出未还且终止互助时' : '未借钱时';
  if (s.chain === 'BTF-003' && r === 'R01') prefix = facts.has('followup_required') ? '仍需复诊时' : '无需再来时';
  if (s.chain === 'BTF-004' && r === 'R01') prefix = facts.has('submitted') ? '已投稿' : '仅保留贡献';
  if (s.chain === 'BTF-004' && r === 'R02') prefix = facts.has('authorship_withdrawn') ? '已退出署名' : facts.has('project_refused') ? '拒绝项目' : '暂缓';
  if (s.chain === 'BTF-004' && r === 'R04') prefix = facts.has('liaison_appointed') || facts.has('position_appointed') ? '任命确已发生' : facts.has('inquiry_delivered') ? '任命未发生' : '尚无问询';
  if (s.chain === 'BTF-004' && r === 'R05') prefix = facts.has('lecture_cancelled') ? '早期取消' : facts.has('inquiry_ignored') ? '有问询未回复' : '没有新的项目';
  const paragraphs = result.text.split('\n\n').map(p => p.trim()).filter(Boolean);
  let text = (prefix ? paragraphs.find(p => p.startsWith(prefix + '：')) : undefined) ?? paragraphs.find(p => p.startsWith('正文：')) ?? paragraphs[0];
  text = text.replace(/^[^：\n]{1,24}：/, '');
  if(s.chain==='BTF-002'&&r==='R01'&&!facts.has('bill_paid')&&!facts.has('repayment_received'))text='你们约好的那趟手续办完了，回执也交给了对方。家里的费用还要按原来的安排支付，这次代办没有涉及转款。';
  if (s.chain === 'BTF-001' && r === 'R03' && !facts.has('handoff_completed')) text = '交接名单上还有没完成的事。发出的交接请求还没收到确认，你把原来的截止时间留在每一项后面。';
  if(s.chain==='BTF-002'&&r==='R03'&&!facts.has('liaison_appointed'))text=facts.has('cooperation_ended')
    ?'你把停止合作的回复留了下来。那张表已经发出，对方没有答应退还材料。你退过多少钱、还欠多少钱，收支记录都留着。'
    :'叶茗又问起下次联系的时间。你还没有说要停下，发出那张表的记录也还留着。';
  if (s.chain === 'BTF-004' && r === 'R03' && facts.has('all_attachments_received')) text = '附件已经收齐，对方还没有发来结论。你把接收清单留在原来的材料后面。';
  return { id, title: result.title, text, facts: structuredClone(s.facts) };
}
export function routeButterfly(s: ButterflyState, w: ButterflyWorld, preferred: string[] = []): ButterflyState {
  if (s.status === 'closed') return s;
  // A genuine entry still needs its first answer. Routing must not skip N01
  // before a newly created independent source has ever been presented.
  if(!w.final&&s.cursor===`${s.chain}:N01`&&!s.consumed.includes(s.cursor))return{...s,status:'active'};
  const graph = BUTTERFLY_GRAPHS.find(g => g.id === s.chain)!;
  const order = s.chain === 'BTF-004' ? ['N02', 'N04', 'N03', 'N05', 'N06', 'N07', 'N08'] : ['N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08'];
  const candidates = [...preferred.filter(x => x.startsWith(s.chain) && x.includes(':N')), ...order.map(x => `${s.chain}:${x}`)];
  const next = candidates.map(id => graph.nodes.find(n => n.id === id)).find(n => n && butterflyNodeEligible(s, n, w));
  if (next && !w.final) return { ...s, cursor: next.id, status: 'active' };
  const resolution = resolveButterfly(s, w);
  const facts = factSet(s, w);
  const explicitExit = facts.has('chain_exit') || w.final || s.chain === 'BTF-004' && ['project_refused', 'submission_postponed', 'authorship_withdrawn', 'lecture_cancelled'].some(f => facts.has(f)) || s.chain === 'BTF-003' && facts.has('voluntary_contact_ended');
  return { ...s, resolution, status: explicitExit ? 'closed' : 'dormant' };
}

/** Shared by the offer and commit; dynamic repayment cannot be quoted at one
 * amount and charged at another. State/facts are not mutated by a quotation. */
export function butterflyChoiceCost(s:ButterflyState,o:ButterflyChoice,w:ButterflyWorld){
  const cost=compileClauses(o.cost,o.id);
  let effects=structuredClone(cost.effects);
  if(/沿用 E-135/.test(o.cost)){
    const referenced=EVENT_BY_ID['E-135'].options[o.localId.endsWith('a')?0:o.localId.endsWith('b')?1:2];
    effects=mergeEventEffects(effects,referenced.effects);
    if(s.entrySource!=='department-teaching'){cost.modifiers.push(...structuredClone(referenced.modifiers));cost.deferred.push(...structuredClone(referenced.deferred));}
  }
  if(s.entrySource==='department-teaching'&&effects.flags)effects.flags=effects.flags.filter(f=>!f.startsWith('药代-'));
  if(/沿用 E-137/.test(o.cost)){const referenced=EVENT_BY_ID['E-137'].options[0];effects=mergeEventEffects(effects,referenced.effects);cost.modifiers.push(...structuredClone(referenced.modifiers));cost.deferred.push(...structuredClone(referenced.deferred));}
  if(/交接.*(?:按 01|按01)|交接 AP/.test(o.cost))cost.ap=Math.max(cost.ap,RULES.butterfly.handoffAp);
  if(/当前阶段剩余 AP/.test(o.cost))cost.ap=Math.max(0,w.ap);
  if(o.id==='BTF-002:N04a')effects.privateDebt=RULES.butterfly.bridgeLoan;
  if(o.id==='BTF-002:N03a')effects.cash=(effects.cash??0)+Math.min(s.receivable,w.repaymentAvailable??0);
  if(o.id==='BTF-002:N06b'){const paid=Math.max(0,Math.min(s.privateDebt,w.cash));effects.privateDebt=-paid;effects.cash=-paid;}
  if(o.id==='BTF-002:N07d'&&w.conditions?.unconditional_loan_10000){effects.privateDebt=RULES.butterfly.bridgeLoan;effects.cash=RULES.butterfly.bridgeLoan;}
  if(o.id==='BTF-001:N05c')effects=mergeEventEffects(effects,EVENT_BY_ID['E-040'].options[1].effects);
  if(w.freeSubmissionCosts&&['BTF-004:N06a','BTF-004:N06b'].includes(o.id)){
    if((effects.stamina??0)<0)delete effects.stamina;
    if((effects.cash??0)<0)delete effects.cash;
  }
  return {...cost,effects};
}
export function butterflyMergeCost(choice:{cost:string;id:string},w:ButterflyWorld){
  const cost=compileClauses(choice.cost,choice.id);
  if(/交接.*按 01|交接 AP/.test(choice.cost))cost.ap=Math.max(cost.ap,RULES.butterfly.handoffAp);
  if(/当前阶段剩余 AP/.test(choice.cost))cost.ap=Math.max(0,w.ap);
  return cost;
}
/** The source's third exit remains usable when no knowingly false statement
 * exists. All projections and the commit share this same conditional choice. */
export function butterflyMergeOptions(id:string,w:ButterflyWorld){
  return(BUTTERFLY_MERGES.find(m=>m.id===id)?.options??[]).map(o=>
    o.id==='XJ02c'&&!w.conditions?.XJ02c?{...o,label:'终止后续合作',requires:'始终',cost:`情绪 −${RULES.butterfly.cooperationExitEmotion}；放弃尚未兑现的项目收益`}:o
  ).filter(o=>/始终/.test(o.requires)||w.conditions?.[o.id]||w.conditions?.[o.requires]);
}
export const stopsMergedCooperation=(choiceId:string,w:ButterflyWorld)=>choiceId==='XJ02c'&&!w.conditions?.XJ02c;
/** One atomic player choice, with no consent invented by a failed persuasion roll. */
export function commitButterflyChoice(state: ButterflyState, choiceId: string, w: ButterflyWorld): { state: ButterflyState; effects: Effects; ap: number; minutes: number } {
  if (state.consumed.includes(state.cursor) || state.facts.some(f => f.sourceChoiceId === choiceId)) return { state, effects: {}, ap: 0, minutes: 0 };
  const offered = butterflyChoices(state, w).find(c => c.choice.id === choiceId);
  if (!offered?.available) throw new Error('This choice is not available in the current circumstances');
  const s = structuredClone(state), o = offered.choice;
  if(w.boundFamilyBillId&&!s.subjects.familyBillId)s.subjects.familyBillId=w.boundFamilyBillId;
  s.consumed.push(s.cursor);
  const cost = butterflyChoiceCost(state,o,w);
  let effects = cost.effects;
  if (s.chain === 'BTF-002') {
    if (o.localId === 'N01a' || o.localId === 'N01b') {s.receivable += o.localId === 'N01a' ? 3000 : 1500;s.receivableDueDay=w.day+RULES.butterfly.loanDays;}
    if (o.localId === 'N04a'||o.localId==='N07d'){s.privateDebt+=effects.privateDebt??0;s.privateDebtDueDay=w.day+RULES.butterfly.loanDays;}
    if (o.localId === 'N03a') { const amount = Math.min(s.receivable, w.repaymentAvailable ?? 0); s.receivable -= amount; s.paid += amount; }
    if (o.localId === 'N06b')s.privateDebt=Math.max(0,s.privateDebt+(effects.privateDebt??0));
    if(['N03d','N06c'].includes(o.localId)&&s.receivable>0)s.receivableDueDay=w.day+RULES.butterfly.loanDays;
  }
  if ((effects.cash ?? 0) < -w.cash) throw new Error('This requires a funding choice; a loan cannot be accepted automatically');
  const produced=o.produces.map(type=>type==='own_error_acknowledged'&&!w.facts.includes('own_actual_error')?'own_scope_explained':type==='private_repayment_received'&&!(effects.cash!<0)?'private_repayment_plan_requested':type);
  for (const type of produced) {
    addFact(s, type, choiceId, w);
    acceptCommitment(s,type,choiceId,o.label,w);
  }
  if (s.chain === 'BTF-004' && o.localId === 'N06b' && factSet(state, w).has('problem_known') && factSet(state, w).has('verified_problem')) {
    addFact(s, 'knowingly_false_submission', choiceId, w);
    effects.flags = [...(effects.flags ?? []), '科研-造假'];
  }
  for (const type of o.consumes) s.consumedResources.push(type);
  if(o.id==='BTF-002:N06d')for(const c of s.commitments)if(c.status==='accepted'&&/time_help|division/.test(c.type))c.status='cancelled';
  effects.flags = [...(effects.flags ?? []), ...produced.map(f => `${s.chain}:${f}`)];
  return { state: routeButterfly(s, w, o.targets), effects, ap: cost.ap, minutes: cost.minutes };
}

/** A labor appointment is an actual due commitment, not a fabricated N-node. */
export const isResearchCollaboration=(type:string)=>['joint_verification_accepted','labor_exchange_accepted','clinical_explanation_accepted','contribution_division_accepted'].includes(type);
export function butterflyMergeClaim(id:string,state:ButterflyState,world:ButterflyWorld):string|undefined{
  const merge=BUTTERFLY_MERGES.find(m=>m.id===id);if(!merge||state.status==='closed')return;
  if(merge.claims.includes(state.cursor)&&!state.consumed.includes(state.cursor))return state.cursor;
  const labor='BTF-004:LABOR';
  if(id==='XJ-01'&&state.chain==='BTF-004'&&!state.consumed.includes(labor)&&state.commitments.some(c=>isResearchCollaboration(c.type)&&c.status==='accepted'&&c.due<=world.day&&(c.resumeDay??0)<=world.day)&&world.facts.includes('commitment_collision'))return labor;
}
export function mergeEligible(id: string, states: ButterflyState[], world: ButterflyWorld): boolean {
  const merge = BUTTERFLY_MERGES.find(m => m.id === id);
  if (!merge) return false;
  const participants = states.filter(s => butterflyMergeClaim(id,s,world));
  // One accepted work appointment can collide with a real family invoice.
  // The family is not required to enter a second butterfly graph first.
  if (id === 'XJ-01') return participants.length > 0 && world.facts.includes('commitment_collision');
  if (new Set(participants.map(s => s.chain)).size < 2) return false;
  if (id === 'XJ-02') return participants.every(s => !!s.subjects.projectId && s.subjects.projectId === participants[0].subjects.projectId && !!s.subjects.paymentId && s.subjects.paymentId === participants[0].subjects.paymentId && !!s.subjects.sponsorId&&s.subjects.sponsorId === participants[0].subjects.sponsorId);
  if(!world.facts.includes('same_review_received')||!world.reviewChainIds||participants.length!==world.reviewChainIds.length||participants.some(s=>!world.reviewChainIds!.includes(s.id)))return false;
  const same=(key:'patientId'|'projectId'|'recordId')=>!!participants[0].subjects[key]&&participants.every(s=>s.subjects[key]===participants[0].subjects[key]);
  return same('patientId')||same('projectId')||same('recordId');
}

/** An unrelated third file cannot suppress a matching pair or acquire its
 * responsibility. Group by one shared identity, never by transitive overlap. */
export function mergeParticipantGroups(id:string,states:ButterflyState[]):ButterflyState[][]{
 if(id==='XJ-01')return[states];
 const groups=new Map<string,ButterflyState[]>();
 for(const state of states){
  const s=state.subjects;
  const keys=id==='XJ-02'
    ?s.sponsorId&&s.projectId&&s.paymentId?[JSON.stringify([s.sponsorId,s.projectId,s.paymentId])]:[]
    :(['patientId','projectId','recordId']as const).flatMap(key=>s[key]?[`${key}:${s[key]}`]:[]);
  for(const key of keys){const group=groups.get(key)??[];group.push(state);groups.set(key,group);}
 }
 return [...groups.values()].filter(group=>new Set(group.map(s=>s.chain)).size>=2);
}
export function commitButterflyMerge(id: string, choiceId: string, states: ButterflyState[], w: ButterflyWorld): { states: ButterflyState[]; effects: Effects; ap: number } {
  if (!mergeEligible(id, states, w)) throw new Error('The scenes do not share an eligible source and deadline');
  const merge = BUTTERFLY_MERGES.find(m => m.id === id)!;
  const option = butterflyMergeOptions(id,w).find(o => o.id === choiceId);
  if (!option || !(/始终/.test(option.requires) || w.conditions?.[option.id] || w.conditions?.[option.requires])) throw new Error('The merge choice lacks its required consent or materials');
  const cost = butterflyMergeCost(option,w);
  const source=w.transactionId??`${id}:${choiceId}:${w.day}:${states.map(s=>`${s.id}:${s.cursor}`).sort().join('|')}`;
  const next = states.map(state => {
    const claimed=butterflyMergeClaim(id,state,w);if(!claimed)return state;
    const s = structuredClone(state);
    s.consumed.push(claimed); addFact(s, `${id}:${choiceId}`, source, w);
    const writes:Record<string,string[]>={XJ01a:['family_attendance_chosen','work_reschedule_requested'],XJ01b:['family_delegate_requested'],XJ01c:['deadline_extension_requested'],XJ01d:['division_requested'],XJ02a:['funding_and_materials_disclosed'],XJ02b:['limited_responsibility_statement'],XJ02c:['knowingly_false_statement','responsibility_statement_signed'],XJ02d:['problem_component_withdrawn','real_work_retained'],XJ03a:['separate_responsibilities_submitted'],XJ03b:['privacy_scope_requested'],XJ03c:['selective_disclosure'],XJ03d:['joint_personal_statements_submitted']};
    for(const type of stopsMergedCooperation(choiceId,w)?['cooperation_ended','unearned_project_benefits_waived']:writes[choiceId]??[]){
      addFact(s,type,source,w);
      // Division consumes the existing appointment; it must not mint a second
      // assistant or a second, already-paid copy of the same job.
      if(choiceId!=='XJ01d')acceptCommitment(s,type,source,option.label,w);
    }
    if(['XJ02a','XJ03a','XJ03d'].includes(choiceId))for(const fact of s.facts){
      if(choiceId==='XJ03d'&&!/statement|witness/.test(fact.type))continue;
      for(const actorId of s.subjects.recipientIds??[]){if(!fact.knownBy.includes(actorId)){fact.knownBy.push(actorId);(fact.observations??=[]).push({actorId,source,day:w.day,channel:'delivered-record'});}}
    }
    if(choiceId==='XJ01d'&&s.facts.some(f=>f.type==='favor_available')&&!s.consumedResources.includes('favor_available'))s.consumedResources.push('favor_available');
    if(choiceId==='XJ03d'&&!s.consumedResources.includes('witness_commitment'))s.consumedResources.push('witness_commitment');
    if(choiceId==='XJ02b'){
      addFact(s,'authorship_support_withdrawn',source,w);
      for(const c of s.commitments)if(c.status==='accepted'&&c.actorId==='zhou'&&/verification|labor_exchange|contribution_division|witness/.test(c.type))c.status='cancelled';
    }
    if(choiceId==='XJ02d'||stopsMergedCooperation(choiceId,w)){
      addFact(s,'cooperation_ended',source,w);addFact(s,'unearned_project_benefits_waived',source,w);
      for(const c of s.commitments)if(c.status==='accepted'&&/verification|labor_exchange|contribution_division/.test(c.type))c.status='cancelled';
    }
    if(choiceId==='XJ03c'){
      const informed=new Set(s.facts.filter(f=>/false_exam_entry|shared_false_witness|false_patient_statement|false_handoff_statement|knowingly_false_submission|reply_false/.test(f.type)).flatMap(f=>f.knownBy));
      for(const c of s.commitments)if(c.status==='accepted'&&['li','zhou'].includes(c.actorId)&&informed.has(c.actorId)&&/verification|labor_exchange|contribution_division|handoff|time_help|witness|division/.test(c.type))c.status='cancelled';
    }
    const target = merge.continuations[claimed];
    if (!target) throw new Error('Missing explicit continuation');
    return routeButterfly(s, w, target.endsWith(':resolve') ? [] : [target]);
  });
  return { states: next, effects: cost.effects, ap: cost.ap };
}
