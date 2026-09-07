import ts from 'typescript';

const internalProperties=new Set([
 'id','next','flags','clear','when','source','raw','reason','basis','norm','causal','requires','trigger','qualifiers',
 'emittedFacts','requiredQualifiers','facts','knownBy','until','target','phase','phases','period','periods','category','scopeKind',
]);
const internalNames=new Set(['legacyFacts','factsFor','contextFor','clinicalFlags','skipNames','internalProperties','internalNames','roles','subject','digits']);
const hiddenName=(name:string)=>internalNames.has(name)||internalProperties.has(name)||/(?:Flags|Facts)$|(?:^|_)(?:FLAGS|FACTS)(?:_|$)/.test(name);
const queries=new Set(['has','have','any','actual','includes','startsWith','endsWith','indexOf','lastIndexOf','get','delete','pickPreset','compatibleEntities','sourcePatient','chooseBinding','settleAuthoredEvents','buildSourceFollowups']);
const comparisons=new Set([ts.SyntaxKind.EqualsEqualsToken,ts.SyntaxKind.EqualsEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken,ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.InKeyword]);
const nameOf=(name:ts.PropertyName|ts.BindingName)=>ts.isIdentifier(name)||ts.isStringLiteral(name)?name.text:name.getText();

function internal(node:ts.Node):boolean {
 for(let child=node,parent=node.parent;parent;child=parent,parent=parent.parent){
  if(ts.isTypeNode(parent)||ts.isImportDeclaration(parent)||ts.isExportDeclaration(parent)||ts.isCaseClause(parent)&&parent.expression===child)return true;
  if(ts.isPropertyAssignment(parent)&&(parent.name===child||internalProperties.has(nameOf(parent.name))))return true;
  if(ts.isVariableDeclaration(parent)&&hiddenName(nameOf(parent.name)))return true;
  if(ts.isFunctionDeclaration(parent)&&parent.name&&internalNames.has(parent.name.text))return true;
  if(ts.isElementAccessExpression(parent)&&parent.argumentExpression===child)return true;
  if(ts.isBinaryExpression(parent)&&comparisons.has(parent.operatorToken.kind))return true;
  if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(parent.left)&&internalProperties.has(parent.left.name.text))return true;
  if(ts.isConditionalExpression(parent)&&parent.condition===child||ts.isIfStatement(parent)&&parent.expression===child)return true;
  if(ts.isThrowStatement(parent)||ts.isNewExpression(parent)&&/^(?:Error|TypeError|RangeError|RegExp)$/.test(parent.expression.getText()))return true;
  if(ts.isCallExpression(parent)){
   const method=ts.isPropertyAccessExpression(parent.expression)?parent.expression.name.text:parent.expression.getText();
   if(queries.has(method))return true;
   if(['replace','replaceAll','split','search','match','set'].includes(method)&&parent.arguments[0]===child)return true;
   if(ts.isPropertyAccessExpression(parent.expression)&&ts.isIdentifier(parent.expression.expression)&&parent.expression.expression.text==='console')return true;
  }
 }
 return false;
}

/** Extract runtime copy and interpolation fragments, not condition keys or
 * exception messages. Typed content catalogs are collected through their public
 * projection separately; this pass supplies UI and dynamic receipt vocabulary. */
export function visibleSourceText(code:string,filename:string):{text:string;actor?:string}[]{
 const file=ts.createSourceFile(filename,code,ts.ScriptTarget.Latest,true,filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const found:{text:string;actor?:string}[]=[];
 const visit=(node:ts.Node)=>{
  if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))&&/[\p{Script=Han}]/u.test(node.text)&&!internal(node)){
   let actor:string|undefined;
   const parent=node.parent;
   if(ts.isCallExpression(parent)&&parent.expression.getText()==='narrate'&&parent.arguments[0]===node&&parent.arguments[1]&&ts.isStringLiteral(parent.arguments[1]))actor=parent.arguments[1].text;
   // Replacement backreferences are placeholders, not spoken dollar amounts.
   for(const text of node.text.split(/\$\d+/))if(/[\p{Script=Han}]/u.test(text))found.push({text,...(actor?{actor}:{})});
  }
  ts.forEachChild(node,visit);
 };
 visit(file);return found;
}
