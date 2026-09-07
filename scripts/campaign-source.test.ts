import {it,expect}from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync}from 'node:fs';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {sourceHash}from './audit-routes';

it('keeps campaign identity when only a test or generated cache changes',()=>{
 const root=mkdtempSync(join(tmpdir(),'tyche-source-'));
 try{
  mkdirSync(join(root,'src'));mkdirSync(join(root,'scripts'));writeFileSync(join(root,'package-lock.json'),'{}');
  writeFileSync(join(root,'src','engine.ts'),'export const day=1;');const before=sourceHash(root);
  writeFileSync(join(root,'src','engine.test.ts'),'test fixture');mkdirSync(join(root,'scripts','__pycache__'));writeFileSync(join(root,'scripts','__pycache__','compiled.pyc'),'generated');
  expect(sourceHash(root)).toBe(before);
  writeFileSync(join(root,'src','engine.ts'),'export const day=2;');expect(sourceHash(root)).not.toBe(before);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('retains content, generator and dependency changes in campaign identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'tyche-source-'));
 try{
  mkdirSync(join(root,'src'));mkdirSync(join(root,'scripts'));writeFileSync(join(root,'package-lock.json'),'{}');
  const original=sourceHash(root);writeFileSync(join(root,'src','events.json'),'[]');const content=sourceHash(root);expect(content).not.toBe(original);
  writeFileSync(join(root,'scripts','route-plans.ts'),'export const plan=[];');const generator=sourceHash(root);expect(generator).not.toBe(content);
  writeFileSync(join(root,'package-lock.json'),'{"lockfileVersion":3}');expect(sourceHash(root)).not.toBe(generator);
 }finally{rmSync(root,{recursive:true,force:true});}
});
