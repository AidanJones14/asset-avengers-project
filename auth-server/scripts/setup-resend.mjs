#!/usr/bin/env node
/** One-time provisioning, never imported by the auth application. Reads the
 * single root .env; management credentials are not needed by the running app. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parse} from 'dotenv';
import {Resend} from 'resend';
const rootEnv=new URL('../../.env',import.meta.url);
const content=await readFile(rootEnv,'utf8');const env={...parse(content),...process.env};
const key=env.RESEND_SETUP_API_KEY || env.RESEND_API_KEY;
if(!key){console.error('Configure RESEND_API_KEY or provide RESEND_SETUP_API_KEY securely.');process.exit(1);}
const resend=new Resend(key);const alias='asset-avengers-password-reset';
const checked=await resend.templates.get(env.EMAIL_RESET_TEMPLATE_ID || alias,{signal:AbortSignal.timeout(12000)});
let id=checked.data?.id;
if(checked.error && checked.error.statusCode!==404){
 console.error(`Resend setup failed (HTTP ${checked.error.statusCode ?? 'network'}). Check key validity and template-management permission.`);process.exit(1);
}
if(!id){
 const created=await resend.templates.create({
  name:'Endgame password reset',alias,subject:'Reset your Endgame password',
  // Bootstrap content is uploaded once; the application sends the remote template by ID.
  html:'<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172d40"><h1>Endgame</h1><h2>Reset your password</h2><p>Use this code to choose a new password:</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold">{{{CODE}}}</p><p>This code expires in {{{EXPIRES_MINUTES}}} minutes. It works once.</p><p>If MFA is enabled, your authenticator is still required after resetting your password. If you did not request this, ignore this message.</p><hr><p>Endgame Trading by Asset Avengers</p></main>',
  variables:[{key:'CODE',type:'string'},{key:'EXPIRES_MINUTES',type:'number'}],
 },{signal:AbortSignal.timeout(12000)});
 if(created.error || !created.data){console.error(`Template creation failed (HTTP ${created.error?.statusCode ?? 'network'}).`);process.exit(1);}
 id=created.data.id;
}
const details=await resend.templates.get(id,{signal:AbortSignal.timeout(12000)});
if(details.error || !details.data){console.error('Could not read template variables.');process.exit(1);}
const variables=details.data.variables || [];
if(variables.length!==2 || !variables.some(v=>v.key==='CODE' && v.type==='string') || !variables.some(v=>v.key==='EXPIRES_MINUTES' && v.type==='number')){
 console.error('Template must define exactly CODE (string) and EXPIRES_MINUTES (number).');process.exit(1);
}
if(details.data.status!=='published'){
 const published=await resend.templates.publish(id,{signal:AbortSignal.timeout(12000)});
 if(published.error){console.error(`Template publishing failed (HTTP ${published.error.statusCode ?? 'network'}).`);process.exit(1);}
}
const updated=/^EMAIL_RESET_TEMPLATE_ID=.*$/m.test(content)
 ? content.replace(/^EMAIL_RESET_TEMPLATE_ID=.*$/m,`EMAIL_RESET_TEMPLATE_ID=${id}`)
 : `${content.trimEnd()}\nEMAIL_RESET_TEMPLATE_ID=${id}\n`;
await writeFile(rootEnv,updated,{mode:0o600});
console.log(`Published password-reset template ${id}; saved EMAIL_RESET_TEMPLATE_ID in ${fileURLToPath(rootEnv)}.`);
console.log('Runtime RESEND_API_KEY should be a sending-only key. Configure EMAIL_FROM for your verified domain; the default sender is test-only.');
