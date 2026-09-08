"""Design original character voices, then lock each to one synthetic reference.

Only fixed short reactions are rendered. No real-person voice sample is used.
A completed model-transfer manifest and its exact file hashes are required.
"""
from __future__ import annotations
import argparse,gc,hashlib,json,os,time
from pathlib import Path
import subprocess


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def atomic_json(path,value):
    temp=path.with_suffix('.partial.json');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');temp.replace(path)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--models',type=Path,required=True)
    parser.add_argument('--cast',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--only',default='')
    parser.add_argument('--take',type=int,default=0)
    args=parser.parse_args()
    models=json.loads(args.models.read_text());cast=json.loads(args.cast.read_text())
    if 'narrator' in cast:raise ValueError('Narration must stay silent')
    if any(not 2<=len(c['lines'])<=3 for c in cast.values()):raise ValueError('Each character needs 2–3 reactions')
    for model in models.values():
        root=Path(model['path'])
        for name,expected in model['files'].items():
            p=root/name
            if not p.is_file() or p.stat().st_size!=expected['bytes'] or digest(p)!=expected['sha256']:raise ValueError(f'Model checksum failed: {name}')
    import numpy as np
    import soundfile as sf
    import torch
    import imageio_ffmpeg
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available():raise RuntimeError('CUDA is required')
    torch.set_num_threads(8)
    args.output.mkdir(parents=True,exist_ok=True);refs=args.output/'references';refs.mkdir(exist_ok=True)
    manifest_file=args.output/'manifest.json';manifest=json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    selected=[(key,row) for key,row in cast.items() if not args.only or key in args.only.split(',')]
    generation={'temperature':.65,'top_k':30,'repetition_penalty':1.08,'max_new_tokens':1400}
    def load(kind):
        print(json.dumps({'phase':'load','model':models[kind]['model'],'gpu':torch.cuda.get_device_name(0)}),flush=True)
        return Qwen3TTSModel.from_pretrained(models[kind]['path'],device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    def valid_wave(wave,sample_rate,maximum):
        wave=np.asarray(wave,dtype=np.float32).reshape(-1)
        if not np.isfinite(wave).all() or not len(wave):raise ValueError('Invalid waveform')
        peak=float(np.max(np.abs(wave)))
        if peak<.002:raise ValueError('Silent waveform')
        audible=np.flatnonzero(np.abs(wave)>.001)
        pad=int(sample_rate*.10)
        if len(audible):wave=wave[max(0,int(audible[0])-pad):min(len(wave),int(audible[-1])+pad)]
        seconds=len(wave)/sample_rate
        if not .25<=seconds<=maximum:raise ValueError(f'Unexpected speech length: {seconds:.2f}')
        return wave,seconds,peak
    design=None
    for actor,row in selected:
        reference=refs/f'{actor}.wav';receipt=refs/f'{actor}.json'
        profile={'direction':row['direction'],'text':row['reference'],'model':models['VoiceDesign']['model'],'revision':models['VoiceDesign']['revision']}
        fingerprint=hashlib.sha256(json.dumps(profile,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        previous=json.loads(receipt.read_text()) if receipt.exists() else {}
        if reference.exists() and previous.get('profileSha256')==fingerprint and previous.get('sha256')==digest(reference):continue
        if design is None:design=load('VoiceDesign')
        torch.manual_seed(int(hashlib.sha256(actor.encode()).hexdigest()[:8],16))
        started=time.monotonic()
        with torch.inference_mode():
            waves,sr=design.generate_voice_design(text=row['reference'],language='Chinese',instruct=row['direction']+'自然交谈，只说给定文本，不添加词句。',**generation)
        wave,seconds,peak=valid_wave(waves[0],sr,35)
        sf.write(reference,wave,sr,subtype='PCM_24')
        atomic_json(receipt,{**profile,'profileSha256':fingerprint,'sha256':digest(reference),'seconds':seconds})
        print(json.dumps({'actor':actor,'phase':'reference-ready','seconds':round(seconds,2),'elapsed':round(time.monotonic()-started,1)}),flush=True)
    del design;gc.collect();torch.cuda.empty_cache()
    base=load('Base');ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    for actor,row in selected:
        reference=refs/f'{actor}.wav';reference_sha=digest(reference)
        prompt=None
        for index,text in enumerate(row['lines']):
            key=f'reaction-{actor}-{index+1}';target=args.output/f'{key}.mp3';old=manifest.get(key,{})
            if not args.take and target.exists() and old.get('sha256')==digest(target) and old.get('text')==text and old.get('referenceSha256')==reference_sha:continue
            if prompt is None:prompt=base.create_voice_clone_prompt(ref_audio=str(reference),ref_text=row['reference'])
            seed=int(hashlib.sha256((key+str(args.take)).encode()).hexdigest()[:8],16);torch.manual_seed(seed)
            started=time.monotonic()
            with torch.inference_mode():
                waves,sr=base.generate_voice_clone(text=text,language='Chinese',voice_clone_prompt=prompt,non_streaming_mode=True,**{**generation,'max_new_tokens':300})
            wave,seconds,peak=valid_wave(waves[0],sr,8)
            wav=args.output/f'{key}.wav';sf.write(wav,wave,sr,subtype='PCM_24')
            partial=target.with_suffix('.partial.mp3')
            subprocess.run([ffmpeg,'-v','error','-y','-i',str(wav),'-af','loudnorm=I=-19:TP=-2:LRA=7,afade=t=in:d=0.015','-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','80k',str(partial)],check=True)
            partial.replace(target)
            manifest[key]={'file':target.name,'text':text,'speaker':actor,'seconds':round(seconds,3),'sha256':digest(target),'textSha256':hashlib.sha256(text.encode()).hexdigest(),'referenceSha256':reference_sha,'direction':row['direction'],'renderer':'qwen-voice-design-and-clone-cuda','model':models['Base']['model'],'modelRevision':models['Base']['revision'],'voiceDesignRevision':models['VoiceDesign']['revision'],'gpu':torch.cuda.get_device_name(0),'seed':seed,'sourcePeak':round(peak,5),'qa':'signal-checked'}
            atomic_json(manifest_file,manifest)
            print(json.dumps({'id':key,'phase':'rendered','seconds':round(seconds,2),'elapsed':round(time.monotonic()-started,1)},ensure_ascii=False),flush=True)
    print('CHARACTER_VOICES_READY',flush=True)

if __name__=='__main__':main()
