import type { Card, Effects, Option, Patient, Run, Scope } from '../../game/types';
import { runRandom } from '../../game/run-random';
import { RULES } from '../../game/rules';
import type { EventPhase } from './types';
import { EVENT_SOURCES } from './catalog';
import { CASES } from '../../game/catalog';
import {authoredCashPressure}from './pressure';
import {ENTITY_BY_ID}from '../patients';
import {entityScenario}from '../patients/scenarios';
import {patientCanSpeak}from './patient-requirements';
import {patientPayment}from '../../game/costs';

export interface TrolleyToken {id:string;sourceId:string;choice:string;day:number;due:number;stage:1|2|3;scope:Scope;patientIds:string[];actor:string;object:string;resolved:boolean;response?:string;}
export interface TrolleyLedger {seen:string[];commits:string[];tokens:TrolleyToken[];}
export interface TrolleyCard extends Card {trolley:{sourceId:string;stage:1|2|3;patientIds:string[];tokenId:string;};}
export interface TrolleyWorld {day:number;phase:EventPhase;patients:Patient[];facts:string[];peerAvailable:boolean;nightArrivalIds?:string[];}
/** New, not-yet-dispensed medicine quote, specified in 01's trolley parameters. */
export const TROLLEY_DRUG_QUOTE=900;
function medicationQuote(r:Run,p:Patient,card?:Card){
 const source:Card=card??{id:`${r.id}:medication-quote`,kind:'story',title:'用药费用',text:'',scope:{kind:'patient',id:p.uid},patientId:p.uid,options:[]};
 const option:Option={id:`${source.id}:a`,label:'保留首选药',ap:0,minutes:0,cost:TROLLEY_DRUG_QUOTE,effects:{},result:''};
 return patientPayment(r,p,option,source);
}
export const trolleyDrugGap=(r:Run,p:Patient)=>medicationQuote(r,p).personal;
export interface TrolleyDefinition {id:string;source:{path:string;section:string;row:number;sha256:string};title:string;phases:EventPhase[];kind:'conflict'|'temptation';requires:string[];echo:string;object:string;actor:string;}
const spec=(n:number,title:string,phases:EventPhase[],requires:string[],echo:string,object:string,actor:string,kind:TrolleyDefinition['kind']='conflict'):TrolleyDefinition=>({id:`TROLLEY-${n}`,source:{path:'03_主线与支线.md',section:'4',row:n,sha256:EVENT_SOURCES.find(s=>s.path==='03_主线与支线.md')!.sha256},title,phases,requires,echo,object,actor,kind});
export const TROLLEY_DEFINITIONS:TrolleyDefinition[]=[
 spec(1,'同时到院',['夜班'],['two-night-patients'],'护士拿来那晚两位患者的接诊时间表，要与你逐项核对先后顺序。','两份接诊时间表','护士长'),
 spec(2,'最后一张重症床位',['夜班'],['young-trauma-and-elder'],'两家人分别询问当晚床位的安排依据，医务科请你保留分配记录。','重症床位分配单','医务科'),
 spec(3,'同事的原始表格',['结算'],['verified-colleague-false-data'],'同事带来那张表格，问你愿不愿把自己亲眼看到的部分写清楚。','原始数据表','周乔','temptation'),
 spec(4,'高危孕妇求诊',['门诊','夜班'],['pregnant-patient'],'产科来电核对当时的接诊和转介经过，要与你确认联系时间。','产科联络单','产科医生'),
 spec(5,'超预算的首选药',['查房'],['over-budget-patient'],'药师拿来这位患者的药品明细，请你核对最终方案及告知内容。','用药与费用明细','药师'),
 spec(6,'患者要求保密',['查房'],['adult-patient'],'家属问起上次谈话，患者也想确认你究竟告诉了谁。','告知范围记录','患者'),
 spec(7,'家属拦下病理报告',['查房'],['cancer-patient'],'同一位患者再次问起病理报告，家属站在门边等你的回应。','病理报告','患者'),
 spec(8,'工作电话与家里的电话',['查房','夜班'],['recent-family-icu','active-patient'],'护士长拿来当时的交接单。家里也问你是否已经联系重症监护病房。','那次电话的交接单','护士长'),
 spec(9,'上级的处方签字',['查房'],['antibiotic-patient'],'主任把签过的处方与原医嘱放在一起，请你确认当时的指示。','上级处方与签字页','主任','temptation'),
 spec(10,'押金与讲课费',['结算'],['family-icu','representative-contact'],'药代发来讲课费的确认单，家里同时问你押金准备到哪一步。','讲课费确认单','叶茗','temptation'),
 spec(11,'录音没有暂停',['查房'],['same-patient-recording'],'家属带着完整录音回来，希望把当时没说清楚的部分逐一核对。','完整谈话录音','家属'),
 spec(12,'被问到的同事处方',['结算'],['audit-open'],'稽核员拿出你上次的说明，请你核对哪些内容有原始依据。','稽核谈话记录','稽核员'),
 spec(13,'欠费后的停药通知',['查房'],['three-day-debt-patient'],'药房回传欠费处理清单，需要确认药物是否继续发放、费用由谁承担。','欠费与发药清单','药房'),
 spec(14,'交班后的危急值',['交班'],['urgent-inpatient'],'接班医生带来危急值回报单，要与你核对最后完成处置的时间。','危急值回报单','接班医生'),
 spec(15,'谁来决定最后的安排',['查房'],['terminal-elder'],'医务科约患者和子女同场谈话，请每个人分别确认自己的意愿。','患者意愿记录','医务科'),
 spec(16,'实习生的错误医嘱',['查房'],['active-inpatient'],'带教把那次错误医嘱的修改记录打印出来，要求说明谁发现、谁修改、谁报告。','医嘱修改日志','带教','temptation'),
 spec(17,'五百元的信封',['查房'],['active-patient'],'同一家属问起信封的去向，护士长查到当时的交接记录。','五百元信封','护士长','temptation'),
 spec(18,'缺药通知',['查房'],['antibiotic-patient','over-budget-patient'],'药房重新供货，药师来核对这段缺药期间的替代、等待和外购安排。','缺药期间的用药单','药师'),
 spec(19,'深夜要看的病历',['夜班'],['active-inpatient'],'病案室接到家属的复制申请，请你核对昨夜提供过哪些材料。','病历复制清单','病案室'),
 spec(20,'替一次夜班',['结算'],['peer-available'],'同事把更新后的排班表发来，问双方约定的那段工作是否已经交接。','换班排班表','小李'),
];
const profile=(p:Patient)=>p.preset??CASES.find(c=>c.id===p.caseId);
const clinical=(p:Patient)=>`${profile(p)?.complaint??''} ${profile(p)?.history.join(' ')??''} ${profile(p)?.findings.join(' ')??''} ${p.clinical?.flags.join(' ')??''}`;
const age=(p:Patient)=>profile(p)?.age??18;
/** These source cases have an actual ongoing pregnancy and a current obstetric
 * complication. Postpartum cases and undiscovered incidental pregnancy are not
 * a conscious high-risk-pregnancy request for care. */
