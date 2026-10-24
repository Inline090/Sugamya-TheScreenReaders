import fs from 'node:fs';
const allowed=new Set(['OWNER_CHALLENGE','FIXTURE_ADMIN_TOKEN','ORIGIN_PORT','FIXTURE_TARGET_ID','AUTHORIZATION_EXPIRES']);
if(fs.existsSync('.env'))for(const l of fs.readFileSync('.env','utf8').split('\n')){const i=l.indexOf('=');if(i>0&&allowed.has(l.slice(0,i))&&!process.env[l.slice(0,i)])process.env[l.slice(0,i)]=l.slice(i+1)}
if(!process.env.OWNER_CHALLENGE||process.env.OWNER_CHALLENGE.length<32)throw Error('Owner challenge required');
