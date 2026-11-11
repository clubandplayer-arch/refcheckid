import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,lstat,readlink,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const route=path.join(root,'refcheckid-web/.next/server/app/api/[...path]/route.js');
const trace=JSON.parse(await readFile(`${route}.nft.json`,'utf8'));
for(const name of ['sharp','exceljs','/pg/'])assert(trace.files.some((file)=>file.includes(name)),`Missing runtime dependency: ${name}`);
const output=await mkdtemp(path.join(tmpdir(),'refcheckid-cloud-trace-'));
for(const file of [...trace.files,'route.js']){
  const source=path.resolve(path.dirname(route),file);const relative=path.relative(root,source);assert(!relative.startsWith('..'),`Trace outside repository: ${relative}`);
  const destination=path.join(output,relative);await mkdir(path.dirname(destination),{recursive:true});const info=await lstat(source);
  if(info.isSymbolicLink()){let target=await readlink(source);if(path.isAbsolute(target)){const relativeTarget=path.relative(root,target);assert(!relativeTarget.startsWith('..'));target=path.relative(path.dirname(destination),path.join(output,relativeTarget));}try{await symlink(target,destination);}catch(error){if(error.code!=='EEXIST')throw error;}}
  else if(info.isFile())await copyFile(source,destination);
}
const harness=String.raw`
const assert=require('node:assert/strict');const Module=require('node:module');const fs=require('node:fs/promises');const path=require('node:path');const {createHash}=require('node:crypto');
(async()=>{
 const backendRequire=Module.createRequire(process.env.BUNDLE_HARNESS_PACKAGE);const {PGlite}=backendRequire('@electric-sql/pglite');const {Workbook}=backendRequire('exceljs');const db=new PGlite();
 await db.exec("CREATE SCHEMA refcheckid; CREATE TABLE refcheckid.entities(repository text,id text,document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND document->>'id'=id),ordinal bigint GENERATED ALWAYS AS IDENTITY,PRIMARY KEY(repository,id));");
 const federationId='71000000-0000-4000-8000-000000000001',actorId='91000000-0000-4000-8000-000000000001',providerId='11000000-0000-4000-8000-000000000001';
 for(const [table,id,data]of[['federations',federationId,{id:federationId,name:'Bundle federation',status:'active'}],['auth_profiles',providerId,{id:providerId,actorId,email:'bundle@example.invalid',displayName:'Bundle operator',role:'federation',enabled:true,federationIds:[federationId]}]])await db.query('INSERT INTO refcheckid.entities(repository,id,document) VALUES($1,$2,$3::jsonb)',[table,id,JSON.stringify(data)]);
 const statements=[];const nativeLoad=Module._load;class Pool{on(){} async connect(){return{query:this.query.bind(this),release(){}}}async query(sql,args){statements.push(sql);if(sql.includes('pg_advisory_xact_lock'))return{rows:[],rowCount:0};return db.query(sql,args);}async end(){}}
 Module._load=function(name,parent,isMain){if(name==='pg')return{Pool};return nativeLoad.apply(this,arguments);};
 global.__RefcheckidTestPool=Pool;const hooks=Module.registerHooks({resolve(specifier,context,next){if(specifier==='pg')return{url:'data:text/javascript,export const Pool=globalThis.__RefcheckidTestPool;export default {Pool};',shortCircuit:true};return next(specifier,context);}});
 const objects=new Map();let uploadKey='';
 global.fetch=async(input,init={})=>{
  const url=new URL(String(input));assert.equal(url.hostname,'test.supabase.co','Unexpected outbound request');
  if(url.pathname==='/auth/v1/user'){assert.equal(new Headers(init.headers).get('authorization'),'Bearer bundle-test-token');return Response.json({id:providerId});}
  const sign='/storage/v1/object/upload/sign/';if(url.pathname.startsWith(sign)){uploadKey=decodeURIComponent(url.pathname.slice(sign.length));return Response.json({url:'/object/upload/sign/'+url.pathname.slice(sign.length)+'?token=synthetic'});}
  const prefix='/storage/v1/object/';if(url.pathname.startsWith(prefix)){const key=decodeURIComponent(url.pathname.slice(prefix.length));if(init.method==='POST'){assert(!objects.has(key),'Immutable storage object overwritten');objects.set(key,Buffer.from(init.body));return Response.json({ok:true});}const bytes=objects.get(key);return bytes?new Response(bytes):Response.json({error:'not found'},{status:404});}
  throw new Error('Unexpected provider path: '+url.pathname);
 };
 const packaged=(await require(path.resolve('refcheckid-web/.next/server/app/api/[...path]/route.js'))).routeModule.userland;
 async function api(method,endpoint,body){const request=new Request('https://local.invalid/api/v1/platform/'+endpoint,{method,headers:{authorization:'Bearer bundle-test-token','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const response=await packaged[method](request);const value=await response.json();assert(response.status<300,endpoint+': '+response.status+' '+JSON.stringify(value));return value;}
 try{
  const org=await api('POST','organizations',{name:'Packaged organization',kind:'sports',federationId});
  const workbook=new Workbook();workbook.addWorksheet('Società').addRows([['code','name'],['PACK','Società dal pacchetto Next']]);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
  const upload=await api('POST','imports/upload',{organizationId:org.id,unitId:org.rootUnitId,kind:'clubs',filename:'clubs.xlsx',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});objects.set(uploadKey,bytes);
  let job=await api('POST','imports/prepare',{uploadId:upload.id});assert.equal(job.status,'validating');job=await api('POST','imports/'+job.id+'/advance',{action:'advance'});assert.equal(job.errors,0);assert.equal(job.status,'preview');await api('POST','imports/'+job.id+'/advance',{action:'commit'});job=await api('POST','imports/'+job.id+'/advance',{action:'advance'});assert.equal(job.status,'completed');
  const clubs=await api('GET','entities/clubs?organizationId='+org.id+'&unitId='+org.rootUnitId);assert.equal(clubs.items.length,1);assert.equal(clubs.items[0].name,'Società dal pacchetto Next');
  const roster=Buffer.from(['code;first_name;last_name;birth_date;club_code;season',...Array.from({length:100},(_,i)=>'PACK-P'+i+';Player;'+i+';2005-01-01;PACK;2026/2027')].join('\n'));
  const rosterUpload=await api('POST','imports/upload',{organizationId:org.id,unitId:org.rootUnitId,kind:'players',filename:'players.csv',size:roster.length,sha256:createHash('sha256').update(roster).digest('hex')});objects.set(uploadKey,roster);
  let playerJob=await api('POST','imports/prepare',{uploadId:rosterUpload.id});playerJob=await api('POST','imports/'+playerJob.id+'/advance',{action:'advance'});assert.equal(playerJob.errors,0);await api('POST','imports/'+playerJob.id+'/advance',{action:'commit'});
  const before=statements.length;playerJob=await api('POST','imports/'+playerJob.id+'/advance',{action:'advance'});assert.equal(playerJob.processed,100);const batchStatements=statements.slice(before);assert(batchStatements.filter(sql=>sql.startsWith('SELECT')).length<40,'Import performed per-row PostgreSQL reads');assert.equal(batchStatements.filter(sql=>sql.startsWith('INSERT INTO refcheckid.entities(repository,id,document) SELECT')).length,1);
  const people=await api('GET','entities/people?organizationId='+org.id+'&unitId='+org.rootUnitId);assert.equal(people.total,100);assert.equal(people.items.length,50);assert(people.nextCursor);
  console.log('PASS: Isolated Next cloud API loads Sharp/ExcelJS/PG, imports private XLSX and 100 players with one batch write, and pages PostgreSQL results.');
 }finally{hooks.deregister();Module._load=nativeLoad;delete global.__RefcheckidTestPool;await db.close();}
})().catch((error)=>{console.error(error);process.exitCode=1;});
`;
const entry=path.join(output,'harness.cjs');await writeFile(entry,harness);
const result=spawnSync(process.execPath,[entry],{cwd:output,encoding:'utf8',timeout:60000,env:{...process.env,NODE_PATH:'',NODE_ENV:'production',REFCHECKID_RUNTIME:'supabase',REFCHECKID_DATA_ENV:'staging',VERCEL_ENV:'production',DATABASE_URL:'postgresql://postgres.test:synthetic@localhost/postgres?sslmode=verify-full',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVER_KEY:'sb_secret_synthetic_fixture',AUTH_SECRET:'bundle-test-secret-longer-than-thirty-two-characters',BUNDLE_HARNESS_PACKAGE:path.join(root,'refcheckid-backend/package.json')}});
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');assert.equal(result.status,0,result.error?.message??'Traced cloud bundle verification failed.');console.log(`Isolated artifact: ${output}`);
