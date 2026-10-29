// Plafond volontairement sous la limite Hobby (12 fonctions serveur).
import fs from 'node:fs/promises';
import path from 'node:path';

export const SERVERLESS_FUNCTION_LIMIT=10;
const ROOTS=['api',path.join('pages','api')];
const EXTENSIONS=new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx','.mts','.cts','.py','.go','.rb']);

export async function listServerlessFunctions(cwd=process.cwd()){
 const files=[];
 for(const root of ROOTS)await walk(path.join(cwd,root),cwd,files);
 files.sort();
 return files;
}

async function walk(dir,cwd,files){
 let entries;
 try{entries=await fs.readdir(dir,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return;throw e}
 for(const entry of entries){
  if(entry.name==='node_modules'||entry.name==='__pycache__'||entry.name.startsWith('.'))continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())await walk(full,cwd,files);
  else if(EXTENSIONS.has(path.extname(entry.name))&&!entry.name.endsWith('.d.ts'))files.push(path.relative(cwd,full).split(path.sep).join('/'));
 }
}

export async function assertServerlessBudget(cwd=process.cwd()){
 const files=await listServerlessFunctions(cwd);
 if(files.length>SERVERLESS_FUNCTION_LIMIT)throw new Error(`Trop de fonctions serveur (${files.length}, plafond ${SERVERLESS_FUNCTION_LIMIT}). Vercel Hobby en autorise 12. ${files.join(', ')}`);
 return files;
}
