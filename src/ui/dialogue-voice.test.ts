import {describe,it,expect}from 'vitest';
import {dialogueSegments}from './dialogue-voice';

describe('dialogue voice follows the speaker, not the portrait',()=>{
 it('keeps a chief portrait from reading third-person stage directions',()=>{
  const text='主任推开门：“病历写完了吗？”他拉开椅子坐下。';
  expect(dialogueSegments(text,'chief')).toEqual([
   {text:'主任推开门：',speaker:'narrator'},
   {text:'“病历写完了吗？”',speaker:'chief'},
   {text:'他拉开椅子坐下。',speaker:'narrator'},
  ]);
 });
 it('switches speakers within a scene without dropping words',()=>{
  const text='护士长说：“先坐下。”你问护士长：“其他患者怎么办？”母亲说：“我来接你。”';
  const segments=dialogueSegments(text,'nurse');
  expect(segments.map(s=>s.speaker)).toEqual(['narrator','nurse','narrator','hero','narrator','mother']);
  expect(segments.map(s=>s.text).join('')).toBe(text);
 });
 it('does not turn quoted diagnoses or written records into dialogue',()=>{
  const text='你在病历里写了“重症肺炎待排”。主任把“临床必要”四个字圈了出来。';
  expect(dialogueSegments(text,'chief')).toEqual([{text,speaker:'narrator'}]);
 });
 it('uses the greeting actor for an entirely spoken line',()=>{
  expect(dialogueSegments('“先看当班待办。别漏了交接。”','nurse')).toEqual([{text:'“先看当班待办。别漏了交接。”',speaker:'nurse'}]);
 });
 it('voices a quotation after a named character gesture',()=>{
  const parts=dialogueSegments('李恂把排班表推过来。「今晚能替我两小时吗？」','peer');
  expect(parts.map(s=>s.speaker)).toEqual(['narrator','peer']);
  const written=dialogueSegments('主任读了报告。“双肺呼吸音清。”','chief');
  expect(written.every(s=>s.speaker==='narrator')).toBe(true);
 });
 it('does not infer an actor for unattributed quotation or plain narrative',()=>{
  expect(dialogueSegments('对方写着“包录用”。','rep')[0].speaker).toBe('narrator');
  expect(dialogueSegments('护士长把手机收好。','nurse')[0].speaker).toBe('narrator');
 });
 it('keeps a guardian voice separate from the patient sex',()=>{
  expect(dialogueSegments('患儿，七岁，女。\n父亲：「产检的事我知道得不全。」','patient-female')).toEqual([
   {text:'患儿，七岁，女。\n父亲：',speaker:'narrator'},
   {text:'「产检的事我知道得不全。」',speaker:'father'},
  ]);
  expect(dialogueSegments('外婆：「她妈上班去了。」','patient-male').at(-1)?.speaker).toBe('mother');
  expect(dialogueSegments('儿子：「我爸的药我也记不全。」','patient-female').at(-1)?.speaker).toBe('patient-male');
 });
 it('reads the patient’s standalone quoted line after a chart summary as speech',()=>{
  const text='林某，三十五岁，男。\n支付方式：居民医保。\n「我现在还疼，能不能再看看？」';
  const parts=dialogueSegments(text,'patient-male');
  expect(parts.at(-1)?.speaker).toBe('patient-male');expect(parts.map(p=>p.text).join('')).toBe(text);
  expect(dialogueSegments('报告写着“未见异常”。','patient-male')[0].speaker).toBe('narrator');
 });
 it('switches from the doctor’s opening explanation to the father’s reply',()=>{
  const text='「药我们现在就用。」父亲看了看奶奶，「……抽吧。」';
  expect(dialogueSegments(text,'hero')).toEqual([
   {text:'「药我们现在就用。」',speaker:'hero'},
   {text:'父亲看了看奶奶，',speaker:'narrator'},
   {text:'「……抽吧。」',speaker:'father'},
  ]);
 });
});
