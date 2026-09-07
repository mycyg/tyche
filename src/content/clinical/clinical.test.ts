import { describe, expect, it } from 'vitest';
import { clinicalGraphs, getClinicalGraph, initialGraphState, getAvailableGraphOptions, canContinueGraph, advanceClinicalGraph, graphCondition, unrevealedGraphClues, revealGraphClue, unrevealedGraphScent } from './index';
import type { ClinicalGraphState } from './types';
import {reportReviewLines}from './report-reading';

/** Paths contain only player actions. '!' is a failed communication/information roll.
 * Continue is used only when the current node has reached its authored minimum. */
function play(id:string,path:string,variants:string[]=[]){
  const graph=getClinicalGraph(id)!;let state=initialGraphState(graph,'clinical-fixture');if(variants.length)state.variants=variants;
  for(const token of path.split(' ').filter(Boolean)){
    const optionId=token.replace(/!$/,'');let guard=0;
    while(!getAvailableGraphOptions(graph,state).some(o=>o.id===optionId)&&guard++<20){
      const automatic=getAvailableGraphOptions(graph,state).find(o=>o.automatic);
      if(automatic)state=advanceClinicalGraph(graph,state,automatic.id,false).state;
      else if(canContinueGraph(graph,state))state=advanceClinicalGraph(graph,state,'continue').state;
      else break;
    }
    const available=getAvailableGraphOptions(graph,state).map(o=>o.id);
    expect(available,`${id} at ${state.nodeId} needs ${optionId}; flags ${state.flags.join(',')}`).toContain(optionId);
    state=advanceClinicalGraph(graph,state,optionId,!token.endsWith('!')).state;
  }
  let guard=0;while(!state.outcomeId&&canContinueGraph(graph,state)&&guard++<20)state=advanceClinicalGraph(graph,state,'continue').state;
  return state;
}
const good:Record<string,string>={
  C001:'s1_feeding s2_full s3_us s4_npo s5_consult s6_preop s7_note',
  C002:'s1_allergy s2_lung s3_cxr s4_amox s5_return s6_note',
  C003:'s1_history s2_ecg s3_dapt s3_fluid s4_pci s4_inform s5_prep s6_note',
  C004:'s1_review s2_ask_bleed s3_inr s4_reverse s5_gi s5_blood s6_note',
  C005:'s1_meds s2_neuro s3_ctv s4_admit_lmwh s5_stop_ocp s6_note',
  C006:'s1_glucose s2_d50 s3_history s3_infusion s4_observe s5_endo_referral s6_note',
  C007:'s1_fever_days s2_full s3_echo s4_admit_ivig s5_inform s6_note',
  C008:'s1_exam s2_labs s2_lp s3_persuade s4_empiric s5_picu s6_note',
  C009:'s1_indication s1_form_full s1_consent s2_wristband s3_pickup s4_two_person s5_observe s7_note',
  C010:'s1_readback s2_monitor s2_ask s3_repeat s3_stop_k s4_protocol s4_calcium s5_nephro s6_note',
  C011:'s1_record s2_azith s6_record s6_adr s6_label',
  C012:'s1_exam s2_labs s2_ct s3_urgent s4_escalate s5_inform s6_prep s6_record',
  C013:'s1_bp_both s2_ecg_ddimer s3_cta s4_control s5_transfer s6_record',
  C014:'s1_trend s2_sleep_spo2 s3_stay s4_explain s6_record',
  C015:'s1_score s1_culture s2_standard s3_deescalate s4_oral s5_record',
  C016:'s1_ask s2_labs s2_nac_now s3_psych s4_family s4_observe s5_record',
  C017:'s1_nursing s2_exam s3_sepsis s3_sputum s4_ct s5_npo s5_abx s6_source s7_note',
  C018:'s1_medlist s2_exam s3_labs s3_renal s4_standard s5_itemized s5_signature s6_record s7_complete',
  C019:'s1_safe s2_father s2_mother s2_child s3_oxygen s3_coox s4_obst s4_ped s5_admit s6_note s6_followup',
  C020:'s1_resuscitate s1_confirm s2_scene s2_timeline s3_family s3_rights s4_autopsy s4_morgue s5_report s6_discuss s6_quality s7_record s7_handoff',
};
const paths:[string,string,string,string[]?][]=[
 ['C001','o_good',good.C001,['onsite']],['C001','o_delay_short',good.C001.replace('s6_preop s7_note','s6_self'),['本院无小儿外科']],['C001','o_delay_long','s1_history s2_full s3_us s4_npo s5_admit_watch',['onsite']],['C001','o_worst','s1_history s2_full s3_us s4_npo s5_discharge',['onsite']],
 ['C002','o_good',good.C002],['C002','o_ok_warned',good.C002.replace('s4_amox s5_return','s4_cefo_iv s5_warn')],['C002','o_reaction',good.C002.replace('s4_amox s5_return','s4_ceftriaxone_iv s5_none')],['C002','o_worst',good.C002.replace('s4_amox s5_return','s4_cefo_iv s5_none')],
 ['C003','o_good',good.C003,['onsite']],['C003','o_ntg',good.C003.replace('s3_fluid','s3_fluid s3_ntg'),['onsite']],['C003','o_delay','s1_history s2_ecg s3_dapt s4_ccu',['onsite']],['C003','o_worst','s1_gastric s2_abd_only s3_observe',['onsite']],['C003','o_refuse','s1_history s2_ecg s3_dapt s4_inform! s4_inform!',['onsite']],
 ['C004','o_good',good.C004],['C004','o_delay',good.C004.replace('s5_blood','s5_wait')],['C004','o_missed','s1_brief s2_quick s3_none s4_reverse s5_gi s6_note'],['C004','o_worst','s1_review s2_ask_bleed s3_inr s4_continue'],
 ['C005','o_good',good.C005],['C005','o_partial','s1_redflags s2_neuro s3_ct s3_ct_home s5_return s6_note'],['C005','o_delay','s1_migraine s5_return s6_note'],['C005','o_worst','s1_redflags s2_neuro s3_ctv s4_outpatient'],
 ['C006','o_good',good.C006],['C006','o_late_nurse',good.C006.replace('s1_glucose','s1_drunk s3_nurse_glucose')],['C006','o_rebound','s1_glucose s2_d50 s3_discharge'],['C006','o_worst','s1_drunk s3_observe'],
 ['C007','o_good',good.C007,['usual']],['C007','o_delay','s1_fever_days s2_full s3_echo s4_observe_3d',['usual']],['C007','o_missed','s1_scarlet s5_return_only s6_scarlet_dx',['usual']],['C007','o_worst','s1_scarlet s5_return_only s6_scarlet_dx',['coronary_thrombosis']],['C007','o_refuse','s1_fever_days s2_full s3_echo s4_admit_ivig s5_inform! s5_inform!',['usual']],
 ['C008','o_good',good.C008,['onsite']],['C008','o_partial',good.C008.replace('s3_persuade','s3_persuade! s3_sign'),['onsite']],['C008','o_delay','s1_febrile_sz s2_lp s3_persuade s4_wait_csf s5_observe s6_note',['onsite']],['C008','o_worst','s1_exam s2_lp s3_discharge',['onsite']],
 ['C009','o_good',good.C009,['same_sex']],['C009','o_caught',good.C009.replace('s2_wristband','s2_call_name').replace('s4_two_person','s4_two_person s2r_redraw s4_two_person'),['same_sex']],['C009','o_reaction',good.C009.replace('s2_wristband','s2_call_name').replace('s4_two_person','s4_nurse_alone').replace('s5_observe','s5_observe s6_stop s6_treat'),['same_sex']],['C009','o_worst',good.C009.split('s2_wristband')[0]+'s2_call_name s3_pickup s4_nurse_alone s5_observe s6_slow',['same_sex']],
 ['C010','o_good',good.C010],['C010','o_arrest',good.C010.replace('s3_stop_k','s3_continue')],['C010','o_delay',good.C010.replace('s1_readback','s1_call_back')],['C010','o_stable_delay',good.C010.replace('s5_nephro','s5_icu')],
 ['C011','o_good',good.C011],['C011','o_rescued','s1_skip s2_quick_test s4_epi_im s5_repeat s6_record'],['C011','o_biphasic','s1_skip s2_quick_test s4_epi_im s5_observe30'],['C011','o_hypoxic','s1_skip s2_quick_test s4_steroid_first s5_repeat s6_record'],
 ['C012','o_good',good.C012],['C012','o_late',good.C012.replace('s2_labs','s2_wait')],['C012','o_refused',good.C012.split('s5_inform')[0]+'s5_refuse_signed!'],['C012','o_death','s1_exam s2_ct s3_continue'],
 ['C013','o_good',good.C013],['C013','o_partial',good.C013.replace('s4_control','s4_nitro_only')],['C013','o_antiplatelet',good.C013.replace('s3_cta','s3_acs')],['C013','o_home','s1_ortho'],['C013','o_transit',good.C013.split('s5_transfer')[0]+'s5_self'],
 ['C014','o_good',good.C014],['C014','o_ama','s1_trend s2_sleep_spo2 s3_stay s4_ama s5_plan'],['C014','o_readmit_death','s1_agree s5_plan'],['C014','o_dip_only',good.C014.replace('s6_record','s6_no_record')],
 ['C015','o_good',good.C015],['C015','o_carbapenem_fine',good.C015.replace('s2_standard','s2_mero_direct')],['C015','o_cdiff',good.C015.replace('s2_standard','s2_mero_direct').replace('s3_deescalate','s3_keep_mero')],['C015','o_approved_ok',good.C015.replace('s2_standard','s2_mero_approved')],
 ['C016','o_good',good.C016],['C016','o_late_nac',good.C016.replace('s2_nac_now','s2_wait_level')],['C016','o_liver_failure',good.C016.replace('s4_family s4_observe','s4_discharge_now')],['C016','o_unsupervised',good.C016.replace('s3_psych','s3_no_psych')],
 ['C017','o_good',good.C017,['leak']],['C017','o_lung_path',good.C017.replace('s4_ct','s4_cxr').replace('s6_source','s6_resp'),['lung_infection']],['C017','o_delay',good.C017.replace('s5_npo','s5_pneumonia'),['leak']],['C017','o_worst',good.C017.replace('s6_source','s6_no_escalate'),['leak']],
 ['C018','o_good',good.C018],['C018','o_harm',good.C018.replace('s3_labs','s3_no_check').replace('s4_standard','s4_import')],['C018','o_admin',good.C018.replace('s6_record','s6_forward')],['C018','o_uncertain',good.C018.replace('s7_complete','s7_complete!')],
 ['C019','o_good',good.C019],['C019','o_hbo',good.C019.replace('s4_obst','s4_hbo').replace('s5_admit','s5_hbo_yes').replace('s6_followup','s6_handoff')],['C019','o_delayed',good.C019.replace('s6_followup','s6_nofollow')],['C019','o_unsafe',good.C019.replace('s1_safe','s1_reenter')],
 ['C020','o_chain',good.C020],['C020','o_respectful_dispute',good.C020.replace('s6_discuss s6_quality','s6_quality')],['C020','o_lost_chain',good.C020.replace('s1_resuscitate','s1_assume')],['C020','o_obstruction',good.C020.replace('s2_timeline','s2_edit')],
];

