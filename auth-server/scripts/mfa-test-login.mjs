#!/usr/bin/env node
/** Automated smoke tests enroll only their own freshly created test identity.
 * Recovery codes are kept in a chmod-600 temporary file removed by the caller. */
import {readFile,writeFile} from 'node:fs/promises';
import {generate} from 'otplib';
const stateFile=process.env.AUTH_TEST_STATE;
if(!stateFile)throw new Error('AUTH_TEST_STATE must be a private temporary file');
const base=process.env.AUTH_TEST_URL || 'http://localhost:3000';
const post=async(path,body)=>{
 const response=await fetch(base+'/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
};
let result=await post('login',{email:process.env.AUTH_TEST_EMAIL,password:process.env.AUTH_TEST_PASSWORD});
if(result.status===200 && result.data.purpose==='enroll'){
 result=await post('mfa/enable',{challengeToken:result.data.challengeToken,code:await generate({secret:result.data.secret})});
 if(result.status===200)await writeFile(stateFile,JSON.stringify(result.data.recoveryCodes),{mode:0o600});
} else if(result.status===200 && result.data.purpose==='login'){
 const codes=JSON.parse(await readFile(stateFile,'utf8'));const code=codes.shift();
 if(!code)throw new Error('Smoke-test recovery codes exhausted');
 result=await post('mfa/verify',{challengeToken:result.data.challengeToken,code});
 if(result.status===200)await writeFile(stateFile,JSON.stringify(codes),{mode:0o600});
}
const {recoveryCodes,...safeResult}=result.data;
console.log(JSON.stringify(safeResult));console.log(result.status);
