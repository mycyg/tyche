/** Short character reactions, not a recording of the displayed dialogue. */
export const CHARACTER_VOICES:Record<string,{name:string;direction:string;reference:string;lines:readonly string[]}>= {
  hero:{name:'程医生',direction:'二十多岁的年轻女医生，清亮中音，略有疲惫但耐心，吐字自然，普通话。',reference:'嗯，让我看看。你慢慢说，不着急，我在听。有什么不舒服，可以从最开始的情况讲起。',lines:['嗯，让我看看。','我在听。','慢慢说，不着急。']},
  chief:{name:'唐济',direction:'五十岁男性科主任，低沉厚实的男中音，略沙哑，平稳克制，停顿有分量，普通话。',reference:'嗯，说吧。我听着呢。你把眼前的情况说清楚，我们再决定怎么安排。别急，接着说。',lines:['嗯，说吧。','我听着呢。','接着说。']},
  nurse:{name:'姜蓉',direction:'四十岁的护士长，明亮结实的女中音，语速利落，干练亲切，普通话，不尖细。',reference:'嗯，你说，我听着。慢慢说，别急，先把情况说清楚。有什么需要我帮忙的，直接告诉我。',lines:['嗯，你说。','我听着。','慢慢说，别急。']},
  peer:{name:'李恂',direction:'二十多岁男住院医，偏低的青年男声，松弛而疲倦，带轻微气声，随和，普通话。',reference:'嗯，我在呢。你接着说，我听着呢。今天事情有点多，让我缓一缓，你刚才说到哪里了？',lines:['嗯，我在呢。','你接着说。','我听着呢。']},
  research:{name:'周乔',direction:'三十岁科研女医生，冷静清晰的女中低音，音色偏冷，语句简洁，思考时停顿，普通话。',reference:'嗯，你说。我在听。等一下，我想想。先把这几个地方理清楚，再往后看，应该会更明白。',lines:['嗯，你说。','我在听。','等一下，我想想。']},
  rep:{name:'叶茗',direction:'三十岁女性医药代表，偏低温润的女声，声音带轻微笑意，说话圆润从容，有分寸，普通话。',reference:'嗯，您说，我听着呢。不急，慢慢说。您先把自己的想法讲完，我再说我这边的情况。',lines:['嗯，您说。','我听着呢。','不急，慢慢说。']},
  father:{name:'父亲',direction:'六十多岁父亲，年长男声，略有粗粝和鼻音，话少，语速偏慢，关心藏在语气中，普通话。',reference:'嗯，你说，我听着呢。慢慢说，别急。我这边听得清楚，你把话说完，不用担心我。',lines:['嗯，你说。','我听着呢。','慢慢说，别急。']},
  mother:{name:'母亲',direction:'六十岁母亲，柔和温暖的年长女声，略有沙感，亲切家常，尾音柔软，普通话。',reference:'哎，我听着呢。嗯，你说。别急，慢慢说，我这边没什么事，你放心把话说完。',lines:['哎，我听着呢。','嗯，你说。','别急，慢慢说。']},
  partner:{name:'伴侣',direction:'三十岁左右的成年伴侣，中性的中低音，温和亲近，家常交谈，略带疲惫，普通话，不使用播音腔。',reference:'嗯，我听着呢。你慢慢说，别急。我在这里。先把话说完，有什么事情，我们一起想办法。',lines:['嗯，我听着呢。','你慢慢说。','我在这里。']},
  auditor:{name:'医保稽核员',direction:'四十岁男性核查人员，清晰平直的男中音，吐字严谨，语气礼貌而疏离，普通话。',reference:'嗯，请说。请接着说，我在听。您可以按照发生的顺序说明，先说您能够确定的部分。',lines:['嗯，请说。','请接着说。','我在听。']},
  'patient-male':{name:'男性患者',direction:'普通成年男性，朴实的男中音，略有虚弱，语速舒缓，正常交谈，普通话。',reference:'嗯，医生。您说，我听着。让我想想，这件事情我还记得一些，等我慢慢说给您听。',lines:['嗯，医生。','您说，我听着。','让我想想。']},
  'patient-female':{name:'女性患者',direction:'普通成年女性，柔软的女中音，轻声慢说，略有迟疑，不夸张表演，普通话。',reference:'嗯，医生。您说，我听着。让我想想，我想把情况说清楚，有些地方我还得回忆一下。',lines:['嗯，医生。','您说，我听着。','让我想想。']},
  family:{name:'患者家属',direction:'成年家属，中性的中音声线，语气关切但克制，吐字清晰，普通话，不带播音腔。',reference:'嗯，医生。您请说，我听着呢。我们想把情况弄清楚，有什么需要说明的，您慢慢说。',lines:['嗯，医生。','您请说。','我听着呢。']},
};

export const characterVoiceId=(speaker:string,index:number)=>`reaction-${speaker}-${index+1}`;
export const CHARACTER_VOICE_CUES=Object.entries(CHARACTER_VOICES).flatMap(([speaker,actor])=>actor.lines.map((text,index)=>({id:characterVoiceId(speaker,index),speaker,text})));
