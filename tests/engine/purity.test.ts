import {describe,it,expect}from 'vitest';
import {readFileSync,readdirSync}from 'node:fs';
import {resolve,dirname,relative}from 'node:path';
import ts from 'typescript';
import {act,newMeta,startRun,currentCard,availableOptions}from '../../src/game/engine';

describe('runtime boundary',()=>{
  it('has no DOM, renderer, timer, clock or unseeded random dependency',()=>{
    const root=resolve('src'),seen=new Set<string>(),problems:string[]=[];
    const visitFile=(file:string)=>{
      if(seen.has(file)||!file.endsWith('.ts')||file.endsWith('.d.ts'))return;seen.add(file);
      const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      const visit=(node:ts.Node)=>{
        if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
          const spec=node.moduleSpecifier;
          if(spec&&ts.isStringLiteral(spec)){
            const name=spec.text;
            if(!name.startsWith('.'))problems.push(`${relative(root,file)} imports ${name}`);
            else{
              const resolved=ts.resolveModuleName(name,file,{moduleResolution:ts.ModuleResolutionKind.Bundler,resolveJsonModule:true},ts.sys).resolvedModule?.resolvedFileName;
              if(!resolved)problems.push(`${file}: unresolved ${name}`);
              else if(/[/\\](ui|world|scripts)[/\\]/.test(resolved))problems.push(`${relative(root,file)} imports renderer/tool ${name}`);
              else visitFile(resolved);
            }
          }
        }
        // Property names such as RULES.performance are data, not global APIs.
        // The root of a property access (performance.now) is still checked.
        const dataProperty=ts.isIdentifier(node)&&(
          ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node||
          (ts.isPropertyAssignment(node.parent)||ts.isPropertySignature(node.parent))&&node.parent.name===node
        );
        if(ts.isIdentifier(node)&&!dataProperty&&['window','document','localStorage','sessionStorage','Date','performance','requestAnimationFrame','setTimeout','setInterval','crypto'].includes(node.text))problems.push(`${relative(root,file)} uses ${node.text}`);
        if(ts.isPropertyAccessExpression(node)&&node.expression.getText(ast)==='Math'&&node.name.text==='random')problems.push(`${relative(root,file)} uses Math.random`);
        if(ts.isElementAccessExpression(node)&&node.expression.getText(ast)==='Math'&&node.argumentExpression.getText(ast).replace(/['"]/g,'')==='random')problems.push(`${relative(root,file)} uses Math[random]`);
        ts.forEachChild(node,visit);
      };visit(ast);
    };
    for(const file of readdirSync(resolve(root,'game')).filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts')))visitFile(resolve(root,'game',file));
    expect(problems).toEqual([]);expect(seen.size).toBeGreaterThan(20);
  });
  it('accepts host instance identity without altering seeded initial care',()=>{
    const a=startRun('identity-proof','程医生',['T06','T16','T24'],newMeta(),'rotation','instance-a');
    const b=startRun('identity-proof','程医生',['T06','T16','T24'],newMeta(),'rotation','instance-b');
    const normalize=(r:typeof a)=>JSON.parse(JSON.stringify(r).replaceAll(r.id,'INSTANCE'));
    expect(normalize(a)).toEqual(normalize(b));
    const ca=currentCard(a)!,cb=currentCard(b)!;
    expect(ca.title).toBe(cb.title);
    const nextA=act(a,{type:'choose',id:availableOptions(a)[0].id});
    const nextB=act(b,{type:'choose',id:availableOptions(b)[0].id});
    expect(normalize(nextA)).toEqual(normalize(nextB));
  });
});
