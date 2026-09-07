import type {TalentActor,TalentOperation} from '../../game/talents';
import type {ClinicalGraph,GraphOption} from './types';
import {applyConsultationTime} from './consultation-time';

export interface ClinicalMechanics {
  operation:TalentOperation;checkOperation?:TalentOperation;actor:TalentActor;
  quality:'correct'|'neutral'|'incorrect';unsignedConsent?:boolean;consultWaitMinutes?:number;
}
type Operations=Partial<Record<TalentOperation,string>>;
/** IDs are case-local source IDs, not guesses from player-visible Chinese labels.
 * The operation and information/communication check are deliberately separate. */
const operations:Record<string,Operations>={
  C001:{history:'s1_history s1_feeding s1_allergy',exam:'s2_abd s2_rectal', 'full-exam':'s2_full',consult:'s5_consult',consent:'s5_inform s6_preop','initial-record':'s7_note s7_verbal',record:'s6_transfer_note',other:'s7_followup',treatment:'s1_antiemetic s2_none s3_xray s3_us s3_labs s3_ct s3_none s4_npo s4_enema s4_reduce s4_abx_watch s5_admit_watch s5_discharge s6_wait s6_labs_repeat s6_transfer s6_self s6_wait_transfer'},
  C002:{history:'s1_history s1_symptoms s1_allergy',comfort:'s1_wife_out s5_warn s5_return',exam:'s2_lung','full-exam':'s2_full','initial-record':'s6_note s6_brief s6_template',record:'s5_sick_note',other:'s5_none',treatment:'s1_quick s2_skip s3_cxr s3_cbc s3_lft s3_ct s3_none s4_amox s4_moxi s4_cefo_iv s4_ceftriaxone_iv s4_azithro'},
  C003:{history:'s1_history s1_meds s1_daughter', 'full-exam':'s2_exam',exam:'s2_abd_only',consult:'s4_gi_consult',consent:'s4_inform s4_inform_lysis','initial-record':'s6_note s6_verbal',other:'s5_call_family s6_handoff',treatment:'s1_gastric s2_ecg s2_labs s2_abd_us s3_dapt s3_fluid s3_ntg s3_lasix s3_ecg_late s3_morphine s3_atropine s3_observe s3_rescue_fluid s4_pci s4_ccu s4_lysis s4_transfer_far s4_ccu_no_cath s5_prep s5_recheck s5_wait_labs'},
  C004:{observe:'s1_review s1_nursing s1_brief',history:'s1_call_prev s2_ask_bleed s2_herb','full-exam':'s2_exam',consult:'s5_gi s5_cardio',comfort:'s5_inform','progress-record':'s6_note s6_hide s6_blame s6_report_only',treatment:'s2_quick s3_inr s3_stool s3_ct s3_none s4_reverse s4_vitk_high s4_continue s4_ppi s4_switch_abx s5_blood s5_wait'},
  C005:{history:'s1_redflags s1_meds s1_bag',observe:'s1_bag_notice',comfort:'s1_mother_out s5_inform_pt s5_stop_ocp s5_tell_mother s5_return',other:'s1_bag_skip s5_no_return','full-exam':'s2_fundus',exam:'s2_neuro s2_vitals_only s2_vision s2_dilate',consult:'s4_neurosurg',persuade:'s3_mrv','initial-record':'s6_note s6_vascular s6_omit_ocp',treatment:'s1_migraine s3_ct s3_ctv s3_none s3_ct_home s3_mrv_scan s4_admit_lmwh s4_outpatient s4_admit_wait s4_mannitol'},
  C006:{exam:'s1_assess',observe:'s1_search',history:'s1_ask_friends s3_history',comfort:'s5_inform_pt s5_tell_friends s5_tell_with_consent s5_endo_referral','initial-record':'s6_note s6_drunk_dx',other:'s6_handoff',treatment:'s1_glucose s1_drunk s2_d50 s2_oral s2_ct_first s2_naloxone s2_thiamine s3_infusion s3_discharge s3_nurse_glucose s3_ct s3_observe s4_observe s4_labs s4_head_ct s4_ignore_head s4_glargine_skip'},
  C007:{history:'s1_fever_days s1_grandma s1_rash','full-exam':'s2_full',exam:'s2_throat s2_lymph',consult:'s4_cardio',consent:'s5_inform s5_blood_product',comfort:'s5_blame s5_return_advice s5_return_only',other:'s5_no_inform','initial-record':'s6_note s6_scarlet_dx s6_brief',treatment:'s1_scarlet s3_labs s3_echo s3_strep s3_none s3_ct_chest s4_admit_ivig s4_abx_home s4_observe_3d s4_steroid_only'},
  C008:{'full-exam':'s1_exam',history:'s1_history s1_ask_bandage',consent:'s2_lp s3_persuade','refusal-signature':'s3_sign s3_verbal',comfort:'s3_force s5_inform','initial-record':'s6_note s6_late s6_no_senior',treatment:'s1_abc s1_febrile_sz s2_labs s2_ct s2_none s3_discharge s4_empiric s4_wait_csf s4_cefoperazone s4_oral_azithro s4_mannitol s5_picu s5_observe s5_home_tomorrow s5_transfer'},
  C009:{exam:'s1_indication',record:'s1_form_full s1_form_name s7_return_bag s7_alter',consent:'s1_consent s1_verbal',observe:'s3_pickup',history:'s3_phone_type s4_ask_history',comfort:'s7_inform','progress-record':'s7_note s7_vague',treatment:'s2_wristband s2_call_name s2_intern s2_bedcard s2_later s2r_redraw s3_porter s3_delay s4_two_person s4_nurse_alone s4_bedno_only s4_slow_start s4_redraw s5_observe s5_vitals s5_leave s5_speed_up s6_stop s6_slow s6_febrile s6_verify s6_treat'},
  C010:{record:'s1_readback',other:'s1_call_back s1_hemolysis s1_notify',history:'s2_ask',consult:'s5_nephro s5_icu',comfort:'s5_reassure','refusal-signature':'s6_refuse','rescue-record':'s6_note s6_handoff s6_blame',treatment:'s2_monitor s2_quick s2_wait s3_repeat s3_stop_k s3_ct s3_continue s4_protocol s4_calcium s4_furosemide s4_potassium s5_observe'},
  C011:{history:'s1_ask',observe:'s1_record',exam:'s1_exam',consult:'s5_airway',record:'s6_adr s6_label s6_tamper','rescue-record':'s6_record s6_skip',other:'s7_end',treatment:'s1_skip s1_exam_labs s2_azith s2_pen_test s2_cef_direct s2_quick_test s2_double s3_positive s3_doubt s3_cef_test s3_sub s4_epi_im s4_steroid_first s4_epi_iv s4_epi_sc s5_repeat s5_pump s5_observe30 s5_icu s5_arrhythmia'},
  C012:{'full-exam':'s1_exam',history:'s1_ask',observe:'s1_night',consult:'s3_urgent s3_phone s3_routine s4_second',persuade:'s4_argue s4_escalate',consent:'s5_inform s5_partial','refusal-signature':'s5_refuse_oral s5_refuse_signed','progress-record':'s6_record s6_stable s6_skip_record',other:'s7_end',treatment:'s1_quick s1_analgesic s2_labs s2_ct s2_xray s2_wait s2_somatostatin s3_continue s4_accept s6_prep'},
  C013:{exam:'s1_bp_both', 'full-exam':'s1_exam',history:'s1_ask_meds',observe:'s1_insurance s2_bedside_us',comfort:'s1_wife_out',consent:'s5_inform','initial-record':'s6_record s6_brief',other:'s6_call s7_end',treatment:'s1_ortho s2_ecg_ddimer s2_ecg_only s2_xray s2_none s3_cta s3_acs s3_heparin s3_nitro s3_wait_trop s4_control s4_nitro_only s4_oral s4_analgesia s5_transfer s5_admit s5_self'},
  C014:{'full-exam':'s1_exam',observe:'s1_trend s1_chart',history:'s1_ask',comfort:'s4_explain s4_threat s4_head s5_oximeter','refusal-signature':'s4_ama s4_ama_oral',record:'s5_plan s5_brief','progress-record':'s6_record s6_dip_note s6_no_record',other:'s7_end',treatment:'s1_agree s2_sleep_spo2 s2_labs s2_xray s2_ct s2_none s3_stay s3_o2 s3_discharge_dip s3_transfer_op'},
  C015:{exam:'s1_score',history:'s1_ask',observe:'s1_bag',consult:'s2_mero_approved s2_pharmacist',persuade:'s2_argue s5_backfill','progress-record':'s5_record s5_none',other:'s6_end',treatment:'s1_culture s1_skip_culture s2_standard s2_fq s2_mero_direct s2_pip s3_continue s3_deescalate s3_vanco s3_ct s3_keep_mero s4_oral s4_iv_to_end s4_discharge_abx'},
  C016:{history:'s1_ask s3_mse',observe:'s1_bag',exam:'s1_exam',consult:'s3_psych',comfort:'s4_family s4_no_family','initial-record':'s5_record s5_vague s5_omit_psych',other:'s6_end',treatment:'s1_gastro s1_lavage s2_labs s2_tox s2_nac_now s2_wait_level s2_no_lft s3_no_psych s3_sedate s4_observe s4_discharge_now'},
  C017:{observe:'s1_review s1_nursing',history:'s2_ask', 'full-exam':'s2_exam',exam:'s2_drain s2_lung_only',consult:'s4_cxr s5_npo',comfort:'s7_family','progress-record':'s7_note s7_pneumonia_note s7_verbal',treatment:'s1_antipyretic s1_antibiotic s2_none s3_sepsis s3_sputum s3_wbc_only s3_urine s4_ct s4_chest_only s4_observe s5_abx s5_pneumonia s5_drain_wait s6_source s6_resp s6_puncture s6_no_escalate'},
  C018:{observe:'s1_medlist s1_chart s2_bag',history:'s1_call s2_ask',exam:'s2_exam',consult:'s3_renal',comfort:'s5_itemized s6_confront',consent:'s5_signature s5_push',record:'s6_record s6_delete s6_forward','progress-record':'s7_complete s7_blame s7_omit s7_handover',other:'s6_ignore s5_defer',treatment:'s1_quick s2_skip s3_labs s3_import_first s3_no_check s4_standard s4_wait s4_substitute s4_import s5_hide_cost'},
  C019:{exam:'s2_father s2_child s2_one s4_ob',history:'s2_history',consult:'s2_mother s4_hbo s4_obst s4_ped',comfort:'s6_followup','initial-record':'s6_note s6_groupnote',other:'s1_safe s1_reenter s2_continue s4_continue s6_handoff s6_nofollow s6_continue',treatment:'s1_oxygen s1_group s3_oxygen s3_coox s3_pulseox s3_decon s5_admit s5_discharge s5_hbo_yes s5_hbo_no'},
  C020:{observe:'s1_handover',record:'s1_confirm s1_assume s2_scene s2_timeline s2_edit s5_hide s5_delete s6_discuss s6_quality s6_blame s6_skip s7_backdate','rescue-record':'s7_record s7_verbal',comfort:'s3_family s3_rights s3_definite s3_refuse s4_pressure',consent:'s4_autopsy s4_consent_sign',persuade:'s5_report',other:'s1_leave s1_continue s2_cleanup s2_continue s3_continue s4_morgue s4_delay s4_continue s5_security s6_continue s7_handoff s7_continue',treatment:'s1_resuscitate'},
};

