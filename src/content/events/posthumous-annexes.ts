import type {Run}from '../../game/types';

/** Main endings in which the protagonist dies (contract §5.2). */
export const DEATH_ENDING_IDS=['END-09','END-12','END-15']as const;
export type DeathEndingId=typeof DEATH_ENDING_IDS[number];
export function isDeathEnding(id:string|undefined):id is DeathEndingId{return DEATH_ENDING_IDS.includes(id as DeathEndingId);}

/** Attachments that would give the deceased a future action of their own:
 * training or another base, follow-up visits, leaving or resigning, a
 * return to work. They are removed instead of rewritten. */
export const POSTHUMOUS_REMOVED_ATTACHMENTS=['X12','X18','X24','X26','X31','X35']as const;
/** Criminal-procedure attachments: the person's own participation ends with
 * the death; the case continues only against others. */
export const POSTHUMOUS_CRIMINAL_ATTACHMENTS=['X05','X08']as const;
export const CRIMINAL_CASE_TERMINATED='刑事案件因当事人死亡终止对其的追究，涉及他人的部分继续。';
const money=(n:number)=>`¥${Math.round(n).toLocaleString('zh-CN')}`;

export function posthumousAttachmentIds(ids:readonly string[]):string[]{
 return ids.filter(id=>!POSTHUMOUS_REMOVED_ATTACHMENTS.includes(id as never)&&!POSTHUMOUS_CRIMINAL_ATTACHMENTS.includes(id as never));
}

/** The decision of a retained attachment stays; its epilogue narrates the
 * protagonist's own later moment and is dropped. */
export function posthumousAttachmentText(title:string,decision:string):string{
 return `${title}\n${decision.replaceAll('你','原主管医师')}`;
}

/** Rewrites of the run-level notes produced by chainAnnexes. Lines about the
 * money already follow the contract table; anything that keeps the person
 * answering phones, training or repaying is removed. */
export function posthumousChainNote(note:string,r:Pick<Run,'receivable'|'privateDebt'>):string|undefined{
 if(note.startsWith('借给同事的钱'))return `借给同事的 ${money(r.receivable)} 由借款人交给家属，家属核对了借条上的姓名。`;
 if(note.startsWith('私人借款尚余'))return `私人借款尚余 ${money(r.privateDebt)}，由家属与债权人核对余额。`;
 if(note.includes('聘用文件')||note.includes('电话会先打到你'))return undefined;
 if(/^(卷宗整理|现场陈述)/.test(note))return CRIMINAL_CASE_TERMINATED;
 if(/仍欠你|顶班/.test(note))return note.replaceAll('你','原主管医师');
 return note;
}

/** Route closures: the doctor is named as the former attending, and answers
 * that are still owed pass to the department. */
export function posthumousClosureText(title:string,text:string,status:'resolved'|'pending'|'escalated'):string{
 const renamed=text.replaceAll('你们','双方').replaceAll('你','原主管医师');
 return `${title}\n${renamed}${status==='pending'&&!renamed.includes('由科室继续办理')?' 未完成的答复由科室继续办理。':''}`;
}

/** Compensation detail without a personal repayment schedule. */
export function posthumousLiabilityNote(name:string,loss:number,levelName:string,hospitalCompensation:number,personalRecovery:number):string{
 return `医疗损害赔偿明细\n${name}：总损失 ${money(loss)}；医院按${levelName}责任承担 ${money(hospitalCompensation)}。${personalRecovery?'个人追偿部分按遗产与医院内部安排另行处理。':'已购医责险承担个人追偿部分。'}`;
}

/** Notes that exist only after a death: unpaid balances and the patients who
 * pass to the next shift. */
export function posthumousStandingNotes(r:Pick<Run,'debt'|'privateDebt'|'patients'>):string[]{
 const notes:string[]=[];
 if(r.debt>0)notes.push(`银行借贷尚余 ${money(r.debt)}，未清偿的款项按遗产与担保关系另行处理。`);
 const inpatients=r.patients.filter(p=>p.active&&p.inpatient&&p.damage<3);
 if(inpatients.length)notes.push(`在床的 ${inpatients.length} 名患者由下一班接手，未完成的处置按交接记录继续。`);
 return notes;
}

/** Phrases that must not appear in any attachment of a death ending. */
export const POSTHUMOUS_FORBIDDEN=[/求职|招聘|新工作|入职|试用期/,/服刑|报到要经过|注销手续/,/接电话|打到你|答复.*由你|你继续/,/复岗|培训登记|培训基地|补充考核|延长轮转/,/绩效扣至|每月.*扣还|还款计划/,/康复|复诊|复查日期|随访安排/];
export function violatesPosthumousRules(text:string):boolean{return POSTHUMOUS_FORBIDDEN.some(re=>re.test(text));}