export const TROLLEY_HIGH_RISK_PREGNANCY_PRESETS=['C-164','C-165','C-169','C-171','C-176']as const;
export function trolleyHighRiskPregnancy(p:Patient):boolean{
 const entityId=p.preset?.entityId??p.entityId,entity=p.preset?.entityProfile??(entityId?ENTITY_BY_ID.get(entityId):undefined);
 return TROLLEY_HIGH_RISK_PREGNANCY_PRESETS.includes(p.caseId as typeof TROLLEY_HIGH_RISK_PREGNANCY_PRESETS[number])&&!!entity&&entityScenario(entity).pregnancy?.state==='pregnant';
}
const alive=(w:TrolleyWorld)=>w.patients.filter(p=>p.active&&p.damage<3);
export function trolleyBindings(d:TrolleyDefinition,w:TrolleyWorld,r:Run):Patient[]|null {
  if(!d.phases.includes(w.phase))return null;
  let candidates=alive(w).filter(p=>w.phase==='查房'?p.inpatient:w.phase==='门诊'?!p.inpatient:true),bound:Patient[]=[];
  if(['TROLLEY-4','TROLLEY-6','TROLLEY-7','TROLLEY-15'].includes(d.id))candidates=candidates.filter(patientCanSpeak);
  for(const requirement of d.requires){
    if(requirement==='two-night-patients'){bound=candidates.filter(p=>w.nightArrivalIds?.includes(p.uid));if(bound.length<2)return null;bound=bound.slice(0,2);}
    else if(requirement==='young-trauma-and-elder'){
      const arrivals=candidates.filter(p=>w.nightArrivalIds?.includes(p.uid)),young=arrivals.find(p=>age(p)<40&&/外伤|创伤|车祸|骨折/.test(clinical(p))),old=arrivals.find(p=>age(p)>=65);
      if(!young||!old||young.uid===old.uid)return null;bound=[young,old];
    }else if(requirement==='verified-colleague-false-data'){if(!w.facts.includes('verified-colleague-false-data'))return null;}
    else if(requirement==='family-icu'||requirement==='recent-family-icu'){if(!w.facts.includes(requirement))return null;}
    else if(requirement==='representative-contact'){if(!w.facts.includes('representative-contact'))return null;}
    else if(requirement==='audit-open'){if(!w.facts.includes('audit-open'))return null;}
    else if(requirement==='peer-available'){if(!w.peerAvailable)return null;}
    else{
      candidates=candidates.filter(p=>requirement==='active-patient'||requirement==='active-inpatient'&&p.inpatient||requirement==='adult-patient'&&age(p)>=18||requirement==='pregnant-patient'&&trolleyHighRiskPregnancy(p)||requirement==='over-budget-patient'&&trolleyDrugGap(r,p)>0||requirement==='cancer-patient'&&/癌|恶性肿瘤/.test(clinical(p))||requirement==='antibiotic-patient'&&/抗菌|青霉|头孢|肺炎|感染|carbapenem|antibiotic/.test(clinical(p))||requirement==='three-day-debt-patient'&&p.inpatient&&w.facts.includes(`three-day-debt:${p.uid}`)||requirement==='urgent-inpatient'&&p.inpatient&&/高钾|低钾|高血糖|酸中毒|心肌梗死|critical/.test(clinical(p))||requirement==='terminal-elder'&&age(p)>=65&&/晚期|终末|终末期|癌|恶性/.test(clinical(p))||requirement==='same-patient-recording'&&w.facts.includes(`recording:${p.uid}`));
      if(!candidates.length)return null;bound=[candidates[0]];
    }
  }
  return bound;
}
const risk=(type:'R'|'C'|'D'|'F',weight:number,reason:string):Effects=>({hazards:[{type,weight,reason,norm:{R:'实际接诊与诊疗责任',C:'对应患者的告知与沟通',D:'原始记录与事实一致',F:'实际费用与审批一致'}[type],causal:false}]});
const add=(a:Effects,b:Effects):Effects=>({...a,...b,hazards:[...(a.hazards??[]),...(b.hazards??[])]});
const choice=(id:string,label:string,effects:Effects,result:string,ap=0,minutes=0):Option=>({id,label,effects,result,ap,minutes,cost:0});
const check=(o:Option,skill:'persuade'|'comfort',dc:number,failure:Effects,failureText:string):Option=>({...o,check:{skill,dc,purpose:o.label,failure,failureText}});
export function makeTrolleyCard(d:TrolleyDefinition,r:Run,bound:Patient[]):TrolleyCard {
  const n=d.source.row,p=bound[0],other=bound[1],personal:Scope={kind:'personal',id:r.id};
  const scope:Scope=p?{kind:'patient',id:p.uid}:[3,9,10,12].includes(n)?{kind:'project',id:`${r.id}:${n===3?'research-project':n===12?'audit':'prescription-review'}`}:personal;
  const name=p?.name??'患者',id=`${r.id}:${d.id}`,o=(letter:string,label:string,effects:Effects,result:string,ap=0,minutes=0)=>choice(`${id}:${letter}`,label,effects,result,ap,minutes);
  const quoteCard:Card={id,kind:r.shiftPhase==='夜班'?'night':'story',title:d.title,text:'',scope,patientId:p?.uid,options:[]};
  const quoted=p&&(n===5||n===18)?medicationQuote(r,p,quoteCard):undefined;
  const gap=quoted?.personal??0,medicationBill=quoted?.treatment??TROLLEY_DRUG_QUOTE;
  let text='',options:Option[]=[];
  switch(n){
    case 1:text=`${name}和${other!.name}同时到院。护士把两份分诊单放到你面前，两边都等着你到场。`;
      options=[o('a',`先去${name}床旁，电话交代另一位`,{},`你先到${name}床旁，另一位暂由电话处置。`),o('b',`先去${other!.name}床旁，电话交代${name}`,risk('R',25,'同时接诊时仅电话处置本患者'),`你先去了另一边，${name}暂未得到床旁评估。`),o('c',`让实习生先看${name}，自己去另一边`,add(risk('R',15,'急诊由实习生先行评估'),{relations:{peer:-1}}),'实习生先去评估，你在另一边接诊，随后仍需核对实习生的判断。')];break;
    case 2:text=`重症监护病房只剩一张床。年轻外伤患者${name}与老年患者${other!.name}都在等待安排。`;
      options=[o('a','先安排年轻外伤患者',{},'你把床位给了年轻患者。老人家属要求当面说明分配依据。'),o('b','先安排老年患者',{reputation:-10},'你把床位给了老人。年轻患者家属把等待经过发到了网上。'),o('c','请主任协调并记录分配依据',{relations:{chief:-1}},'你把两人的情况同时交给主任，请他协调床位。',2,20)];break;
    case 3:text='周乔的原始表格与已提交的论文不一致，你已经核对过对应数据。她知道你看到了，问你接下来准备怎么做。';
      options=[o('a','报告已经核实的数据问题',{relations:{peer:-3},emotion:-20,flags:['政治-举报','举报人']},'你提交核对材料，没有扩写未见过的部分。周乔知道了你的决定。'),o('b','保持沉默',{san:-10,flags:['同事造假-知情','知情']},'你没有报告。原始表格仍在，周乔知道你已经看过。'),check(o('c','私下劝她更正',{relations:{peer:1}},'周乔答应按原始资料办理更正。'),'persuade',14,{relations:{peer:-1}},'她没有接受你的劝告。原始材料没有因此改变。')];break;
    case 4:text=`${name}说明自己是高危妊娠，希望现在由你接诊。她担心再次转诊会耽误，产科目前不在这间诊室。`;
      options=[o('a','接诊，先承担当前评估',add(risk('R',10,'缺少专科支持的高危妊娠接诊'),{stamina:-10}),'你接下患者，先完成当前评估，后续仍需获得专科支持。'),o('b','说明能力限制，安排转上级医院',{reputation:-5,flags:[`defensive-transfer:${p!.uid}`],discharge:true},'你安排转上级医院并交接信息。患者对再次转诊不满。'),o('c','接诊并请产科会诊',risk('F',5,'新增产科会诊流程'),'你接诊后联系产科，把风险和目前情况说清。',2)];break;
    case 5:text=`药房为${name}核对了这次新增用药：费用 ¥${medicationBill}，尚未开出。计入患者账单后，你需承担的新增超支为 ¥${gap.toLocaleString('en-US')}。有预算内替代药，但并非同等方案。`;
      options=[o('a','保留首选药，承担差额',{cash:-gap},'你保留首选方案，明确承担对应差额。'),o('b','改用预算内次优药',risk('R',10,'为预算改用次优方案'),'你换了药，费用减少，但方案并非等效替换。'),o('c','让患者自费到院外购买',add(risk('C',10,'将首选药费用转给患者外购'),{reputation:-5,flags:['外购药']}),'你开出外购处方，患者需要自行承担这部分费用。')];break;
    case 6:text=`${name}清楚表达：这次病情暂时不要告诉家属，愿意自己作决定。家属正在门外等。`;
      options=[o('a','遵从患者，暂不告诉家属',risk('C',15,'家属对未获告知提出异议'),'你按患者意愿暂不告知。家属后来追问时，对这一安排不满。'),o('b','直接告诉家属',{patience:-30},'你向家属说明了病情。患者知道后不再信任你的保密承诺。'),o('c','记录患者拒绝告知的范围',{flags:[`privacy-instruction:${p!.uid}`]},'你记录患者的知情能力、保密要求和范围，请本人核对。',1)];break;
    case 7:text=`${name}的病理结果提示癌症。家属请你不要告诉本人，但患者正在询问这份报告。`;
      options=[o('a','按家属要求暂不告诉患者',risk('D',10,'未完整记录患者知情意愿与告知安排'),'你没有告诉患者真实结果，告知安排尚未完整记清。'),o('b','向患者如实说明',risk('C',15,'家属反对向患者告知癌症'),'你向患者解释报告。家属在门外争执，要求你说明为什么没有按他们的要求做。'),o('c','请求伦理会诊协助谈话',{},'你联系伦理会诊，把患者本人和家属的不同意愿一并提出。',2,30)];break;
    case 8:text=`你正在处理${name}的工作，母亲又打来父亲车祸住进重症监护病房的电话。两边都等着你回应。`;
      options=[o('a','接电话并处理家里的安排',risk('R',10,'处理中断使当前患者等待'),'你联系家里和重症监护病房，当前患者暂时等候。',3),o('b','挂断，先完成工作',{emotion:-20,relations:{family:-2}},'你挂断电话继续工作，家里随后又发来消息。'),o('c','请护士长暂时代管现场',{flags:['人情债',`handoff-request:${p!.uid}`]},'护士长留下协调现场，你去回拨家里的电话。你欠了她这次帮忙的人情。')];break;
    case 9:text=`主任把${name}的一张超适应症用药处方推来，请你在审核人一栏签字。`;
      options=[o('a','签字',add(risk('R',20,'签署上级超适应症处方'),risk('F',10,'超适应症处方审核')),'你在审核栏签名，这份处方留下了你的签字。'),o('b','拒绝签字',{relations:{chief:-2},flags:['科研-deadline-今日']},'你没有签。主任收回处方，要求你今天把科研材料交来。'),o('c','签字并如实注明上级医嘱',{relations:{chief:-1},flags:[`clinical:${p!.uid}:superior_order_recorded`]},'你签了字，同时如实记录上级指示。这份处方的审核人仍是你。')];break;
    case 10:text='家里正在凑重症监护病房的押金，叶茗递来三千元讲课费的安排，金额刚好能补眼前的一部分缺口。';
      options=[o('a','完成讲课并接受三千元',{cash:3000,san:r.talents.includes('T28')?0:-10*(1-authoredCashPressure(r)/200),flags:['药代-2讲课费']},'讲完课，三千元打进你的账户。你能拿这笔钱补家里的押金，讲课和收款记录也都留了下来。'),check(o('b','拒绝讲课费',{emotion:-3},'你拒绝了这笔费用，家里的押金仍要另想办法。'),'persuade',11+Math.floor(authoredCashPressure(r)/20),{emotion:-20},'对方继续劝说，你仍没有接受款项。家里的押金还在催。'),o('c','讲课后把费用上交科室',{reputation:5,relations:{chief:1},flags:['药代-上交']},'讲课费交到科室，没有进入自己的可用余额。')];if(r.talents.includes('T28'))options.pop();break;
    case 11:text=`${name}的家属把录音设备放在桌上，说这次谈话不会暂停。你需要说明已经发生的诊疗经过。`;
      options=[o('a','完整说明已核实的经过',{reputation:-5,flags:[`complete-explanation:${p!.uid}`]},'你把已核实的经过完整说清，没有删去对自己不利的部分。'),check(o('b','按诊疗流程逐项解释',{},'家属接受了这次说明，仍保留完整录音。'),'comfort',12,risk('C',10,'家属未接受流程解释'),'家属仍有疑问，要求把未回答的问题保留下来。'),o('c','请医务科一起谈',{reputation:-3},'你联系医务科到场，将问题与录音范围一并交接。',2)];break;
    case 12:text='稽核员拿出同事的一张特殊级抗菌药处方，问你是否见过对应审批。他把记录纸放在你面前。';
      options=[o('a','如实说明自己知道的情况',{relations:{peer:-3},flags:['飞检-同事供出']},'你说明亲眼见过的内容。同事随后知道这次谈话。'),o('b','只说不知道',risk('F',15,'未说明自己掌握的处方审核情况'),'你没有提供自己掌握的情况，原始审批资料仍会继续核对。'),check(o('c','只陈述可核实的事实',{},'你区分了亲眼见过、听人转述和不知道的部分。'),'persuade',13,add(risk('F',10,'稽核说明未能区分事实范围'),{relations:{peer:-1}}),'说明仍未说清事实范围，同事也对这次谈话表示不满。')];break;
    case 13:text=`${name}已经欠费三天，药房通知暂停发药。需要继续的药物今天还没领到。`;
      options=[o('a','自己垫八百元',{cash:-800},'你垫付八百元，药房按缴费记录继续发药。'),o('b','按欠费通知停药',risk('R',15,'欠费后中断必要用药'),'你停止部分用药，欠费问题还没有解决。'),o('c','到医务科办理欠费用药手续',{},'你提交欠费处理申请，核对继续发药的手续。',2,40)];break;
    case 14:text=`交班刚结束，护士打来${name}的危急值电话。接班医生还在处理另一项工作。`;
      options=[o('a','返回处理，预支一格精力',{stamina:-10,flags:['trolley-borrow-one']},'你返回病区完成处置，之后的休息被压缩。'),o('b','明确交给接班医生并等待确认',{},'你把危急值逐项交给接班医生，等待对方回报完成情况。'),o('c','电话下医嘱，暂不回病区',risk('D',10,'电话医嘱未及时留书面记录'),'你通过电话交代处置，书面记录尚未补齐。')];if(r.borrowed>=RULES.borrowMax||r.day>=RULES.days)options=options.filter(x=>!x.id.endsWith(':a'));break;
    case 15:text=`${name}明确说想回家度过最后的日子，子女却希望继续抢救。你请每个人把意愿说完。`;
      options=[o('a','尊重老人表达的意愿',risk('C',15,'子女不接受患者本人离院意愿'),'你按老人清楚表达的意愿安排沟通，子女当场提出反对。'),o('b','按子女要求继续安排',{patience:-40},'你按照子女要求继续安排，老人不再愿意和你多谈。'),o('c','请伦理与医务科共同谈话',{},'你联系共同谈话，让患者本人和子女分别表达意愿。',2,RULES.ward.transferMinutes)];break;
    case 16:text=`实习生给${name}开错了一条医嘱，你在执行前发现了。错误需要立即改正，还要决定如何报告。`;
      options=[o('a','纠正后按流程报告',{relations:{peer:-1},flags:[`intern-error-reported:${p!.uid}`]},'错误医嘱已纠正，发现和报告经过按流程留下。'),o('b','自己改掉，不报告',risk('D',10,'错误医嘱更改后未如实报告'),'你改掉医嘱，没有报告发现错误的经过。系统修改日志仍在。'),o('c','带实习生纠正，让他自己报告',{relations:{peer:1},reputation:-2},'实习生纠正并报告了错误，你核对报告内容后结束这次处理。')];break;
    case 17:text=`${name}的家属递来一个信封，里面是五百元。他说只是一点心意。`;
      options=[o('a','收下五百元',{cash:500,flags:['收礼']},'你收下信封，没有退回或登记。'),o('b','退回信封',{patience:-10},'你把信封退回。家属觉得有些难堪，话少了。'),o('c','交护士长登记处理',{reputation:2},'护士长登记金额和来源，按流程处理这只信封。',1)];break;
    case 18:text=`${name}需要的药缺货，药房只有进口替代。这次新增用药费用 ¥${medicationBill}，尚未开出；计入患者账单后，你需承担的新增超支为 ¥${gap.toLocaleString('en-US')}。`;
      options=[o('a','使用进口替代，承担差额',{cash:-gap},'你使用进口替代，承担实际差额。'),o('b','等一天再用',risk('R',10,'等待供药使治疗延迟'),'你等药房恢复供应，今天的治疗暂时推迟。'),o('c','请患者到外院购买',add(risk('C',10,'缺药后安排院外购药'),{flags:['外购药']}),'你开出外购安排，患者需要自行去外院取药。')];break;
    case 19:text=`深夜，${name}的家属到护士站要求看病历，表示不愿等到明天。`;
      options=[o('a','核对身份后让家属查看',{flags:[`record-viewed:${p!.uid}`]},'你让家属查看获准提供的材料，对方逐页核对。'),o('b','按流程明天申请复制',risk('C',10,'家属对等待复制病历不满'),'你说明正式复制流程，家属仍在护士站表达不满。'),o('c','请值班护士长到场协调',{},'护士长到场核对身份、材料范围与次日办理安排。',1)];break;
    case 20:text='小李请你替他值一次夜班。他把自己的安排和排班表一起发来，说这次实在腾不开。';
      options=[o('a','接下夜班',{stamina:-20,san:-5,flags:['trolley-extra-night']},'你接下完整夜班，双方确认了具体日期和接诊安排。'),o('b','拒绝替班',{relations:{peer:-2}},'你没有接下夜班。小李说会再找人，之后没再回复。'),o('c','换他一个白班，先留时间交接',{flags:['trolley-shift-exchange']},'你们约定交换白班与夜班，明天先留时间完成交接。')];break;
  }
  const night=d.phases.includes('夜班')&&r.shiftPhase==='夜班';
  if(night)for(const option of options)if(option.ap>0&&option.minutes===0)option.minutes=option.ap*12;
  options.forEach(x=>{x.hint=[!night&&x.ap?`精力 ${x.ap}`:'',x.minutes?`时间 ${x.minutes} 分钟`:'',x.effects.cash?`${x.effects.cash>0?'到账':'支付'} ¥${Math.abs(x.effects.cash).toLocaleString('en-US')}`:''].filter(Boolean).join('；')||undefined;});
  if(n===5||n===18){options[0].cost=TROLLEY_DRUG_QUOTE;delete options[0].effects.cash;options[0].hint=`患者账单 +¥${medicationBill}；本次个人负担 ¥${gap.toLocaleString('en-US')}`;options[0].result='你开了药，药费计入这位患者的账单。你只需付这次新增的超支差额，先前已经付过的部分不再收取。';}
  return {id,kind:night?'night':'story',title:d.title,text,scope,patientId:p?.uid,actor:({1:'nurse',3:'research',8:'nurse',9:'chief',10:'rep',16:'peer',17:'nurse',20:'peer'}as Record<number,string>)[n],options,trolley:{sourceId:d.id,stage:1,patientIds:bound.map(p=>p.uid),tokenId:`${id}:echo`}};
}
export function trolleyEchoCard(r:Run,token:TrolleyToken):TrolleyCard {
  const d=TROLLEY_DEFINITIONS.find(d=>d.id===token.sourceId)!,id=`${token.id}:${token.stage}`,who=token.patientIds.map(id=>r.patients.find(p=>p.uid===id)?.name).filter(Boolean).join('与');
  const refusedShift=token.sourceId==='TROLLEY-20'&&token.choice==='b';
  const echo=refusedShift?'小李确认已经另找人顶班。上次你明确拒绝，没有约定由你接班；他想确认排班表上没有误写你的名字。':token.sourceId==='TROLLEY-9'&&token.choice==='b'?'主任拿来上次收回的处方，核对审核栏。你当时拒绝签字，这一栏没有你的签名。':token.sourceId==='TROLLEY-10'&&token.choice==='b'?'叶茗确认上次讲课邀约没有接受，也没有向你付款。家里又来询问押金准备得怎样。':d.echo;
  const last=token.stage===3,text=last?`${d.actor}送来${token.object}的最终核对件。${refusedShift?'你没有承担这次夜班，排班表按实际接班人登记。':''}${token.response==='review'?'上次逐项核对过的内容已经附在后面。':'上次未补充的内容仍留空，等待答复。'}${who?`材料仍对应${who}。`:''}`:`${echo}${who?`材料对应${who}。`:''}`;
  const options=last?[choice(`${id}:finish`,'核对收件范围，保存完整材料',{san:-2,flags:[`${token.sourceId}:closed`]},'材料已经收妥，原始记录与这次回复一起保存。',1)]:[choice(`${id}:review`,'带原始材料到场，逐项核对',{stamina:-3},'双方逐项核对了原始材料，已确认与仍有分歧的内容分别记下。',1),choice(`${id}:reserve`,'保留原件，暂不补充说明',{emotion:-5},'你保留原件，没有补充新的说明。对方把未答事项留在清单上。')];
  if(refusedShift&&!last){options[0].label='核对排班表，确认没有安排自己';options[0].result='排班表已核对，这次夜班由别人承担。你没有接下新的工作。';options[1].label='重申上次没有接班，暂不核对排班表';options[1].result='你重申自己没有同意替班，没有接受新的夜班安排。';}
  return {id,kind:'story',title:last?`${d.title} · 收件`:`${d.title} · 回访`,text,scope:token.scope,patientId:token.patientIds[0],options,trolley:{sourceId:token.sourceId,stage:token.stage,patientIds:token.patientIds,tokenId:token.id}};
}
export function emptyTrolleyLedger():TrolleyLedger{return{seen:[],commits:[],tokens:[]};}
export function pickTrolley(r:Run,phase:EventPhase,ledger:TrolleyLedger,world:TrolleyWorld):TrolleyCard|undefined {
  const pool=TROLLEY_DEFINITIONS.flatMap(d=>{if(ledger.seen.includes(d.id))return[];const bound=trolleyBindings(d,world,r);return bound?[{d,bound}]:[];});
  if(!pool.length)return;
  const chosen=pool[Math.floor(runRandom(r,`trolley:${r.day}:${phase}`)*pool.length)];return makeTrolleyCard(chosen.d,r,chosen.bound);
}
