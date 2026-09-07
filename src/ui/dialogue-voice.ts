export interface SpeechSegment {text:string;speaker:string}

const roles:Record<string,string>={
  你:'hero',主任:'chief',唐济:'chief',护士长:'nurse',护士:'nurse',姜蓉:'nurse',
  母亲:'mother',妈妈:'mother',父亲:'father',爸爸:'father',药代:'rep',叶茗:'rep',
  李恂:'peer',同事:'peer',同年住院医:'peer',周乔:'research',家属:'family',患者女儿:'family',患者儿子:'family',
  外婆:'mother',奶奶:'mother',祖母:'mother',婆婆:'mother',外公:'father',爷爷:'father',祖父:'father',
  妻子:'family',女儿:'family',孙女:'family',丈夫:'patient-male',儿子:'patient-male',孙子:'patient-male',
  老师:'family',教练:'family',老板:'family',工友:'family',包工头:'family',同学:'family',护工:'family',保姆:'family',助理:'family',配偶:'family',
};
const subject=new RegExp(`^(?:${[...Object.keys(roles),'患者','他','她'].sort((a,b)=>b.length-a.length).join('|')})`);

/** Portrait presence does not make the whole scene a spoken line. Only an
 * attributed quotation (or an entirely quoted greeting) uses a character voice.
 * Written diagnoses, button names and unattributed quotes remain narration. */
export function dialogueSegments(text:string,actor='narrator'):SpeechSegment[] {
  if(!text.trim())return [];
  if(/^(?:“[^“”]*”|「[^「」]*」)[。！？!?\s]*$/.test(text.trim()))return [{text,speaker:actor}];
  const segments:SpeechSegment[]=[];
  const append=(value:string,speaker:string)=>{
    if(!value)return;
    const previous=segments.at(-1);
    if(previous?.speaker===speaker)previous.text+=value;
    else segments.push({text:value,speaker});
  };
  let offset=0;
  for(const match of text.matchAll(/“[^“”]*”|「[^「」]*」/g)){
    const index=match.index!,prefix=text.slice(offset,index);
    append(prefix,'narrator');
    const clauses=prefix.split(/[。！？!?\n]/).map(s=>s.trim()).filter(Boolean);
    const afterStage=/[。！？!?]\s*$/.test(prefix);
    const clause=(clauses.at(-1)??'').split('，').map(s=>s.trim()).filter(Boolean).at(-1)??'';
    const who=clause.match(subject)?.[0];
    const written=/(?:病历|报告|表格|清单|交班本|处方|诊断|文件|纸上|条款|屏幕).*(?:写|填|显示|印|改|记|是|为)|(?:读|念|写着|印着|显示)/.test(clause);
    const says=/(?:说|问|喊|答|回|叮嘱|抱怨|解释|提醒|劝|嘟囔|嘀咕|[：:])[^。！？!?“”「」]{0,12}$/.test(clause);
    // A patient's own quoted line follows the chart summary on its own line.
    // It has no named subject; the preceding insurance label is not its speaker.
    const patientLine=actor.startsWith('patient-')&&/(?:^|\n)\s*$/.test(prefix)&&/^\s*(?:\n|$)/.test(text.slice(index+match[0].length));
    const startsWithSpeech=index===0&&!prefix.trim();
    const afterGesture=/[，：:]\s*$/.test(prefix);
    const speaker=patientLine||startsWithSpeech?actor:!written&&(says||afterStage||afterGesture)&&who?(roles[who]??(['他','她','患者'].includes(who)?actor:'narrator')):'narrator';
    append(match[0],speaker);offset=index+match[0].length;
  }
  append(text.slice(offset),'narrator');
  return segments;
}
