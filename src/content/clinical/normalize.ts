import type { ClinicalGraph, ClinicalOutcome, GraphCondition, GraphOption, ClinicalNode } from './types';
import type { Effects } from '../../game/types';
import {applyBedsideObservations} from './observations';
const F=(flag:string):GraphCondition=>({flag});
const C=(choice:string):GraphCondition=>({choice});
const V=(variant:string):GraphCondition=>({variant});
const A=(...all:GraphCondition[]):GraphCondition=>({all});
const O=(...any:GraphCondition[]):GraphCondition=>({any});
const N=(not:GraphCondition):GraphCondition=>({not});
const fs=(text:string)=>A(...text.split(' ').map(F));
const cs=(text:string)=>A(...text.split(' ').map(C));
const fc=(text:string)=>O(...text.split(' ').map(F));
const cc=(text:string)=>O(...text.split(' ').map(C));
const noCausal:GraphCondition={noCausal:true};
const minutes=(min=0,max=Infinity):GraphCondition=>({minutes:{min,...(Number.isFinite(max)?{max}:{})}});

/** Reviewed normalization: source files predate the graph contract in several places.
 * Each alteration records a source-linked explanation; source text and IDs remain intact. */
export function normalizeClinicalGraph(g:ClinicalGraph):ClinicalGraph {
  const node=(id:string)=>{const n=g.nodes.find(n=>n.id===id);if(!n)throw new Error(`${g.id} missing ${id}`);return n;};
  const op=(id:string)=>{const o=g.nodes.flatMap(n=>n.options).find(o=>o.id===id);if(!o)throw new Error(`${g.id} missing ${id}`);return o;};
  const multi=(id:string,min:number,max:number,exitOn:string[]=[])=>{Object.assign(node(id),{kind:'multi',min,max,exitOn});};
  const req=(id:string,condition:GraphCondition)=>{op(id).requires=condition;};
  const set=(id:string,flags:string[],on:'always'|'success'|'failure'='always',when?:GraphCondition)=>op(id).rules.push({on,when,effects:{flags}});
  const effect=(id:string,effects:Effects,on:'always'|'success'|'failure'='always',when?:GraphCondition)=>op(id).rules.push({on,when,effects});
  const outcome=(id:string,condition:GraphCondition,priority?:number)=>{const o=g.outcomes.find(o=>o.id===id);if(!o)throw new Error(`${g.id} missing outcome ${id}`);o.condition=O(F(`direct:${id}`),condition);if(priority!==undefined)o.priority=priority;};
  const report=(index:number,when:GraphCondition,afterNode?:string)=>{const r=g.reports[index];if(!r)throw new Error(`${g.id} report ${index}`);r.when=when;r.afterNode=afterNode;};
  const variant=(id:string,title:string,group='context',weight=1)=>g.variants.push({id,title,group,weight});
  const add=(at:string,id:string,label:string,next:string,effects:Effects={},minutes=0,ap=0,cost=0,requires?:GraphCondition):GraphOption=>{
    const existing=node(at).options.find(o=>o.id===id);
    if(existing){Object.assign(existing,{label,next,effects,minutes,ap,cost,requires});return existing;}
    const o:GraphOption={id,label,next,effects,minutes,ap,cost,result:label+'。',rules:[],reports:[],requires,source:{...node(at).source,section:`${at} 附加规则`,raw:node(at).source.raw}};node(at).options.push(o);return o;
  };
  // Legacy self-loop actions may be selected once each. Explicit exits remain immediate.
  for(const n of g.nodes){
    if(n.kind==='single'&&n.options.some(o=>o.next===n.id)){
      n.kind='multi';n.min=1;n.max=n.options.length;n.exitOn=n.options.filter(o=>o.next!==n.id).map(o=>o.id);
    }
    n.text=n.text.replace(/(?:叙事|系统)档[：:]/g,'');
    for(const o of n.options){
      if(o.retry)o.failureNext=n.id;
      o.result=o.result||o.label+'。';
      if(/篡改/.test(o.source.raw))o.effects.hazards=[...(o.effects.hazards??[]),{type:'D',weight:20,reason:g.tribunal[o.id]??'事后改动原始记录',norm:'病历真实、准确与可追溯要求',causal:false}];
    }
  }
  if(g.id==='C001'){
    variant('onsite','本院有小儿外科','facility',3);variant('本院无小儿外科','本院无小儿外科','facility');variant('quiet','家属陪同','family',3);variant('recording','家属录音','family');
    multi('s3',1,2);multi('s5',1,2,['s5_admit_watch','s5_discharge']);multi('s6',1,2,['s6_wait','s6_wait_transfer','s6_self']);
    for(const id of ['s6_preop','s6_labs_repeat'])req(id,A(V('onsite'),F('surgeon_called')));
    req('s6_wait',V('onsite'));req('s6_transfer',A(V('本院无小儿外科'),F('surgeon_called')));req('s6_transfer_note',A(V('本院无小儿外科'),F('surgeon_called')));
    req('s6_self',O(V('本院无小儿外科'),N(F('surgeon_called'))));req('s6_wait_transfer',V('本院无小儿外科'));
    op('s2_abd').effects.hazards=[];effect('s2_abd',{hazards:[{type:'R',weight:25,reason:g.tribunal.s2_abd,norm:'完整体格检查',causal:true}]},'failure');
    set('s3_us',['mass_found']);op('s1_history').modifiers=[{when:V('recording'),dc:2}];
    outcome('o_worst',C('s5_discharge'),400);outcome('o_delay_long',cc('s5_admit_watch s6_wait s6_wait_transfer'),300);
    outcome('o_delay_short',O(C('s6_self'),A(F('surgeon_called'),fc('preop_done transferred'),minutes(121))),200);
    outcome('o_good',A(fs('mass_found stabilized surgeon_called'),fc('preop_done transferred'),minutes(0,120),N(fc('enema_done reduced_by_ped abx_only'))),0);
    report(0,C('s3_xray'));report(1,C('s3_us'));report(2,C('s3_labs'));report(3,C('s3_ct'));
    g.normalizationNotes.push('s3 允许至多两项；s5 会诊和告知共存；s6 术前/转运准备和文书共存。o_good 按分支契约补足查明包块、稳定和排除未补救不当处置条件。121 分钟以上接已写延误路径，超过 180 分钟不虚构良好结局。');
    g.normalizationNotes.push('s4_reduce 附加条件“嵌顿<12小时且无发红且外科在场”在本例不成立：源底牌固定14小时、皮肤发红，源可用变体仅家属录音/本院无小儿外科。保留原禁忌风险，不用随机数改写已确定病程；如另扩写早期病例须同步病史、体征、超声和在场外科流程，不能仅撤去此选项风险。');
  }
  if(g.id==='C002'){
    variant('wife_present','妻子陪同','family');variant('selfpay','自费','payment');variant('insured','医保','payment',3);
    multi('s3',1,3);multi('s5',1,2);op('s1_history').modifiers=[{when:N(F('wife_out')),dc:2}];
    set('s3_cxr',['pneumonia_confirmed']);set('s3_ct',['pneumonia_confirmed']);set('s3_lft',['lft_hint']);
    op('s5_warn').effects.flags=[];set('s5_warn',['warned'],'success');set('s5_warn',['warned_weak'],'failure');
    effect('s5_warn',{flags:['mitigated:s4_cefo_iv','mitigated:s4_ceftriaxone_iv']},'success');
    req('s5_none',N(cc('s5_warn s5_return')));req('s5_warn',N(C('s5_none')));req('s5_return',N(C('s5_none')));
    const ceph=fc('rx_cefoperazone rx_ceftriaxone');
    outcome('o_worst',A(F('rx_cefoperazone'),fc('no_warning warned_weak'),N(C('s1_wife_out'))),400);
    outcome('o_reaction',A(ceph,F('no_warning'),N(F('alcohol_known'))),300);
    outcome('o_ok_warned',A(ceph,F('warned')),100);
    outcome('o_good',A(fc('rx_amox rx_moxi'),C('s5_return'),F('pneumonia_confirmed')),0);
    report(0,C('s3_cxr'));report(1,C('s3_cbc'));report(2,C('s3_lft'));report(3,C('s3_ct'));
  }
  if(g.id==='C003'){
    variant('onsite','本院有导管室','facility',3);variant('本院无导管室','本院无导管室','facility');
    multi('s2',1,3);multi('s3',1,4,['s3_observe']);multi('s4',1,2,['s4_ccu','s4_ccu_no_cath','s4_transfer_far']);
    for(const id of ['s3_dapt','s3_fluid','s3_atropine'])req(id,F('stemi_known'));
    req('s3_ecg_late',N(F('stemi_known')));add('s3','s3_observe','留观至天亮','o_worst',{flags:['observed_without_ecg'],hazards:[{type:'R',weight:30,reason:'未行心电图即留观，病因评估延迟。',norm:'急危重患者评估',causal:true}]},5,1,0,N(F('stemi_known'))).result='你让患者留观至天亮。';
    add('s3','s3_rescue_fluid','快速补液并复评血压','s3',{flags:['pressure_rescued','mitigated:s3_ntg','mitigated:s3_lasix']},10,1,25,fc('ntg_given lasix_given')).result='你快速补液并复评血压。';
    for(const id of ['s4_pci','s4_ccu','s4_gi_consult','s4_inform'])req(id,V('onsite'));
    for(const id of ['s4_lysis','s4_transfer_far','s4_ccu_no_cath','s4_inform_lysis'])req(id,V('本院无导管室'));
    op('s4_inform').retry={max:2,dcIncrease:2,exhaustedNext:'o_refuse'};
    op('s4_inform_lysis').retry={max:2,dcIncrease:2,exhaustedNext:'o_refuse'};op('s4_inform_lysis').effects.flags=[];set('s4_inform_lysis',['consented'],'success');
    const reperf=cc('s4_pci s4_lysis');
    outcome('o_worst',F('observed_without_ecg'),400);outcome('o_refuse',F('refusal_persisted'),350);
    outcome('o_delay',O(cc('s4_ccu s4_ccu_no_cath s4_transfer_far'),A(C('s4_gi_consult'),minutes(181))),300);
    outcome('o_ntg',A(fc('ntg_given lasix_given'),reperf),100);
    outcome('o_good',A(F('stemi_known'),reperf,fs('dapt_given fluid_given prep_done'),N(fc('ntg_given lasix_given')),minutes(0,90)),0);
    const good=g.outcomes.find(o=>o.id==='o_good')!;good.textVariants=[{when:V('本院无导管室'),text:'就地启动溶栓后，复查心电图的 ST 段回落。转运团队带着首份心电图和给药记录送她到接收医院，随后完成冠状动脉评估。女儿在走廊联系了护工。'}];
    report(0,cc('s2_ecg s3_ecg_late'));report(1,C('s2_labs'),'s4');report(2,cc('s2_abd_only s2_abd_us'));report(3,C('s5_prep'));
  }
  if(g.id==='C004'){
    multi('s1',1,2);multi('s4',1,3,['s4_continue']);multi('s5',1,4);
    set('s3_inr',['inr_high','hb_low']);effect('s6_blame',{relations:{peer:-2,chief:-1}});
    outcome('o_worst',C('s4_continue'),400);
    outcome('o_missed',A(cs('s1_brief s2_quick'),N(C('s3_inr'))),300);
    outcome('o_delay',cc('s3_ct s5_wait'),100);
    outcome('o_good',A(fc('interaction_found melena_known'),cs('s4_reverse s5_gi s5_blood')),0);
    report(0,C('s3_inr'));report(1,C('s3_stool'));report(2,C('s5_gi'));report(3,C('s3_ct'));
  }
  if(g.id==='C005'){
    variant('mother_present','母亲陪同','family');variant('selfpay','自费','payment');variant('insured','医保','payment',3);
    multi('s5',1,3);req('s3_ct_home',F('ct_done'));req('s5_stop_ocp',F('ocp_known'));req('s5_no_return',N(C('s5_return')));req('s5_return',N(C('s5_no_return')));
    op('s1_meds').modifiers=[{when:N(F('mother_out')),dc:2}];
    for(const id of ['s3_mrv','s3_ctv'])op(id).modifiers=[{when:fc('red_flags papilledema ocp_known'),minutes:op(id).minutes/2}];
    multi('s1',1,3,['s1_migraine']);
    // The authored DC14 observation is independent of the first action's roll.
    // Its modal subgraph resumes the exact selected-action destination, including
    // failed privacy requests and an already chosen migraine shortcut.
    const notice:ClinicalNode={id:'s1notice',title:'包口的一角',text:'她回答时把帆布包往怀里抱了一点。',kind:'single',min:1,max:1,exit:'resume',options:[],source:{...node('s1').source,section:'s1 任一行动后自动察觉 DC14'}};
    const question:ClinicalNode={...notice,id:'s1bag',title:'帆布包里的药板',text:'银色药板从包口露出一角，她的手一直压在上面。',options:[],source:{...notice.source,section:'察觉成功后的追加问诊 DC10'}};
    g.nodes.splice(1,0,notice,question);
    for(const o of node('s1').options)o.followUp={node:'s1notice',onceFlag:'bag_observation_checked'};
    const noticeOption=add('s1notice','s1_bag_notice','看见她压住包口的手','s1bag',{},0,0,0);noticeOption.automatic=true;noticeOption.failureNext='resume';noticeOption.check={skill:'observe',dc:14,failure:{},failureText:'走廊有人敲门，桌上的病历挡住了包口。'};noticeOption.result='银色药板露出一角，她把包抱得更紧了。';set('s1_bag_notice',['bag_noticed'],'success');
    const bag=add('s1bag','s1_bag','轻声问她：包里是什么药？','resume',{},3,1,0,F('bag_noticed'));bag.check={skill:'observe',dc:10,purpose:'问诊：包里的药物',failure:{},failureText:'她把包口拢紧，只说是以前留下的药。'};bag.result='「避孕药，吃了三个月了。别告诉我妈。」她的声音很低。';set('s1_bag',['ocp_known'],'success');
    add('s1bag','s1_bag_skip','不追问包里的药，继续接诊','resume',{},0,0,0).result='她把药板压回包里。';
    const fundus=add('s2','s2_dilate','散瞳后复查眼底','s3',{flags:['papilledema']},15,1,0,F('fundus_unclear'));set('s2_fundus',['fundus_unclear'],'failure');op('s2_fundus').failureNext='s2';fundus.result='散瞳后眼底可见双侧视乳头水肿，边界不清。';
    outcome('o_worst',O(C('s4_outpatient'),fs('no_imaging no_return_advice')),400);
    outcome('o_delay',A(fc('treated_as_migraine no_imaging'),fc('return_told no_return_advice')),300);
    outcome('o_partial',fs('ct_only_home return_told'),100);
    outcome('o_good',A(fs('cvst_confirmed ocp_stopped'),C('s4_admit_lmwh')),0);
    report(0,C('s3_ct'));report(1,F('mrv_done'));report(2,C('s3_ctv'));report(3,C('s4_admit_lmwh'));
    g.normalizationNotes.push('s1 药板追加问诊在底牌写明但原表缺 ID，补为 s1_bag；s2 散瞳后复查补为 s2_dilate。扫读按新契约保留 CT 异常及 MRV/CTV 诊断性事实。');
  }
  if(g.id==='C006'){
    multi('s1',1,3,['s1_drunk','s1_glucose']);multi('s3',1,2,['s3_discharge','s3_nurse_glucose','s3_observe']);multi('s4',1,3);
    set('s2_d50',['pt_awake','pt_privacy_request']);
    for(const id of ['s3_history','s3_infusion','s3_discharge'])req(id,F('pt_awake'));
    // Failure to give effective glucose can also follow a measured low glucose,
    // oral sugar or CT-first path; unconsciousness, not the initial label, gates rescue.
    for(const id of ['s3_nurse_glucose','s3_ct','s3_observe'])req(id,N(F('pt_awake')));
    op('s3_nurse_glucose').result='护士发现患者仍未清醒，立即复测指尖血糖。结果仍低，需要马上纠正并继续监护。';
    req('s5_tell_with_consent',F('consent_disclose'));
    outcome('o_worst',A(C('s3_observe'),N(F('pt_awake'))),400);outcome('o_rebound',C('s3_discharge'),300);
    outcome('o_late_nurse',cs('s1_drunk s3_nurse_glucose s2_d50'),100);outcome('o_good',cs('s1_glucose s2_d50 s3_infusion s4_observe'),0);
    report(0,C('s1_glucose'));g.reports[0].full=g.reports[0].skimmed='指尖血糖 1.9 mmol/L（01:42）。';
    const r=structuredClone(g.reports[0]);r.id=g.id+'_glucose_repeat';r.title='复测指尖血糖';r.full=r.skimmed='静脉葡萄糖处理后 15 分钟，指尖血糖 6.8 mmol/L，GCS 14 分。';r.when=C('s2_d50');g.reports.push(r);
    report(1,C('s4_labs'));report(2,cc('s2_ct_first s3_ct s4_head_ct'));
    g.normalizationNotes.push('s3 未清醒补救按患者状态开放，包括已测低血糖却仅喂糖水或先做 CT 的路径；护士复测可回到纠正步骤，继续不处理接原恶化结局。不能因未贴醉酒标签而失去抢救出口。');
  }
  if(g.id==='C007'){
    variant('usual','常规随访','coronary',4);variant('coronary_thrombosis','延误后冠状动脉血栓','coronary');
    multi('s3',1,3);op('s3_echo').modifiers=[{when:N(fc('criteria_5 day6_known')),minutes:240}];
    req('s5_inform',N(fc('treated_as_scarlet no_workup')));add('s5','s5_return_only','嘱三天后复诊','s6',{flags:['return_only']},2,1,0,fc('treated_as_scarlet no_workup')).result='你嘱三天后复诊。';
    op('s5_inform').retry={max:2,dcIncrease:2,exhaustedNext:'o_refuse'};
    const missed=O(C('s4_abx_home'),fc('treated_as_scarlet no_workup'));
    outcome('o_worst',A(missed,C('s6_scarlet_dx'),V('coronary_thrombosis')),400);
    outcome('o_refuse',F('refusal_persisted'),350);outcome('o_missed',missed,300);outcome('o_delay',O(C('s4_observe_3d'),minutes(1440)),100);
    outcome('o_good',fs('ivig_ordered consented'),0);
    report(0,C('s3_labs'));report(1,C('s3_echo'));report(2,C('s3_strep'));report(3,C('s3_ct_chest'));
    g.normalizationNotes.push('原 o_worst 的 20% 在进入病例时固定为病程易感变体，仅在实际漏诊且错误记录后消费，不掷骰决定诊断；其余 80% 使用原漏诊结局。');
  }
  if(g.id==='C008'){
    variant('onsite','本院有 PICU','facility',3);variant('no_picu','本院无 PICU','facility');multi('s1',1,3);req('s1_ask_bandage',C('s1_exam'));req('s5_picu',V('onsite'));req('s5_transfer',V('no_picu'));
    op('s3_persuade').failureNext='s3';set('s3_persuade',['persuasion_failed'],'failure');req('s3_sign',F('persuasion_failed'));req('s3_verbal',F('persuasion_failed'));multi('s3',1,3,['s3_persuade','s3_sign','s3_verbal','s3_discharge']);
    outcome('o_worst',cc('s3_discharge s5_home_tomorrow'),400);outcome('o_delay',A(cc('s1_febrile_sz s4_wait_csf s5_observe'),O(N(F('abx_started')),minutes(240))),300);
    outcome('o_partial',A(fs('refusal_signed abx_started'),N(F('lp_consented'))),100);outcome('o_good',A(fs('lp_consented abx_started'),cc('s5_picu s5_transfer'),N(C('s4_wait_csf'))),0);
    report(0,C('s2_labs'));report(1,fs('lp_consented abx_started'));report(2,C('s2_ct'));report(3,C('s2_labs'),'s6');
  }
  if(g.id==='C009'){
    variant('same_sex','同名同性患者','identity',3);variant('different_sex','同名异性患者','identity');variant('day_team','输血科双人值班','blood_bank',3);variant('night_single','输血科夜间单人值班','blood_bank');
    multi('s1',1,3,['s1_consent','s1_verbal']);multi('s4',1,2,['s4_nurse_alone','s4_bedno_only']);multi('s6',1,4,['s6_treat','s6_slow','s6_febrile']);
    const redraw:ClinicalNode={id:'s2r',title:'重新采样',text:'报告与患者自述血型不符。A 型血袋留在治疗车上，输注尚未开始。',kind:'single',min:1,max:1,exit:'s4',options:[],source:{...node('s4').source,section:'s2r 重新采样说明'}};
    g.nodes.splice(g.nodes.findIndex(n=>n.id==='s3'),0,redraw);
    add('s2r','s2r_redraw','床旁重新采样，退回原血袋','s4',{flags:['redraw','sample_ok','mitigated:s2_call_name','mitigated:s2_intern']},60,1,120).result='两人重新核对腕带与住院号采血。输血科收到 O 型标本，原 A 型血袋退回，重新配血相合。';
    // Historical wbit remains as evidence. Active mismatch is scoped by !redraw.
    const mismatch=A(F('wbit'),N(F('redraw')));
    set('s4_ask_history',['self_type_O']);set('s4_two_person',['self_type_O']);
    op('s4_two_person').effects.flags=['check_ok'];op('s5_observe').effects.flags=['observed'];op('s5_leave').effects.flags=['not_observed'];
    op('s4_two_person').transitions=[{when:mismatch,next:'s2r'}];set('s4_two_person',['mismatch_found'],'always',mismatch);
    add('s4','s4_redraw','暂停输注，核查疑问并重新采样','s2r',{},2,1,0,A(mismatch,fc('type_doubt self_type_O'))).result='你暂停输注，核查疑问并重新采样。';
    node('s4').exitOn?.push('s4_two_person','s4_redraw');
    for(const id of ['s5_observe','s5_leave','s5_speed_up'])op(id).transitions=[{when:mismatch,next:'s6'},{when:N(mismatch),next:'s7'}];
    set('s5_observe',['reaction_seen','transfusion_started'],'always',mismatch);set('s5_leave',['reaction_late','transfusion_started'],'always',mismatch);
    set('s3_pickup',['type_doubt'],'success',mismatch);op('s3_pickup').modifiers=[{when:V('night_single'),dc:2}];
    for(const id of ['s2_call_name','s2_intern']){effect(id,{flags:['sample_ok'],clear:['wbit']},'always',V('different_sex'));}
    outcome('o_worst',F('continued_transfusion'),400);outcome('o_reaction',A(mismatch,cs('s6_stop s6_treat')),300);
    outcome('o_caught',F('redraw'),100);outcome('o_good',A(F('sample_ok'),cs('s4_two_person s5_observe'),N(F('redraw'))),0);
    report(0,{always:true});report(1,A(F('sample_ok'),fc('blood_received type_known')));report(2,A(mismatch,fc('blood_received type_known')));report(3,C('s6_verify'));report(4,C('s6_treat'));
    g.normalizationNotes.push('s2r 原说明要求清除 wbit；依据后续分支契约改为保留历史 wbit、添加 redraw 和补救标记，活动错误条件为 wbit && !redraw。原 s4_slow_start 无核对即可输血的分支仍允许，不能获得规范核对结局。');
  }
  if(g.id==='C010'){
    const arrest=O(cc('s3_continue s4_potassium'),A(N(C('s2_monitor')),N(C('s4_protocol'))));
    const delay=cc('s1_call_back s1_hemolysis s2_wait s5_observe s6_refuse');
    const good=A(cs('s1_readback s2_monitor s2_ask s3_repeat s3_stop_k s4_protocol s4_calcium s5_nephro s6_note'),noCausal);
    outcome('o_arrest',arrest);outcome('o_delay',A(N(arrest),delay));outcome('o_stable_delay',A(N(arrest),N(delay),N(good),C('s4_protocol')));outcome('o_good',good);
    op('s5_icu').effects.flags=[];set('s5_icu',['icu_called'],'success');set('s5_icu',['icu_waitlist'],'failure');
    report(0,{always:true});report(1,C('s3_repeat'));report(2,C('s2_monitor'));report(3,A(cs('s4_protocol s4_calcium'),N(C('s4_potassium'))),'s6');
  }
  if(g.id==='C011'){
    variant('ordinary','同行者等候','companion',3);variant('hurried','同行者催促','companion');variant('stocked','抢救车备药完整','stock',3);variant('short_stock','急救车缺药','stock');
    for(const id of ['s2_cef_direct','s2_quick_test','s3_doubt','s3_sub'])op(id).effects.flags=[id==='s2_cef_direct'||id==='s3_sub'?'drug_given=cef':'drug_given=pen'];
    op('s2_pen_test').minutes=23;op('s2_double').minutes=25;set('s3_cef_test',['safe_drug']);req('s5_pump',F('epi_given'));
    const cardiac=add('s5','s5_arrhythmia','先处理室性心律失常并持续监护','s5',{flags:['arrhythmia_treated'],stamina:-4},15,0,0,F('epi_iv'));
    cardiac.result='宽 QRS 心动过速得到处理。复查心律后，抢救团队继续复评血压与气道。';
    const airway=add('s5','s5_airway','呼叫气道团队，评估并准备插管','s5',{flags:['airway_supported']},12,1,0,F('epi_delayed'));
    airway.result='气道团队到床旁接手气道评估。血氧读数降至 84%，复苏继续。';
    multi('s5',1,3,['s5_observe30']);multi('s6',1,3);node('s7').kind='auto';node('s7').exit='outcomes';
    outcome('o_hypoxic',O(A(F('epi_delayed'),N(F('airway_supported'))),A(F('epi_iv'),N(F('arrhythmia_treated')))),400);
    outcome('o_biphasic',F('early_discharge'),300);outcome('o_rescued',A({entered:'s4'},F('epi_given'),fc('resuscitated icu'),N(F('early_discharge'))),100);
    outcome('o_good',A(F('safe_drug'),N({entered:'s4'})),0);
    report(0,cc('s2_pen_test s2_double'));report(1,C('s1_exam_labs'));report(2,{entered:'s4'});report(3,C('s4_epi_iv'));
    add('s1','s1_exam_labs','加做血常规与 CRP','s2',{},15,1,22).result='你加做血常规与 CRP。';multi('s1',1,2);
    g.normalizationNotes.push('s5 原文将气道延误随机归因于察觉失败；按“临床步骤不掷骰”契约补为明确气道评估和心律失常处置选项，已经完成的气道处置不被骰点撤销。s6 原表单选导致记录/报告/过敏标识互斥，补为至多三项。');
  }
  if(g.id==='C012'){
    multi('s2',1,2);multi('s6',1,2);node('s7').kind='auto';node('s7').exit='outcomes';
    op('s4_argue').failureNext='s4';set('s4_argue',['consult_refused'],'failure');multi('s4',1,2,['s4_escalate','s4_second','s4_accept']);
    op('s4_escalate').modifiers=[{when:F('ct_done'),dc:-20}];
    op('s5_refuse_signed').successNext='s6';op('s5_refuse_signed').failureNext='o_refused';op('s5_refuse_signed').effects.flags=[];set('s5_refuse_signed',['consent'],'success');set('s5_refuse_signed',['refused_signed'],'failure');
    set('s5_inform',['consent'],'failure');
    outcome('o_death',fc('no_reconsult refused_oral'),400);outcome('o_refused',F('refused_signed'),310);outcome('o_late',fs('surgery_agreed delayed_4h'),300);
    outcome('o_good',A(fs('surgery_agreed consent prepped'),N(F('delayed_4h'))),0);
    report(0,C('s2_labs'));report(1,C('s2_ct'));report(2,C('s2_xray'));
    g.normalizationNotes.push('s2 支持 CT 与化验同做，s6 支持术前准备与文书同做。外科说服失败进入可升级会诊分支，不能因一次说服失败在未达成手术时展示术中结局。');
  }
  if(g.id==='C013'){
    // Bedside measurements are immediate observations, not a report the player
    // must separately open. Preserve the measured values in both places.
    op('s1_bp_both').result='右上肢血压 186/108 mmHg，左上肢 152/96 mmHg，收缩压相差 34 mmHg。左侧桡动脉搏动较右侧减弱。';
    op('s1_insurance').result='医保购药记录显示：最近一次购买降压药是三个月前，当时的药量只够服用两个月。';
    op('s1_exam').check!.failureText='这次查体没有确认双侧脉搏是否对称，心脏听诊也未能确认杂音。';
    op('s3_wait_trop').modifiers=[{when:C('s2_ecg_ddimer'),label:'等待复查肌钙蛋白再决定'}];
    node('s3').text='背痛仍在持续。请核对已经取得的检查资料，再决定下一步处置。';
    node('s3').textVariants=[{when:F('cta_ordered'),text:'主动脉 CTA 影像回报已经送到。请核对报告后，再决定是否追加处置或进入心率、血压控制。'},{when:F('ecg_done'),text:'心电图纸上 V4—V6 的 ST 段压低了 1 mm，护士问要不要走胸痛流程。'}];
    multi('s3',1,2);multi('s4',1,2);multi('s5',1,2,['s5_self','s5_admit']);node('s7').kind='auto';node('s7').exit='outcomes';
    node('s4').text='放射科来电，要求核对患者身份和检查申请。';
    node('s4').textVariants=[{when:F('cta_ordered'),text:'CTA 报告先由电话打回来，放射科医生把「B 型」说了两遍。'}];
    outcome('o_home',F('sent_home'),430);outcome('o_antiplatelet',fc('antiplatelet anticoag'),420);outcome('o_transit',F('self_transport'),410);
    outcome('o_partial',A(fs('cta_ordered transferred'),fc('delayed_1h partial_control')),100);
    outcome('o_good',A(fs('cta_ordered controlled transferred'),N(fc('antiplatelet anticoag delayed_1h partial_control'))),0);
    report(0,cc('s2_ecg_ddimer s2_ecg_only'));report(1,C('s2_ecg_ddimer'));report(2,C('s1_bp_both'));report(3,C('s3_cta'));
    g.normalizationNotes.push('s3 允许在等待后补做 CTA，s4 允许控制心率血压及镇痛，s5 允许监护转运和告知。三个严重结局以实际最早退出/抗栓暴露优先，不让后续自驾抹除既有抗栓因果。');
  }
  if(g.id==='C014'){
    node('s7').kind='auto';node('s7').exit='outcomes';multi('s5',1,2);multi('s6',1,2);
    node('s5').exit='s7';
    op('s4_explain').failureNext='s4';set('s4_explain',['family_refused'],'failure');op('s4_head').effects.flags=[];set('s4_head',['family_agree'],'success');op('s4_head').failureNext='s4';
    node('s3').text='母亲看了一眼血氧探头，又看了一眼收好的行李。';node('s3').textVariants=[{when:C('s2_sleep_spo2'),text:'睡眠中的血氧数字在 89 和 91 之间换。母亲盯着屏幕，没说话。'}];
    outcome('o_readmit_death',A(F('discharged_unmet'),N(F('ama_signed'))),400);outcome('o_ama',fs('ama_signed plan_given'),100);
    outcome('o_dip_only',A(fs('recommend_stay family_agree'),C('s6_no_record')),50);outcome('o_good',A(fs('family_agree recommend_stay'),N(C('s6_no_record'))),0);
    g.outcomes.find(o=>o.id==='o_dip_only')!.effects={cash:-1600};
    effect('s6_dip_note',{flags:['dip_appeal_approved']},'success');op('s6_dip_note').effects.flags=[];
    report(0,C('s1_trend'));report(1,C('s2_labs'));report(2,C('s2_xray'));report(3,C('s2_sleep_spo2'));
  }
  if(g.id==='C015'){
    multi('s1',1,3);node('s6').kind='auto';node('s6').exit='outcomes';
    op('s2_mero_approved').effects.flags=[];set('s2_mero_approved',['carbapenem','approved'],'success');op('s2_mero_approved').retry={max:1,dcIncrease:0};op('s2_mero_approved').failureNext='s2';
    op('s2_argue').failureNext='s2';effect('s2_argue',{relations:{chief:-1}},'failure');op('s2_argue').retry={max:1,dcIncrease:0};
    req('s3_deescalate',F('culture_sent'));req('s3_keep_mero',F('carbapenem'));req('s5_backfill',F('carbapenem'));
    node('s3').text='第 3 天，体温单上的曲线从 38.4 降到 37.2。';
    node('s3').textVariants=[{when:F('culture_sent'),text:'第 3 天，体温单上的曲线从 38.4 降到 37.2，痰培养的初步结果贴在病历里。'}];
    outcome('o_cdiff',fs('carbapenem no_deescalation'),200);outcome('o_carbapenem_fine',fs('carbapenem no_approval'),100);outcome('o_approved_ok',fs('carbapenem approved'),50);
    outcome('o_good',fs('regimen_standard sequential recorded'),0);
    g.outcomes.find(o=>o.id==='o_cdiff')!.effects={cash:-7800};g.outcomes.find(o=>o.id==='o_carbapenem_fine')!.effects={cash:-1700};g.outcomes.find(o=>o.id==='o_approved_ok')!.effects={bill:3400};
    report(0,F('culture_sent'),'s3');report(1,{always:true});report(2,{always:true});report(3,{entered:'s3'});
    g.normalizationNotes.push('无培养时不显示培养回报、不允许基于本局不存在的药敏降阶梯；第 3 天病情改善是共同客观回报。无指征用药行政结局无医学严重伤害。');
  }
  if(g.id==='C016'){
    multi('s2',1,3);multi('s3',1,2);multi('s4',1,2);node('s6').kind='auto';node('s6').exit='outcomes';
    req('s2_nac_now',N(C('s2_wait_level')));req('s2_wait_level',N(C('s2_nac_now')));
    req('s4_family',N(C('s4_no_family')));req('s4_no_family',N(C('s4_family')));req('s4_observe',N(C('s4_discharge_now')));req('s4_discharge_now',N(C('s4_observe')));
    const liver=O(F('early_discharge'),fs('treated_as_gastro no_lft'));
    outcome('o_liver_failure',liver,410);outcome('o_unsupervised',A(fc('no_psych no_supervision'),N(liver)),400);outcome('o_late_nac',A(F('nac_delayed'),N(F('early_discharge'))),100);
    outcome('o_good',fs('nac_on_time psych_consult family_informed observed_24h recorded'),0);
    g.outcomes.find(o=>o.id==='o_late_nac')!.effects={cash:-7800};
    report(0,C('s2_labs'));report(1,C('s2_labs'));report(2,C('s2_tox'));report(3,liver);
    // The source's overdose quantity and treatment-line arithmetic are not player-facing methods.
    const redact=(s:string)=>s.replace(/30\s*片(?:[×x]\s*0\.5\s*g)?|3\s*板[×x]\s*10\s*片|空药板\s*3\s*板|15\s*g|208\s*mg\/kg|≥150\s*mg\/kg|≥7\.5\s*g/g,'明显过量').replace(/148\s*μg\/mL/g,'超过治疗线').replace(/服药后\s*6\s*小时治疗线为\s*106\s*μg\/mL/g,'浓度与时间的联合评估提示需要治疗');
    g.presentation.history=g.presentation.history.map(s=>redact(s).replace(/对乙酰氨基酚片，0\.5 g／片（患者自述）/,'患者自述为常见退热止痛药'));
    for(const n of g.nodes){n.text=redact(n.text);for(const o of n.options){o.label=redact(o.label);o.result=redact(o.result);if(o.successText)o.successText=redact(o.successText);if(o.check)o.check.failureText=redact(o.check.failureText);}}
    for(const r of g.reports){r.full=redact(r.full);r.skimmed=redact(r.skimmed);}
    const base=g.reports[1];for(const [flag,text] of [['nac_on_time','ALT 96 U/L，AST 72 U/L，INR 1.1，总胆红素 14 μmol/L，肌酐 76 μmol/L。'],['nac_delayed','ALT 1,860 U/L，AST 2,240 U/L，INR 1.6，总胆红素 28 μmol/L，肌酐 92 μmol/L。']])g.reports.push({...structuredClone(base),id:`C016_recheck_${flag}`,title:'24 小时肝功能与凝血复查',full:text,skimmed:text,when:A(F(flag),C('s4_observe'))});
    g.normalizationNotes.push('s2/s3/s4 允许互补处置：化验与解毒、评估与会诊、看护与观察可共同完成。原完整源文保留在 provenance；玩家文本不显示可用于自伤的服药数量、阈值计算，保留过量证据、治疗必要性及检验肝损伤数字。');
  }
  if(g.id==='C017'){
    variant('leak','吻合口漏','diagnosis',3);variant('lung_infection','肺部感染','diagnosis');
    const ask=add('s2','s2_ask','追问夜间腹痛变化与排气情况','s2',{},5,1,0);ask.check={skill:'observe',dc:12,purpose:'问诊：夜间腹痛与排气',failure:{},failureText:'他仍说“能忍”，没有讲清夜里变化。'};ask.modifiers=[{when:V('family_present'),dc:2}];ask.result='他补充了夜间的症状经过。';ask.resultVariants=[{when:V('leak'),text:'“昨晚开始一直疼，后来也没排气。我以为手术后都这样。”'},{when:V('lung_infection'),text:'他确认夜间咳嗽与痰量增加，腹痛没有继续加重，仍有少量排气。'}];set('s2_ask',['leak_suspected'],'success',V('leak'));set('s2_ask',['lung_history_known'],'success',V('lung_infection'));multi('s2',1,2,['s2_exam','s2_drain','s2_lung_only','s2_none']);
    op('s4_ct').effects.flags=['ct_done'];set('s4_ct',['leak_confirmed'],'always',V('leak'));set('s4_ct',['leak_excluded'],'always',V('lung_infection'));
    set('s2_exam',['exam_done']);
    for(const id of ['s1_nursing','s2_drain']){op(id).effects.flags=[];set(id,['leak_suspected'],'always',V('leak'));set(id,['drain_clear'],'always',V('lung_infection'));}
    op('s2_exam').rules=op('s2_exam').rules.filter(r=>!r.effects.flags?.includes('leak_suspected'));set('s2_exam',['leak_suspected'],'success',V('leak'));set('s2_exam',['lung_signs'],'success',V('lung_infection'));
    node('s2').textVariants=[{when:V('lung_infection'),text:'患者咳嗽，左下肺可闻及细湿啰音。引流袋内液体淡红，未见进行性浑浊。'}];
    op('s2_exam').result='查体完成，切口无红肿，外周灌注尚可。';op('s2_exam').successText='查体所见记入床旁记录。';
    const worst=O(A(V('leak'),O(cc('s4_observe s6_no_escalate'),A(C('s7_pneumonia_note'),N(C('s6_source'))))),A(V('lung_infection'),C('s6_no_escalate')));
    const delay=A(V('leak'),N(worst),O(cc('s5_pneumonia s5_drain_wait'),A(N(F('leak_suspected')),N(C('s4_ct')))));
    outcome('o_worst',worst);outcome('o_delay',delay);outcome('o_good',A(V('leak'),cs('s4_ct s5_npo s5_abx s6_source'),F('leak_suspected'),noCausal));
    outcome('o_lung_path',A(V('lung_infection'),cs('s2_exam s3_sputum s4_cxr s5_abx s6_resp'),noCausal));
    g.outcomes.find(o=>o.id==='o_worst')!.textVariants=[{when:V('leak'),text:'夜间病情恶化，手术探查见吻合口裂开及弥漫性腹膜炎，术后发生感染性休克。原始病程和交班记录进入鉴定材料。'},{when:V('lung_infection'),text:'夜间呼吸状态恶化，患者转入监护病房。腹盆腔复查未发现吻合口漏。交班材料列出了呼吸支持与监护升级的时间。'}];
    report(0,C('s3_sepsis'));report(1,A(C('s3_sputum'),V('leak')));report(2,A(C('s4_ct'),V('leak')));report(3,A(C('s4_cxr'),V('leak')));report(4,A(C('s4_ct'),V('lung_infection')));
    const lungReports=[{from:1,id:'C017_lung_sputum',when:A(C('s3_sputum'),V('lung_infection')),title:'痰培养、血气和床旁胸片',text:'血气 pH 7.46，PaO₂ 62 mmHg（室内空气），PaCO₂ 33 mmHg。痰标本可用于培养，结果待回。胸片左下肺见片状实变，伴支气管充气征。腹部无肌紧张，引流液淡红。',skim:'pH 7.46，PaO₂ 62 mmHg（室内空气），PaCO₂ 33 mmHg……痰培养待回……左下肺片状实变，伴支气管充气征。'},
      {from:3,id:'C017_lung_cxr',when:A(C('s4_cxr'),V('lung_infection')),title:'床旁胸片与外科会诊',text:'左下肺新发片状实变，伴支气管充气征。外科复核腹部柔软，无肌紧张，引流液无进行性浑浊；未发现支持吻合口漏的临床证据。后续按病情复评腹盆腔。',skim:'左下肺新发片状实变，伴支气管充气征……未发现支持吻合口漏的临床证据。'}];
    for(const r of lungReports)g.reports.push({...structuredClone(g.reports[r.from]),id:r.id,title:r.title,when:r.when,full:r.text,skimmed:r.skim});
    g.presentation.appearance='患者半坐在床上，鼻导管挂在耳后，床旁痰杯有少量黄白色痰。腹部切口敷料干燥，左下腹引流袋挂在床边。';
    g.normalizationNotes.push('肺感染诊断变体在进入时固定。原文仅替换 CT 而胸片/痰回报仍声称无肺炎，补齐变体胸片、痰标本、腹部和引流回报；不让肺感染变体继承吻合口漏阳性事实。');
  }
  if(g.id==='C018'){
    const harm=O(A(C('s3_no_check'),cc('s4_import s4_substitute')),cs('s4_import s7_omit'));
    const admin=cc('s3_import_first s4_import s5_push s6_delete s6_forward');
    const required=fs('steroid_known exam_done labs_done renal_consult informed consent_signed audit_recorded note_complete');
    outcome('o_harm',harm);outcome('o_admin',A(N(harm),admin));outcome('o_uncertain',A(N(harm),N(admin),N(required)));outcome('o_good',A(required,cc('s4_standard s4_wait'),noCausal));
    // The check's D +20 / C +10 annotations repeat the hazard column, never charge twice.
    op('s2_bag').effects.flags=[];op('s2_bag').rules=[];set('s2_bag',['drug_bag_known'],'success');set('s2_bag',['bag_unreadable'],'failure');
    op('s5_itemized').effects.flags=[];op('s5_itemized').rules=[];set('s5_itemized',['informed'],'success');set('s5_itemized',['informed_failed'],'failure');
    op('s5_signature').effects.flags=[];op('s5_signature').rules=[];set('s5_signature',['consent_signed'],'success');set('s5_signature',['consent_attempted'],'failure');effect('s5_signature',{san:-3},'success');
    op('s7_complete').effects.flags=[];op('s7_complete').rules=[];set('s7_complete',['note_complete'],'success');set('s7_complete',['note_incomplete'],'failure');
    report(0,C('s3_labs'));report(1,C('s5_defer'));
    g.normalizationNotes.push('临床用药证据与回扣线索分别存储。留存截图不产生收受回扣事实；非临床材料传播或删除只走行政结局，临床严重结局仍要求原文所列错误检查/方案因果前提。');
  }
  if(g.id==='C019'){
    // Both original successful outcomes require these two distinct actions.
    multi('s3',1,2);multi('s2',2,4);multi('s4',2,2);multi('s6',2,3);node('s7').kind='auto';node('s7').exit='outcomes';
    const history=add('s2','s2_history','分别核对暴露时长、昏厥、孕周与基础病','s2',{},6,1,0);history.check={skill:'observe',dc:12,purpose:'问诊：三人暴露史与既往病史',failure:{},failureText:'三人的说法没有完全对上，仍需按人继续评估。'};history.result='三人分别补充了暴露经过，女儿有哮喘，吸入药留在车上。';set('s2_history',['child_asthma_known'],'success');set('s2_history',['maternal_coma_history'],'success',V('brief_coma'));set('s2_history',['scene_unconfirmed_known'],'success',V('scene_unconfirmed'));
    node('s6').exit='s7';node('s2').exitEffects=[{effects:{flags:['triage_complete']}},{when:N(fs('father_triaged mother_triaged child_triaged')),effects:{hazards:[{type:'R',weight:10,reason:'三人独立分级未全部完成。',norm:'多人暴露个体分级',causal:true}]}}];
    node('s4').exitEffects=[{effects:{flags:['disposition_ready']}},{when:N(F('obstetric_review')),effects:{hazards:[{type:'C',weight:15,reason:'孕妇暴露后产科评估及告知未完整。',norm:'特殊患者个体评估',causal:false}]}},{when:N(F('pediatric_review')),effects:{hazards:[{type:'R',weight:15,reason:'儿童低血糖和呼吸风险未完成专科复评。',norm:'儿童独立分级',causal:true}]}}];
    const unsafe=O(F('unsafe_reentry'),A(fc('grouped_record group_note_only'),N(F('note_complete'))),A(F('unnecessary_decon'),N(F('oxygen_started'))));
    const delayed=O(fc('premature_discharge delayed_oxygen pulseox_reassured one_patient_only hbo_threshold_only no_followup'),N(fs('father_triaged mother_triaged child_triaged')));
    const common=fs('scene_safe father_triaged mother_triaged child_triaged triage_complete oxygen_started coox_done note_complete');
    const hbo=A(common,fs('hbo_consult hbo_arranged handoff_done'),N(unsafe),N(delayed));
    outcome('o_unsafe',unsafe);outcome('o_delayed',A(delayed,N(unsafe)));outcome('o_hbo',hbo);
    outcome('o_good',A(common,fs('disposition_ready admitted_by_risk followup_given'),{count:{flags:['cardiac_risk','obstetric_review','pediatric_review','hbo_consult'],min:2}},N(unsafe),N(delayed),N(hbo)));
    g.outcomes.find(o=>o.id==='o_unsafe')!.textVariants=[
      {when:F('unsafe_reentry'),text:'邻居返回屋内后出现头晕，救援人员扩大警戒并把他送到急诊。调查人员调取现场联络和转运记录，核对谁在何时允许他返回。'},
      {when:fc('grouped_record group_note_only'),text:'三人的记录未能独立归档，女儿的低血糖处理出现在父亲名下。接收科室停止按合并记录执行，重新核对三条腕带和用药时间。'},
      {when:F('unnecessary_decon'),text:'三人等待冲洗结束才接受进一步处置，母亲的意识状态和女儿的呼吸再次恶化。接收团队重新分级，记录了氧疗延误的时段。'}];
    g.outcomes.find(o=>o.id==='o_delayed')!.text='三天后父亲因注意力下降再次就诊，女儿反复头痛，母亲在产科复查时仍诉头晕。医生分别核对首次分级、氧疗和随访记录。急诊打印机吐出三张不同姓名的复诊单。';
    report(0,C('s3_coox'));report(1,C('s3_coox'));report(2,{always:true});
    // Replace combined post-treatment report with independently gated patient reports.
    const screening=g.reports.pop()!;
    const screens=[['child_screen','女儿：血糖初筛','女儿床旁血糖 2.9 mmol/L。',C('s2_child')],['child_repeat','女儿：低血糖复查','女儿低血糖纠正后复测 4.8 mmol/L，进入儿科监护。',C('s4_ped')],['maternal_screen','母亲：胎心初筛','母亲胎心监护出现短暂变异减少，产科已收到联络。',C('s2_mother')],['maternal_review','母亲：产科复评','产科复评后胎心变异恢复，继续观察母体意识与胎儿情况。',C('s4_obst')],['paternal_review','父亲：心肌损伤评估','父亲 ST-T 改变，肌钙蛋白 I 轻度升高，乳酸 4.8 mmol/L。重症团队结合神经与心脏状态安排监护。',C('s4_ob')]] as const;
    const screenSkim:Record<string,string>={paternal_review:'父亲 ST-T 改变，肌钙蛋白 I 轻度升高，乳酸 4.8 mmol/L。'};
    for(const [id,title,text,when] of screens)g.reports.push({...structuredClone(screening),id:`C019_${id}`,title,full:text,skimmed:screenSkim[id as string]??text,when});
    g.normalizationNotes.push('s3 原 single 与两个良好结局同时要求氧疗/CO-oximetry 矛盾，改为最多两项且各项独立付费；系统“继续”行保留源 ID，不计实质选择、不收费。三名患者筛查和处理后回报按各自来源分开，未治疗不显示“纠正后正常”。');
  }
  if(g.id==='C020'){
    const handover=add('s1','s1_handover','核对护理记录、口头交班与监护时间线','s1',{flags:['oral_report_known']},4,1,0);handover.result='护士回忆 22:20 曾口头报告“胸闷、出冷汗”，交班单未写明。是否已被听见和处置，需要保留原始记录后继续核对。';node('s1').max=3;
    const obstruction=fc('record_altered evidence_deleted backdated coercive_notice communication_refused blame_written');
    const loss=fc('monitor_only doctor_absent scene_altered report_omitted discussion_skipped verbal_only autopsy_delayed cause_asserted');
    const chain=fs('resuscitation_started death_confirmed evidence_preserved timeline_checked family_informed rights_given autopsy_discussed body_transferred report_started discussion_done quality_reviewed records_complete handoff_done');
    outcome('o_obstruction',obstruction);outcome('o_lost_chain',A(loss,N(obstruction)));
    outcome('o_respectful_dispute',A(fs('evidence_preserved family_informed autopsy_discussed records_complete'),N(fs('report_started discussion_done quality_reviewed handoff_done')),N(obstruction)),100);
    outcome('o_chain',A(chain,N(obstruction),N(loss)),0);
    op('s4_autopsy').effects.flags=['autopsy_discussed'];op('s4_autopsy').rules=[];set('s4_autopsy',['refusal_recorded'],'failure');
    // Discussing autopsy or expressing interest is not signed consent. Leave
    // the original refusal route intact and expose a separate real action.
    multi('s4',1,3);
    const sign=add('s4','s4_consent_sign','核实家属意愿和身份，接收签字同意书','s4',{flags:['autopsy_consented']},8,1,0,A(F('autopsy_discussed'),N(fc('refusal_recorded autopsy_consented'))));
    sign.result='妻子又问了一遍观察和领取报告的安排，随后在同意书上签了字。你核对身份、签字时间和授权范围，把一份交给她。尸检尚未完成，不能据此确定死因。';
    sign.mechanics={operation:'consent',actor:'family',quality:'correct'};
    op('s4_autopsy').successText='你说明尸检的目的、签字要求和观察安排。妻子表示听明白了，但同意书还没有签；需要另行核实并接收签字。';
    report(0,C('s2_timeline'));report(1,C('s2_scene'));report(2,C('s4_autopsy'));
    g.reports[2].full='死因尚待确认。感染进展、心源性事件、药物与设备因素均未在现阶段排除。家属可提出尸检意见，后续结论须结合病理和临床时间线。';g.reports[2].skimmed='死因尚待确认……感染进展、心源性事件、药物与设备因素均未在现阶段排除。';
    g.normalizationNotes.push('结局表表头多一列严重度，行内实际五列；按 ID/触发/优先级/种子/文本解析。死亡已先于记录选择发生，行政阻碍不再追加患者死亡因果。尸检讨论、接收签字和拒签分开记录，接收同意书不等于已经完成尸检或取得病理报告。');
  }

  // Keep conditional dialogue separate: one patient's unseen report cannot enter another route.
  if(g.id==='C002'){
    op('s1_history').resultVariants=[{when:F('wife_out'),text:'「一天半斤，二十年了。今天中午也喝了二两，开车前压一压咳嗽。」'},{when:N(F('wife_out')),text:'他看了一眼身后。「……喝一点。」妻子说：「他一天半斤。」'}];
    const h=op('s5_none').effects.hazards??[];op('s5_none').effects.hazards=h.map(x=>({...x,causal:false}));
    op('s5_none').rules.push({when:fc('rx_cefoperazone rx_ceftriaxone'),effects:{flags:['causal:no_warning']}});
    g.outcomes.find(o=>o.id==='o_ok_warned')!.text='三天输液做完，他没有喝酒。第四天晚上他喝了一杯啤酒，脸红心跳，一个小时后缓过来。病历保留了本次实际问诊与告知内容，用药选择和给药途径仍进入处方复核。';
  }
  if(g.id==='C003')g.outcomes.find(o=>o.id==='o_ntg')!.textVariants=[{when:A(F('lasix_given'),N(F('ntg_given'))),text:'利尿后血压降至 70/44 mmHg。复苏团队重新评估右心室负荷，补液并维持灌注，再灌注治疗继续。心内科早交班把这份心电图放在投影上，讲了右室梗死。'}];
  if(g.id==='C004')g.outcomes.find(o=>o.id==='o_worst')!.text='次日凌晨她出现头痛与呕吐，随后意识不清。头颅 CT 示右侧基底节区出血约 40 mL，破入脑室。INR 9.4。第七天死亡。医务科调出了接手前后的长期医嘱与凝血监测记录。';
  if(g.id==='C005'){
    op('s5_no_return').effects.hazards=(op('s5_no_return').effects.hazards??[]).map(h=>({...h,causal:false}));
    g.outcomes.find(o=>o.id==='o_delay')!.text='第三天下午她在办公室癫痫发作，送急诊。MRI 示左顶叶出血性梗死范围扩大至 4 cm。抗凝后病情稳定，出院时右手无力，写字困难。母亲在急诊翻出了门诊病历。';
  }
  if(g.id==='C006')g.outcomes.find(o=>o.id==='o_good')!.text='凌晨四点血糖 5.2 mmol/L，六点 4.6 mmol/L，吃了一碗粥后 7.1 mmol/L。八点他自己签了留观出院。同事在门口等他。给药、复测、饮食评估和告知内容留在本次病历中。';
  if(g.id==='C009'){
    const mismatch=A(F('wbit'),N(F('redraw')));
    op('s3_phone_type').resultVariants=[{when:mismatch,text:'输血科：「31 床陈秀英，A 型 RhD 阳性，两个单位 A 型悬红，配血相合。本院没有既往血型记录。」'},{when:N(mismatch),text:'输血科：「31 床陈秀英，O 型 RhD 阳性，两个单位 O 型悬红，配血相合。你们来取吧。」'}];
    op('s4_two_person').resultVariants=[{when:mismatch,text:'「我是 O 型的。三年前做手术输过血，医生跟我说的。」护士看了一眼 A 型配血报告，又看了一眼你。'},{when:N(mismatch),text:'「陈秀英，七十二。三年前输过一次，没什么反应。」两人核对腕带、住院号、O 型配血报告与血袋号。'}];
    op('s7_inform').resultVariants=[{when:F('wbit'),text:'「配血的标本采错了人。血袋和标本正在复核，结果出来我给你看。」'},{when:N(F('wbit')),text:'你说明核对结果、输血观察和后续复查安排。家属把缴费单收进袋子。'}];
    g.outcomes.find(o=>o.id==='o_reaction')!.text='输注在反应发现后停止。当晚少尿，肌酐升至 312 μmol/L，转 ICU，血液透析 3 次。第九天肌酐回到 96 μmol/L，转回病房。医务科调取输血记录单，逐项核对采样、核对人与输注时间。';
  }
  if(g.id==='C011')g.outcomes.find(o=>o.id==='o_good')!.text='她拿着替代用药处方走出去，走到门口回头问了一句能不能吃两片。你让她按处方服用。病历保留了本次获得的过敏资料，她的高铁是明天七点。';
  if(g.id==='C013')g.outcomes.find(o=>o.id==='o_antiplatelet')!.text='抗栓用药后两小时，患者突然意识丧失。假腔破入左侧胸腔，抢救 50 分钟无效。鉴定材料逐项核对用药时是否已排除夹层，以及当时已经获得的症状和检查结果。';
  if(g.id==='C015')g.outcomes.find(o=>o.id==='o_good')!.text='第七天出院，口服序贯治疗继续。总费用 ¥5,100，病组结余 ¥1,100。主任查房时没有再提美罗培南。用药理由、评分和调整依据留在病程记录里。';
  if(g.id==='C016')g.outcomes.find(o=>o.id==='o_liver_failure')!.text='第三天下午家属把他送到急诊，皮肤黄，INR 3.2，肝性脑病 II 级。转 ICU，评估肝移植。接诊团队调取首次留观的用药史、解毒与离院记录，重新核对病程。';

  // Source context variants are chosen once per group. They affect named costs, checks,
  // available actions or scoped facts; none can rewrite the underlying diagnosis.
  const context=(id:string,title:string,group:string,weight=1)=>{variant(`normal_${group}`,'常规安排',group,3);variant(id,title,group,weight);};
  const mod=(id:string,when:GraphCondition,values:NonNullable<GraphOption['modifiers']>[number])=>{op(id).modifiers??=[];op(id).modifiers!.push({...values,when});};
  const allChecks=(variantId:string,delta:number,skills:string[])=>{for(const n of g.nodes)for(const o of n.options)if(o.check&&skills.includes(o.check.skill))mod(o.id,V(variantId),{when:V(variantId),dc:delta});};
  if(g.id==='C002')mod('s4_amox',V('selfpay'),{when:V('selfpay'),label:'核对过敏史后开阿莫西林克拉维酸口服'});
  if(g.id==='C003'){context('recording','家属录音','family');set('s4_inform',['family_recording'],'always',V('recording'));set('s4_inform_lysis',['family_recording'],'always',V('recording'));}
  if(g.id==='C004'){
    context('recording','家属录音','family');context('chief_team','原主管来自主任组','handover');
    set('s1_call_prev',['chief_team_handover'],'always',V('chief_team'));op('s1_call_prev').resultVariants=[{when:V('chief_team'),text:'原主管回复：「主任查过房，抗感染就行，INR 入院查过。」交班记录仍需由接手医师逐项核对。'}];
    g.normalizationNotes.push('原主管主任组变体写“说服难度 +2”，但原六节点没有说服检定；保留变体对象和原主管回复，不把安抚或临床处置错当说服检定。');
  }
  if(g.id==='C005'){
    const scan:ClinicalNode={id:'s3mrv',title:'磁共振检查',text:'她听完费用与替代方案，收起手机上的日程表。检查单递到了预约窗口。',kind:'single',min:1,max:1,exit:'s4',options:[],source:{...node('s3').source,section:'自费 MRI 费用同意后实施检查'}};
    g.nodes.splice(g.nodes.findIndex(n=>n.id==='s4'),0,scan);
    const completed=add('s3mrv','s3_mrv_scan','完成头颅 MRI 加 MRV','s4',{flags:['mrv_done','cvst_confirmed'],stamina:-1},120,0,960);completed.automatic=true;completed.result='MRI 加 MRV 已完成，报告见静脉窦血流信号缺失，并伴少量出血性静脉梗死。';completed.modifiers=[{when:fc('red_flags papilledema ocp_known'),minutes:60}];
    const mrv=op('s3_mrv');const originalEffects=structuredClone(mrv.effects);mrv.effects={clear:['mrv_declined']};mrv.rules=[];effect('s3_mrv',originalEffects,'always',N(V('selfpay')));
    mrv.check={skill:'persuade',dc:12,purpose:'沟通自费影像费用',failure:{flags:['mrv_declined']},failureText:'「这个太贵了，有没有便宜一点的？」她暂未同意 MRI。可以继续讨论 CT 静脉成像。'};
    mrv.checkWhen=V('selfpay');mrv.failureNext='s3';mrv.transitions=[{when:A(V('selfpay'),N(F('mrv_declined'))),next:'s3mrv'}];
    mrv.resultVariants=[{when:V('selfpay'),text:'她同意了 MRI 加 MRV 的费用，检查尚未开始。'}];
    mod('s3_mrv',V('selfpay'),{when:V('selfpay'),minutes:3,cost:0,label:'说明 MRI 加 MRV 的必要性、费用与替代方案'});
    g.normalizationNotes.push('自费 s3_mrv 先做说服 DC12，失败回 s3 可选 CTV，不收未实施 MRI 的费用、不生成报告；成功后 s3_mrv_scan 实际执行，按红旗加急等待减半。沟通单独用3分钟，原 MRI 120分钟/960元保留在执行节点。s1 独立自动察觉 DC14 与其后问诊 DC10 分开结算，保留原行动确定的去向。');
  }
  if(g.id==='C006'){context('recording','同事拍摄','companion');set('s1_ask_friends',['companion_recording'],'always',V('recording'));}
  if(g.id==='C007'){context('recording','家属录音','family');context('selfpay','自费','payment');allChecks('selfpay',2,['comfort']);}
  if(g.id==='C008'){context('recording','家属录音','family');set('s3_sign',['refusal_recording'],'always',V('recording'));}
  if(g.id==='C010'){
    context('no_family','家属不在场','family');context('call_recorded','检验科电话录音','recording');context('no_dialysis','本院无透析床','facility');
    set('s1_readback',['critical_call_recording'],'always',V('call_recorded'));mod('s5_nephro',V('no_dialysis'),{when:V('no_dialysis'),minutes:25,label:'请肾内科评估，联系 ICU 与血液净化中心'});
    op('s5_nephro').resultVariants=[{when:V('no_dialysis'),text:'本院透析床暂不可用。肾内科与 ICU 联系血液净化中心，监护与降钾处理继续，转运记录写明当前血钾和尿量。'}];
    mod('s5_reassure',V('no_family'),{when:V('no_family'),label:'告诉患者「只是抽血误差」，不作风险说明'});
  }
  if(g.id==='C011'){
    allChecks('hurried',1,['comfort']);mod('s5_repeat',V('short_stock'),{when:V('short_stock'),minutes:23});
    set('s5_repeat',['pharmacy_restocked'],'always',V('short_stock'));
  }
  if(g.id==='C012'){
    context('son_away','儿子在外地','family');context('surgeon_busy','外科在台上','surgeon');
    for(const o of node('s5').options)mod(o.id,V('son_away'),{when:V('son_away'),minutes:o.minutes+10});
    mod('s3_urgent',V('surgeon_busy'),{when:V('surgeon_busy'),minutes:40});allChecks('surgeon_busy',1,['persuade']);
    set('s5_inform',['phone_consent_recorded'],'always',V('son_away'));
  }
  if(g.id==='C013'){
    context('full_beds','上级医院满床','transfer');context('wife_present','妻子在场','family');
    mod('s5_transfer',V('full_beds'),{when:V('full_beds'),minutes:70,dc:2});mod('s1_ask_meds',A(V('wife_present'),N(F('wife_out'))),{when:V('wife_present'),dc:2});
    add('s1','s1_wife_out','请家属回避后单独问诊','s1',{flags:['wife_out']},2,1,0,V('wife_present')).result='你请家属回避后单独问诊。';multi('s1',1,2,['s1_ortho']);
  }
  if(g.id==='C014'){
    context('father_calls','父亲电话施压','family');context('bed_pressure','床位紧张','beds');allChecks('father_calls',1,['comfort']);
    mod('s3_stay',V('bed_pressure'),{when:V('bed_pressure'),ap:2});mod('s3_o2',V('bed_pressure'),{when:V('bed_pressure'),ap:2});
  }
  if(g.id==='C015'){
    context('rep_dinner','药代上周请客','promotion');context('pharmacist','临床药师在科','staff');
    set('s2_mero_direct',['rep_contact'],'always',V('rep_dinner'));set('s2_mero_approved',['rep_contact'],'success',V('rep_dinner'));
    const consult=add('s2','s2_pharmacist','请临床药师共同核对方案','s2',{flags:['pharmacist_consulted']},10,1,100,V('pharmacist'));consult.result='药师核对重症评分、既往用药与病原学。院内标准方案可用，药师把建议写入会诊意见。';
    mod('s2_argue',F('pharmacist_consulted'),{when:F('pharmacist_consulted'),dc:-2});multi('s2',1,2,['s2_standard','s2_fq','s2_mero_direct','s2_mero_approved','s2_pip','s2_argue']);
  }
  if(g.id==='C016'){
    context('sendout_level','本院无血药浓度检测','laboratory');context('no_night_psych','精神科夜间无值班','staff');
    mod('s2_labs',V('sendout_level'),{when:V('sendout_level'),label:'外送药物浓度，急查肝功、凝血、肾功、血气'});
    g.reports[0].when=A(C('s2_labs'),N(V('sendout_level')));
    const sent=structuredClone(g.reports[0]);sent.id='C016_sendout';sent.when=A(C('s2_labs'),V('sendout_level'));sent.full='药物浓度标本已外送，预计次日回报。解毒决定依据已获得的服药史与风险评估，不能为等待外送结果延迟。';sent.skimmed='药物浓度标本已外送，预计次日回报……不能为等待外送结果延迟。';g.reports.push(sent);
    mod('s3_psych',V('no_night_psych'),{when:V('no_night_psych'),label:'电话请精神科会诊，预约次晨到场'});
    effect('s4_no_family',{hazards:[{type:'R',weight:5,reason:'精神科尚未到场且无人持续看护。',norm:'高风险患者看护与交接',causal:false}]},'always',V('no_night_psych'));
  }
  if(g.id==='C017'){
    context('protective_stoma','保护性回肠造口','anatomy');context('family_present','家属在场','family');
    set('s1_review',['protective_stoma_seen'],'always',V('protective_stoma'));
    g.presentation.history=g.presentation.history.map(s=>s.replace('，未造口',''));
    op('s1_review').resultVariants=[{when:V('protective_stoma'),text:'手术记录写有保护性回肠造口。造口存在仍不能替代对吻合口、引流液和感染来源的评估。'}];
  }
  if(g.id==='C018'){
    context('family_present','家属在场','family');context('group_contact','药代通过科室群联系','contact');context('outside_medlist','带有外院用药清单','records');
    set('s6_record',['group_screenshot_preserved'],'always',V('group_contact'));set('s1_medlist',['outside_prescription_seen'],'always',V('outside_medlist'));
  }
  if(g.id==='C019'){
    context('brief_coma','母亲曾短暂意识不清','history');context('no_chamber','本院无高压氧舱','facility');context('scene_unconfirmed','消防尚未确认现场安全','scene');
    set('s2_mother',['maternal_coma_history'],'always',V('brief_coma'));mod('s5_hbo_yes',V('no_chamber'),{when:V('no_chamber'),minutes:40,label:'联系有高压氧舱的接收医院并监护转运'});
    mod('s1_safe',V('scene_unconfirmed'),{when:V('scene_unconfirmed'),minutes:15});
  }
  if(g.id==='C020'){
    context('autopsy_requested','家属提出尸检','family');context('drug_event_suspected','疑似用药不良事件','cause');context('ward_camera','病区有监控录像','records');context('isolation','传染病隔离患者','isolation');
    set('s4_autopsy',['family_autopsy_request'],'always',V('autopsy_requested'));set('s2_scene',['drug_event_materials'],'always',V('drug_event_suspected'));set('s2_scene',['camera_export_preserved'],'always',V('ward_camera'));
    mod('s4_morgue',V('isolation'),{when:V('isolation'),minutes:22,cost:120,label:'按隔离转运流程移放遗体并交接防护要求'});
    g.reports[1].full='18:00 后无医生病程新增；护理记录原始版本保留「胸闷」字样；22:28 报警有静音操作；输液泵内余液 42 mL，药袋标签和批号可辨。原始电子记录已经封存，设备操作不等于死因认定。';g.reports[1].skimmed='18:00 后无医生病程新增；护理记录保留「胸闷」字样；22:28 报警有静音操作；输液泵内余液 42 mL……原始电子记录已经封存。';
  }

  // Original result tables are not exhaustive; explicitly complete uncovered routes.
  const supplementalText:Record<string,string>={
    C001:'孩子仍需外科处理。接班医生重新评估腹股沟包块，安排监护下转诊。未完成的准备写在交班单上，患儿继续住院观察，恢复时间延长。',
    C002:'咳嗽未完全缓解，他提前回来复诊。接诊医生核对用药、饮酒和过敏史，补齐评估后调整方案。妻子把两次处方放在同一只文件袋里。',
    C003:'胸痛团队在交接时补齐未完成的抗栓、补液或术前准备，并复核再灌注安排。患者继续在监护病房治疗。交接记录逐项列出了完成时间。',
    C004:'接班医师复核凝血和血红蛋白，停用相互作用药物，重新联系消化科与心脏专科。出血得到控制，监护和抗凝调整继续进行。',
    C005:'住院团队重新核对静脉成像、抗凝和既往用药。缺少的处置被补上，头痛随后缓解，患者按预约复查视力和影像。',
    C006:'交班时血糖尚未满足安全离院条件，白班继续葡萄糖输注、进食评估和血糖监测。患者留观到下午，出院时拿到了一份监测计划。',
    C007:'专科会诊重新核对病程和超声心动图，补齐治疗与告知。孩子继续住院，出院时约好了冠状动脉随访。母亲把预约单夹在病历本第一页。',
    C008:'接收团队补做感染评估，复核经验抗感染方案与监护安排。孩子继续住院治疗，听力与神经发育随访列在出院记录里。',
    C009:'输血科在后续核对时暂停了输注安排，逐项复查标本、血袋和床旁记录。重新配血后继续治疗，原始核对缺口留在不良事件资料中。',
    C010:'白班接到交班后立即补齐心电监护、降钾和血液净化评估。患者转入监护床，血钾继续复测。接报记录与实际处置时间一并归档。',
    C011:'抢救团队继续气道、血压和心律复评，患者留在监护病房。药物过敏标识和观察安排补入交班单，尚未完整的抢救记录进入科室核查。',
    C012:'上级外科医师重新评估持续腹痛和检查结果，完成手术讨论与术前准备。患者在监护下接受后续治疗，原始会诊时间保留在病历里。',
    C013:'接收团队重新评估主动脉、器官灌注和血压控制，补齐影像与监护处置。患者继续住院，门诊未完成的检查和转诊环节进入交接复核。',
    C014:'出院安排暂缓。接班团队重新复测睡眠血氧，补充沟通与书面计划。孩子继续接受氧疗和观察，达到稳定标准后办理出院。',
    C015:'第七天患者体温和咳嗽改善。药师逐项复核病原学、用药理由和序贯方案，要求补齐处方依据。多出的药费留在病组费用表中。',
    C016:'留观团队重新核对解毒疗程、肝功能和看护安排，补齐精神科评估。患者在有人陪护的环境下继续治疗，后续转诊与复查写入交班记录。',
    C017:'接班外科与重症团队重新核对感染来源，补齐影像、抗感染和支持治疗。患者继续住院，病情变化和升级监护的时间列入交班单。',
    C018:'肾内科与药师重新核对处方依据和支付范围，补齐尚未完成的评估。治疗继续，费用与线索记录分别归档，现有材料没有形成回扣事实认定。',
    C019:'接班团队分别复核三人的腕带、氧疗、检查和去向，补齐遗漏评估。父亲、母亲和女儿继续在对应科室观察，出院前逐人安排随访。',
    C020:'医务处接收现有资料，要求补齐讨论、交接和家属沟通记录。死因仍待查明，已保存的原始材料进入封存清单。',
  };
  g.outcomes.push({id:'o_review',title:g.id==='C020'?'资料续查':'交接后的复评',priority:-100,severity:g.id==='C020'?0:1,seed:false,condition:{always:true},text:supplementalText[g.id],supplemental:true,source:{...g.source,section:'补充：原结局表未覆盖的交接路径',raw:'原始结局保留全部触发条件；未落入原结局的已存在选择组合由接班团队复评收口，不倒推不存在的伤害或检查。'}});
  g.normalizationNotes.push('原结局不穷尽所有合法选项组合；o_review 仅在原结局全部不匹配时收口，保留既有隐患与费用，不冒充原文良好路径。');
  const titles:Record<string,string>={o_good:'病情稳定',o_delay_short:'转运中的耽搁',o_delay_long:'等到天亮以后',o_worst:'未能挽回的后果',o_ok_warned:'告知之后',o_reaction:'突发反应',o_ntg:'血压下降之后',o_delay:'错过的时间',o_refuse:'留下的拒绝',o_missed:'漏过的线索',o_partial:'补救之后',o_late_nurse:'护士的复测',o_rebound:'再次低血糖',o_caught:'输注前的拦截',o_arrest:'监护报警',o_stable_delay:'血钾再次上升',o_rescued:'抢救以后',o_biphasic:'再次返院',o_hypoxic:'缺氧之后',o_late:'推迟的手术',o_refused:'签署拒绝',o_death:'最后的会诊',o_antiplatelet:'抗栓之后',o_home:'离院以后',o_transit:'途中',o_ama:'自动出院后',o_readmit_death:'返院的急诊记录',o_dip_only:'费用表上的缺口',o_carbapenem_fine:'稽核通报',o_cdiff:'疗程以外',o_approved_ok:'审批与拒付',o_late_nac:'延长的解毒疗程',o_liver_failure:'第三天返院',o_unsupervised:'缺少的看护',o_lung_path:'肺部感染路径',o_harm:'治疗方案的后果',o_admin:'院内核查',o_uncertain:'尚未完整的记录',o_unsafe:'安全链中断',o_delayed:'迟发的症状',o_hbo:'逐人的高压氧评估',o_chain:'完整的时间线',o_respectful_dispute:'异议得到记录',o_lost_chain:'找不到的原始记录',o_obstruction:'被改动的记录'};
  for(const o of g.outcomes)if(!o.supplemental)o.title=titles[o.id]??'病例结算';
  const visible=(s:string)=>s.replace(/[，；]?\s*flag\s+[a-z][a-z0-9_]*(?:（[^）]*）)?/g,'').replace(/[，；]?(?:仍可|仍)?进入\s*s\w+(?:\s*或\s*s\w+)?/g,'').replace(/[，；]?隐患取消/g,'').replace(/→(?:consent|s\d\w*)(?:\s*重选)?/g,'').replace(/设 icu_waitlist，仍进入记录与交班/,'监护床暂不可用，申请已登记，继续安排交接。').trim();
  const copy:Record<string,string>={potassium_tab:'患者说出自带含钾药物和输液泵报警经过。',informed:'患者复述了费用、支付范围和替代方案。',consent_signed:'患者在费用与风险说明下签字确认。',note_complete:'药物核对、方案依据、费用告知和线索流转均已记入病程。',rights_given:'家属得知了怎样复制病历、解决纠纷，以及向谁咨询尸检。',autopsy_discussed:'已说明尸检同意、签字与观察安排。',report_started:'医务处收到书面报告，开始核对争议事项。',records_complete:'死亡记录、抢救记录和证据清单已经归档。'};
  for(const n of g.nodes)for(const o of n.options){o.result=visible(o.result);if(o.successText)o.successText=copy[o.successText.split('、')[0]]??visible(o.successText);if(o.check)o.check.failureText=visible(o.check.failureText);}
  if(g.id==='C009')op('s3_pickup').resultVariants=[{when:A(F('wbit'),N(F('redraw'))),text:'配血报告写着 A 型，本院病历无历史血型记录。双方核对标签后签字，疑问仍需回到患者床旁复核。'},{when:N(A(F('wbit'),N(F('redraw')))),text:'双方逐项核对 O 型配血报告、血袋与有效期，签字取血。'}];
  // Every written flag remains a scoped record fact and can be audited at its exact source.
  const flags=new Map<string,string[]>();
  for(const n of g.nodes)for(const o of n.options)for(const flag of [...(o.effects.flags??[]),...o.rules.flatMap(r=>r.effects.flags??[]),...(o.check?.failure.flags??[])])flags.set(flag,[...(flags.get(flag)??[]),o.id]);
  for(const [flag,producers] of flags){
    const consumers:ClinicalGraph['flagConsumers'][string]=[];
    for(const o of g.outcomes)if(JSON.stringify(o.condition).includes(`"${flag}"`))consumers.push({kind:'outcome',id:o.id});
    for(const r of g.reports)if(JSON.stringify(r.when).includes(`"${flag}"`))consumers.push({kind:'report',id:r.id});
    for(const n of g.nodes)for(const o of n.options)if(JSON.stringify([o.requires,o.transitions,o.rules.map(r=>r.when)]).includes(`"${flag}"`))consumers.push({kind:'condition',id:o.id});
    for(const producer of producers)if(g.tribunal[producer])consumers.push({kind:'tribunal',id:producer});
    consumers.push({kind:'record',id:producers.join(',')});g.flagConsumers[flag]=consumers;
  }
  // Report indexes are the canonical revelation mapping used by both game and tests.
  for(const n of g.nodes)for(const o of n.options)o.reports=g.reports.filter(r=>JSON.stringify(r.when).includes(`"${o.id}"`)).map(r=>r.id);
  applyBedsideObservations(g);
  return g;
}
