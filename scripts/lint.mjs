import ts from 'typescript';
import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const errors=[];
for(const name of await readdir('src')){
 if(!name.endsWith('.ts'))continue;
 const path='src/'+name,text=await readFile(path,'utf8'),file=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
 const report=(node,message)=>{const pos=file.getLineAndCharacterOfPosition(node.getStart());errors.push(`${path}:${pos.line+1}: ${message}`);};
 function visit(node){
  if(node.kind===ts.SyntaxKind.AnyKeyword)report(node,'Do not use any');
  if(ts.isAsExpression(node)&&!(ts.isTypeReferenceNode(node.type)&&ts.isIdentifier(node.type.typeName)&&node.type.typeName.text==='const'))report(node,'Avoid unchecked type assertions');
  if(ts.isNonNullExpression(node))report(node,'Do not use non-null assertions');
  if(ts.isDebuggerStatement(node))report(node,'Remove debugger');
  if(ts.isCatchClause(node)&&node.block.statements.length===0)report(node,'Do not swallow errors');
  ts.forEachChild(node,visit);
 }
 visit(file);
 if(/@ts-(ignore|nocheck)/.test(text))errors.push(`${path}: Type suppression`);
}
for(const dir of ['scripts','tests'])for(const file of await readdir(dir)){if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',`${dir}/${file}`]);}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('AST safety lint and JavaScript syntax checks passed. Unused code checked by TypeScript.');
