import type {Card,Effects,Option,Run}from '../../game/types';
import {authoredCashPressure}from './pressure';
export const RECONTACT_SOURCE={id:'03:2.6:recontact',path:'03_主线与支线.md',section:'2.6',sha256:'aeeb248872a44ff1e136c31522ea01104dea07324be2fcc96421d5ce90774ee0'}as const;
export const RECONTACT_STAGE_FLAGS=['药代-0搭话','药代-1餐叙','药代-2讲课费','药代-3挂名','药代-4统方','药代-5回扣']as const;
export interface RepresentativeRecontactCard extends Card {representativeRecontact:{stage:number;priorChoiceId:string;due:number}}
export const RECONTACT_FEES=[0,0,3000,5000,8000,6000]as const;
const titles=['又一条工作消息','科室聚餐','讲课邀请','会议上的署名','处方明细','本周的结算'];
const texts=[
 '叶茗发来消息：「上回的事就不提了。以后有科室活动，我还能给你发个通知吗？」',
 '叶茗问你今晚有没有空：「科里几个人一起吃饭，唐主任也来。给你留个位置？」',
 '叶茗发来一份科内讲课通知：「这场讲课费三千。题目和课件发你，你看看，能接吗？」',
 '叶茗发来学术会议的资料：「这篇综述挂个名，五千元。材料都准备好了，不用你从头写。」',
 '叶茗在消息里列出想要的处方明细：「这些从系统里能导出来吧？八千元，麻烦你帮个忙。」',
 '叶茗把一张处方量汇总表推到你面前：「这周算下来六千。以后也按这个办法，每周结一次。」',
];
export const RECONTACT_PROSE={titles,texts};
export function makeRepresentativeRecontact(r:Run,stage:number,priorChoiceId:string,due:number):RepresentativeRecontactCard{
 if(!Number.isInteger(stage)||stage<0||stage>5)throw new Error('Invalid representative stage');
 const id=`${r.id}:REP-RECONTACT:${stage}:${due}:${priorChoiceId}`,flag=RECONTACT_STAGE_FLAGS[stage],cash=RECONTACT_FEES[stage];
 const accepted:Effects={flags:[flag,`rep-recontact-accepted:${id}`],...(cash?{cash}:{}),...(stage===1?{emotion:5}:{}),...(stage===2?{san:r.talents.includes('T28')?0:-10}:{}),...(stage===3?{flags:[flag,'research-conference-credit',`rep-recontact-accepted:${id}`]}:{})};
 const accept:Option={id:`${id}:accept`,label:stage===0?'同意保留工作联系':stage===1?'参加这次聚餐':stage===2?'接受这场讲课与三千元报酬':stage===3?'接受挂名与五千元报酬':stage===4?'交出这份处方明细，收取八千元':'接受按处方量结算，收取本周六千元',ap:0,minutes:0,cost:0,effects:accepted,result:stage===0?'你回复说可以。叶茗回了一个笑脸，没再提别的事。':stage===1?'你按约去了饭店。叶茗在门口招手，把你领到留好的座位上。':stage===2?'讲课结束后，叶茗向你道谢。手机随后弹出三千元到账的通知。':stage===3?'你同意署名，回传了自己的姓名和单位。五千元随后到账。':stage===4?'你把导出的处方明细发给叶茗。她确认收到后，转来八千元。':'你核对汇总表，收下本周的六千元。叶茗说，下周再联系。'};
 const refuse:Option={id:`${id}:refuse`,label:stage===0?'请她别再发邀约':'明确拒绝这次邀请',ap:0,minutes:0,cost:0,effects:{flags:['药代-拒绝',`rep-recontact-refused:${id}`]},result:stage===0?'你请她别再发这些邀请。过了一会儿，叶茗回了两个字：「好的。」':'你说这次不参加，叶茗没有再追问。',...(stage>0?{check:{skill:'persuade' as const,dc:[0,9,11,13,15,16][stage]+(stage>=2?Math.floor(authoredCashPressure(r)/20):0),purpose:'明确拒绝本次条件',failure:{emotion:stage>=2?-15:0,flags:['药代-拒绝',`rep-recontact-refused:${id}`]},failureText:'叶茗又劝了好一会儿。你始终没有答应，结束谈话时只觉得疲惫。'}}:{})};
 const options=[accept,refuse];
 if([2,3].includes(stage)&&!r.talents.includes('T28'))options.push({id:`${id}:department`,label:`把本次报酬与现有余额 ¥${Math.max(0,r.cash).toLocaleString('zh-CN')} 全部交科室`,ap:0,minutes:0,cost:0,effects:{cash:-Math.max(0,r.cash),reputation:5,relations:{chief:1},flags:['药代-上交',`rep-recontact-department:${id}`]},result:`这次${cash.toLocaleString('zh-CN')}元报酬直接交给科室，你又把自己现有的${Math.max(0,r.cash).toLocaleString('zh-CN')}元也交了过去，两笔钱分别登记。这轮不再接受药代的后续条件。`});
 return{id,kind:'story',shiftPhase:'结算',actor:'rep',chain:'REP-RECONTACT',scope:{kind:'project',id:`${r.id}:representative-account`},title:titles[stage],text:texts[stage],options,representativeRecontact:{stage,priorChoiceId,due}};
}