const actors:Record<string,Partial<Record<TalentActor,string>>>={
  C001:{family:'s1_history s1_feeding s1_allergy s5_inform s6_preop',peer:'s5_consult s7_followup'},
  C002:{family:'s1_wife_out'},
  C003:{family:'s1_daughter s4_inform s4_inform_lysis s5_call_family',peer:'s4_gi_consult s5_prep s6_handoff'},
  C004:{family:'s5_inform',peer:'s1_call_prev s5_gi s5_cardio'},
  C005:{family:'s1_mother_out s5_tell_mother',peer:'s4_neurosurg'},
  C006:{peer:'s1_ask_friends s5_tell_friends s5_tell_with_consent s6_handoff',nurse:'s3_nurse_glucose'},
  C007:{family:'s1_fever_days s1_grandma s1_rash s5_inform s5_blood_product s5_blame s5_return_advice s5_return_only',peer:'s4_cardio'},
  C008:{family:'s1_history s1_ask_bandage s2_lp s3_persuade s3_sign s3_verbal s3_force s5_inform'},
  C009:{family:'s7_inform',peer:'s3_pickup s3_phone_type s7_return_bag'},
  C010:{peer:'s1_readback s1_call_back s1_hemolysis s1_notify s5_nephro s5_icu s6_handoff',family:'s5_reassure s6_refuse'},
  C011:{peer:'s5_airway'},
  C012:{peer:'s3_urgent s3_phone s3_routine s4_argue s4_second',chief:'s4_escalate',family:'s5_inform s5_partial s5_refuse_oral s5_refuse_signed'},
  C013:{family:'s1_wife_out',peer:'s5_transfer s6_call'},
  C014:{family:'s1_ask s4_explain s4_ama s4_ama_oral s4_threat s4_head s5_oximeter'},
  C015:{chief:'s2_argue',peer:'s2_mero_approved s2_pharmacist s5_backfill'},
  C016:{family:'s4_family',peer:'s3_psych'},
  C017:{nurse:'s2_drain',peer:'s4_cxr s5_npo',family:'s7_family'},
  C018:{peer:'s1_call s3_renal s5_defer',other:'s6_confront'},
  C019:{family:'s6_followup',peer:'s2_mother s4_hbo s4_obst s4_ped s6_handoff'},
  C020:{family:'s3_family s3_rights s3_definite s3_refuse s4_autopsy s4_consent_sign s4_pressure',nurse:'s2_timeline',other:'s1_safe s5_report s5_security s7_handoff'},
};
const unsigned:Record<string,string>={C008:'s3_verbal',C009:'s1_verbal',C010:'s6_refuse',C012:'s5_refuse_oral',C014:'s4_ama_oral'};
const supplementalQuality:Record<string,Record<string,ClinicalMechanics['quality']>>={
  C003:{s3_observe:'incorrect',s3_rescue_fluid:'correct'},
  C005:{s1_bag_notice:'neutral',s1_bag:'correct',s1_bag_skip:'neutral',s2_dilate:'correct',s3_mrv_scan:'correct'},
  C007:{s5_return_only:'neutral'},C009:{s2r_redraw:'correct',s4_redraw:'correct'},
  C011:{s1_exam_labs:'neutral',s5_arrhythmia:'correct',s5_airway:'correct'},
  C013:{s1_wife_out:'correct'},C015:{s2_pharmacist:'correct'},C017:{s2_ask:'correct'},C019:{s2_history:'correct'},C020:{s1_handover:'correct'},
};
function split(s:string|undefined){return s?.split(' ').filter(Boolean)??[];}
function quality(g:ClinicalGraph,o:GraphOption):ClinicalMechanics['quality']{
  const added=supplementalQuality[g.id]?.[o.id];if(added)return added;
  const row=g.source.raw.split('\n').find(line=>line.startsWith(`| ${o.id} |`));
  const authored=row?.split('|')[3]?.trim();
  if(authored==='正确'||authored==='临床正确')return 'correct';if(authored==='中性')return 'neutral';if(authored==='陷阱')return 'incorrect';
  if(g.id==='C011'&&['s2_azith','s2_pen_test'].includes(o.id))return 'neutral';
  if(g.id==='C011'&&o.id==='s5_pump')return 'correct'; // epi_given is an availability prerequisite.
  if(g.id==='C015'&&o.id==='s3_keep_mero')return 'incorrect'; // carbapenem prerequisite.
  if(o.system)return 'neutral';
  throw new Error(`${g.id}/${o.id}: missing authored quality (${authored??'no row'})`);
}
function checkOperation(o:GraphOption):TalentOperation|undefined {
  if(!o.check)return undefined;
  // Original check column is authoritative; translated UI labels are not parsed.
  const field=o.source.raw.startsWith(`| ${o.id} |`)?o.source.raw.split('|')[9]?.trim():undefined;
  if(field?.startsWith('问诊'))return 'history';
  if(field?.startsWith('察觉'))return 'observe';
  if(field?.startsWith('安抚'))return 'comfort';
  if(field?.startsWith('说服'))return 'persuade';
  if(field?.startsWith('文书'))return 'record';
  if(field?.startsWith('抗压'))return 'endure';
  if(['s1_bag','s2_ask','s2_history'].includes(o.id))return 'history';
  return ({observe:'observe',clinical:'treatment',record:'record',persuade:'persuade',comfort:'comfort',endure:'endure'} as const)[o.check.skill];
}
export function applyClinicalMechanics(g:ClinicalGraph):void {
  const mapping=new Map<string,TalentOperation>();
  for(const [operation,ids] of Object.entries(operations[g.id]??{}))for(const id of split(ids)){
    if(mapping.has(id))throw new Error(`${g.id}/${id}: duplicate operation metadata`);mapping.set(id,operation as TalentOperation);
  }
  const actual=new Set(g.nodes.flatMap(n=>n.options.map(o=>o.id)));
  for(const id of mapping.keys())if(!actual.has(id))throw new Error(`${g.id}/${id}: stale operation metadata`);
  for(const n of g.nodes)for(const o of n.options){
    const operation=mapping.get(o.id);if(!operation)throw new Error(`${g.id}/${o.id}: missing operation metadata`);
    let actor:TalentActor='patient';for(const [target,ids] of Object.entries(actors[g.id]??{}))if(split(ids).includes(o.id))actor=target as TalentActor;
    const mechanic:ClinicalMechanics={operation,checkOperation:checkOperation(o),actor,quality:quality(g,o)};
    // A consultation's persuasion is consultation-specific, while comfort checks
    // within the same action remain comfort (T08 must not transform reassurance).
    if(operation==='consult'&&mechanic.checkOperation==='persuade')mechanic.checkOperation='consult';
    if(split(unsigned[g.id]).includes(o.id))mechanic.unsignedConsent=true;
    (o as GraphOption&{mechanics:ClinicalMechanics}).mechanics=mechanic;
    applyConsultationTime(g,o);
    if(g.id==='C011'&&o.id==='s2_azith')o.mechanicsVariants=[{when:{flag:'allergy_known'},mechanics:{quality:'correct'}}];
    if(g.id==='C011'&&o.id==='s2_pen_test')o.mechanicsVariants=[{when:{flag:'allergy_known'},mechanics:{quality:'incorrect'}}];
    if(g.id==='C005'&&o.id==='s3_mrv')o.mechanicsVariants=[{when:{not:{variant:'selfpay'}},mechanics:{operation:'treatment'}}];
  }
}