describe('complete authored case graphs',()=>{
  it('C013 bedside measurements and medication records reveal actual observations immediately',()=>{
    const graph=getClinicalGraph('C013')!;
    const measured=advanceClinicalGraph(graph,initialGraphState(graph,'bp'),'s1_bp_both');
    for(const observation of ['186/108','152/96','34 mmHg','左侧桡动脉'])expect(measured.actionText).toContain(observation);
    expect(measured.reports[0].full).toContain('152/96');
    const pharmacy=advanceClinicalGraph(graph,initialGraphState(graph,'pharmacy'),'s1_insurance');
    expect(pharmacy.actionText).toContain('三个月前');expect(pharmacy.actionText).toContain('两个月');
    const missed=advanceClinicalGraph(graph,initialGraphState(graph,'exam'),'s1_exam',false);
    expect(missed.actionText).toContain('未能确认');expect(missed.state.flags).not.toContain('bp_diff');
  });
  it('all original and supplemental actions carry explicit cost/check/actor/quality metadata',()=>{
    for(const g of clinicalGraphs)for(const n of g.nodes)for(const o of n.options){expect(o.mechanics,`${g.id}/${o.id}`).toBeTruthy();expect(o.mechanics!.operation).toBeTruthy();expect(o.mechanics!.quality).toMatch(/^(correct|neutral|incorrect)$/);if(o.check)expect(o.mechanics!.checkOperation).toBeTruthy();}
    const op=(caseId:string,id:string)=>getClinicalGraph(caseId)!.nodes.flatMap(n=>n.options).find(o=>o.id===id)!;
    expect(op('C001','s2_abd').mechanics).toMatchObject({operation:'exam',checkOperation:'observe'});
    expect(op('C003','s4_inform').mechanics).toMatchObject({operation:'consent',checkOperation:'comfort',actor:'family'});
    expect(op('C015','s2_argue').mechanics).toMatchObject({operation:'persuade',checkOperation:'persuade',actor:'chief'});
    expect(op('C004','s2_ask_bleed').mechanics?.checkOperation).toBe('history');
  });
  it('conditional quality follows known facts, not whether a source option happens to contain a hazard',()=>{
    const g=getClinicalGraph('C011')!;let s=initialGraphState(g,'quality');s.nodeId='s2';
    expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s2_azith')?.mechanics?.quality).toBe('neutral');
    s={...s,flags:['allergy_known']};expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s2_azith')?.mechanics?.quality).toBe('correct');
    expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s2_pen_test')?.mechanics?.quality).toBe('incorrect');
  });
  it('talent clues reveal only actual history and respect diagnostic variants and prior revelation',()=>{
    for(const g of clinicalGraphs){const s=initialGraphState(g,'history');expect(unrevealedGraphClues(g,s).length,g.id).toBeGreaterThan(0);}
    const g=getClinicalGraph('C017')!;const s={...initialGraphState(g,'lung'),variants:['lung_infection']};const visible=unrevealedGraphClues(g,s);expect(visible.some(c=>c.text.includes('变浑浊'))).toBe(true);expect(visible.some(c=>c.revealFlags.includes('leak_suspected'))).toBe(false);
    const c5=getClinicalGraph('C005')!;const previous=initialGraphState(c5,'clue');const clue=unrevealedGraphClues(c5,previous)[0];const next=revealGraphClue(c5,previous,clue.id);
    expect(next.flags).toContain('ocp_known');expect(next.flags).not.toContain('cvst_confirmed');expect(next.choices).toEqual([]);expect(next.cost).toBe(0);expect(unrevealedGraphClues(c5,next)).toEqual([]);expect(previous.flags).toEqual([]);
    expect(unrevealedGraphScent(c5,previous)).toBeUndefined();expect(unrevealedGraphScent(getClinicalGraph('C002')!,initialGraphState(getClinicalGraph('C002')!,'scent'))?.kind).toBe('alcohol');
  });
  it('C005: the first action triggers independent DC14 observation, then DC10 history only on success',()=>{
    const g=getClinicalGraph('C005')!;let s=initialGraphState(g,'bag');
    s=advanceClinicalGraph(g,s,'s1_mother_out',false).state;expect(s.nodeId).toBe('s1notice');
    expect(getAvailableGraphOptions(g,s)[0]).toMatchObject({id:'s1_bag_notice',automatic:true,ap:0,minutes:0,check:{dc:14}});
    s=advanceClinicalGraph(g,s,'s1_bag_notice',true).state;expect(s.nodeId).toBe('s1bag');expect(s.flags).not.toContain('ocp_known');
    expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s1_bag')?.check?.dc).toBe(10);
    s=advanceClinicalGraph(g,s,'s1_bag',true).state;expect(s.flags).toContain('ocp_known');expect(s.nodeId).toBe('s1');
    expect(s.selected.s1).toContain('s1_mother_out');expect(s.attempts.s1_mother_out).toBe(1);
    expect(getAvailableGraphOptions(g,s).find(o=>o.id==='s1_mother_out')?.check?.dc).toBe(12);
    s=advanceClinicalGraph(g,s,'s1_mother_out',true).state;expect(s.nodeId).not.toBe('s1notice');
    let wrong=initialGraphState(g,'bag-wrong');wrong=advanceClinicalGraph(g,wrong,'s1_migraine').state;
    wrong=advanceClinicalGraph(g,wrong,'s1_bag_notice',false).state;expect(wrong.nodeId).toBe('s5');expect(wrong.flags).not.toContain('bag_noticed');expect(wrong.flags).not.toContain('ocp_known');
  });
  it('C005: self-pay MRI requires DC12 consent; decline generates neither charges nor results and permits CTV',()=>{
    const g=getClinicalGraph('C005')!;let s=initialGraphState(g,'mri');s.variants=['selfpay','mother_present'];
    s=advanceClinicalGraph(g,s,'s1_redflags').state;s=advanceClinicalGraph(g,s,'s1_bag_notice',false).state;s=advanceClinicalGraph(g,s,'continue').state;s=advanceClinicalGraph(g,s,'s2_neuro').state;
    const offer=getAvailableGraphOptions(g,s).find(o=>o.id==='s3_mrv')!;expect(offer.check?.dc).toBe(12);expect(offer.cost).toBe(0);expect(offer.minutes).toBe(3);
    const refused=advanceClinicalGraph(g,s,'s3_mrv',false);expect(refused.state.nodeId).toBe('s3');expect(refused.state.cost).toBe(s.cost);expect(refused.state.flags).not.toContain('mrv_done');expect(refused.state.flags).not.toContain('cvst_confirmed');expect(refused.reports).toHaveLength(0);
    expect(getAvailableGraphOptions(g,refused.state).some(o=>o.id==='s3_ctv')).toBe(true);
    const ctv=advanceClinicalGraph(g,refused.state,'s3_ctv');expect(ctv.state.flags).toContain('cvst_confirmed');expect(ctv.state.cost-s.cost).toBe(720);
    const accepted=advanceClinicalGraph(g,s,'s3_mrv',true);expect(accepted.state.nodeId).toBe('s3mrv');expect(accepted.reports).toHaveLength(0);expect(accepted.state.flags).not.toContain('cvst_confirmed');
    const scan=getAvailableGraphOptions(g,accepted.state)[0];expect(scan).toMatchObject({id:'s3_mrv_scan',automatic:true,cost:960,minutes:60});
    const completed=advanceClinicalGraph(g,accepted.state,scan.id);expect(completed.state.flags).toContain('cvst_confirmed');expect(completed.state.cost-s.cost).toBe(960);expect(completed.reports).toHaveLength(1);
    const insured={...s,variants:['insured']};expect(getAvailableGraphOptions(g,insured).find(o=>o.id==='s3_mrv')?.check).toBeUndefined();
    expect(advanceClinicalGraph(g,insured,'s3_mrv').state.flags).toContain('mrv_done');
  });
  it('all cases retain authored exits through mixed correct, incorrect and failed choices',()=>{
    let random=17381;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
    for(const g of clinicalGraphs)for(let sample=0;sample<200;sample++){
      let s=initialGraphState(g,`branch-safety-${sample}`);const path:string[]=[];
      for(let step=0;step<100&&!s.outcomeId;step++){
        const actions=getAvailableGraphOptions(g,s).map(o=>o.id);if(canContinueGraph(g,s))actions.push('continue');
        expect(actions.length,`${g.id}/${s.nodeId}: ${path.join(' ')}; flags ${s.flags.join(',')}`).toBeGreaterThan(0);
        const action=actions[Math.floor(next()*actions.length)];const success=next()>.35;path.push(action+(success?'':'!'));s=advanceClinicalGraph(g,s,action,success).state;
      }
      expect(s.outcomeId,`${g.id}: ${path.join(' ')}`).toBeTruthy();
    }
  },15000);
  it('C006: failed oral/CT-first care retains a real rescue and deterioration branch',()=>{
    const g=getClinicalGraph('C006')!;
    let s=initialGraphState(g,'test-0');
    for(const id of ['s1_search','s1_glucose','s2_oral','s2_ct_first'])s=advanceClinicalGraph(g,s,id).state;
    s=advanceClinicalGraph(g,s,'continue').state;
    expect(s.nodeId).toBe('s3');expect(s.flags).not.toContain('pt_awake');
    expect(getAvailableGraphOptions(g,s).map(o=>o.id)).toEqual(expect.arrayContaining(['s3_nurse_glucose','s3_observe']));
    expect(advanceClinicalGraph(g,s,'s3_observe').state.outcomeId).toBe('o_worst');
    s=advanceClinicalGraph(g,s,'s3_nurse_glucose').state;
    expect(s.nodeId).toBe('s2');s=advanceClinicalGraph(g,s,'s2_d50').state;
    expect(s.flags).toContain('pt_awake');expect(getAvailableGraphOptions(g,s).map(o=>o.id)).toContain('s3_infusion');
  });
  for(const [id,ending,path,variants] of paths)it(`${id}: player path reaches ${ending}`,()=>expect(play(id,path,variants).outcomeId).toBe(ending));
  it('covers every source outcome with a legal player path',()=>{
    for(const graph of clinicalGraphs)for(const ending of graph.outcomes.filter(o=>!o.supplemental))expect(paths.some(([id,o])=>id===graph.id&&o===ending.id),`${graph.id}/${ending.id}`).toBe(true);
  });
  it('preserves all original option IDs and source node counts',()=>{
    for(const graph of clinicalGraphs){
      const sourceIds=[...graph.source.raw.matchAll(/^\| (s\w+) \|/gm)].map(m=>m[1]);
      const imported=graph.nodes.flatMap(n=>n.options.map(o=>o.id));
      for(const id of sourceIds)expect(imported,graph.id).toContain(id);
      expect(new Set(imported).size).toBe(imported.length);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(6);
      const targets=new Set([...graph.nodes.map(n=>n.id),...graph.outcomes.map(n=>n.id),'outcomes','resume']);
      for(const node of graph.nodes){expect(targets.has(node.exit),`${graph.id}/${node.id} exit ${node.exit}`).toBe(true);for(const option of node.options)expect(targets.has(option.next??node.exit),`${graph.id}/${option.id} -> ${option.next}`).toBe(true);}
    }
  });
  it('does not permit repeated multi actions or premature Continue',()=>{
    const g=getClinicalGraph('C010')!;let s=initialGraphState(g,'test');s=advanceClinicalGraph(g,s,'s1_readback').state;
    expect(canContinueGraph(g,s)).toBe(false);s=advanceClinicalGraph(g,s,'s2_monitor').state;
    expect(canContinueGraph(g,s)).toBe(false);expect(getAvailableGraphOptions(g,s).some(o=>o.id==='s2_monitor')).toBe(false);
    expect(()=>advanceClinicalGraph(g,s,'s2_monitor')).toThrow();
    s=advanceClinicalGraph(g,s,'s2_ask',false).state;expect(s.nodeId).toBe('s3');expect(s.flags).not.toContain('potassium_tab');expect(s.flags).toContain('ecg_done');
  });
  it('seeds diagnostic variants once and never mutates them after choice',()=>{
    const g=getClinicalGraph('C017')!;for(const seed of ['one','two','three']){const s=initialGraphState(g,seed);expect(initialGraphState(g,seed)).toEqual(s);expect(advanceClinicalGraph(g,s,'s1_nursing').state.variants).toEqual(s.variants);}
  });
  it('keeps leak and lung findings exclusive and suppresses unperformed reports',()=>{
    const g=getClinicalGraph('C017')!;let s=initialGraphState(g,'lung');s.variants=['lung_infection'];
    for(const id of ['s1_nursing','s2_exam','s3_sepsis','s3_sputum','s4_ct'])s=advanceClinicalGraph(g,s,id).state;
    expect(s.flags).toContain('leak_excluded');expect(s.flags).not.toContain('leak_confirmed');expect(s.flags).not.toContain('leak_suspected');
    const reports=g.reports.filter(r=>graphCondition(r.when,s));expect(reports.some(r=>r.full.includes('6.2 cm×3.8 cm'))).toBe(false);expect(reports.some(r=>r.full.includes('未见吻合口漏征象'))).toBe(true);
    expect(g.reports.filter(r=>graphCondition(r.when,initialGraphState(g,'new')))).toHaveLength(0);
  });
  it('the visible skim and its adjacent verbatim review preserve all report numbers',()=>{
    for(const g of clinicalGraphs)for(const r of g.reports){
      const visible=[r.skimmed,...reportReviewLines(r.full,r.skimmed)].join('\n');
      const numbers=r.full.match(/\d+(?:\.\d+)?/g)??[];
      for(const n of numbers)expect(visible,`${g.id}/${r.id}`).toContain(n);
      expect(r.full).not.toMatch(/⚠|待核/);
    }
  });
  it('historical wrong-sample evidence survives a successful redraw',()=>{
    const s=play('C009',paths.find(([id,end])=>id==='C009'&&end==='o_caught')![2],['same_sex']);expect(s.flags).toContain('wbit');expect(s.flags).toContain('redraw');expect(s.flags).toContain('mitigated:s2_call_name');
  });
  it('every flag has a source-linked consumer and every hazard is attributable',()=>{
    for(const g of clinicalGraphs)for(const n of g.nodes)for(const o of n.options){for(const flag of [...(o.effects.flags??[]),...o.rules.flatMap(r=>r.effects.flags??[])])expect(g.flagConsumers[flag]?.length,`${g.id}/${flag}`).toBeGreaterThan(0);for(const h of [...(o.effects.hazards??[]),...o.rules.flatMap(r=>r.effects.hazards??[])]){expect(h.reason).toBeTruthy();expect(o.source.file).toContain(g.id);}}
  });
});
