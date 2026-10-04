import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export async function resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'sotto-test:env',shortCircuit:true};
 if(specifier==='next/headers')return {url:'sotto-test:headers',shortCircuit:true};
 if(specifier==='next/navigation')return {url:'sotto-test:navigation',shortCircuit:true};
 try{return await next(specifier,context);}catch(e){if(specifier.startsWith('.')){for(const extension of ['.ts','.tsx'])try{return await next(specifier+extension,context);}catch{}}throw e;}
}
export async function load(url,context,next){
 if(url==='sotto-test:env')return {format:'module',source:'export const env=globalThis.__sottoTest.env;',shortCircuit:true};
 if(url==='sotto-test:headers')return {format:'module',source:'export async function headers(){return globalThis.__sottoTest.headers;}',shortCircuit:true};
 if(url==='sotto-test:navigation')return {format:'module',source:'export function redirect(){throw new Error("Test redirect");}',shortCircuit:true};
 if(/\.tsx?$/.test(url)){const source=await readFile(fileURLToPath(url),'utf8');return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};}
 return next(url,context);
}
