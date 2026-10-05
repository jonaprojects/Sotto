// Uses the already connected local account. Tokens remain in memory only.
const base='http://127.0.0.1:5173';
export async function spotifyImportClient(){
 const login=await fetch(`${base}/signin-with-chatgpt?return_to=/beta`,{redirect:'manual'});
 const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 if(!cookie)throw new Error('The local development account is unavailable.');
 let token,last=0;
 async function renew(){const r=await fetch(`${base}/api/spotify/token`,{headers:{Cookie:cookie},cache:'no-store'});if(!r.ok)throw new Error(`Connect Spotify in the local app first (HTTP ${r.status}).`);token=(await r.json()).accessToken;}
 await renew();
 return async function spotify(path){
  for(let attempt=0;attempt<4;attempt++){
   await new Promise(r=>setTimeout(r,Math.max(0,350-(Date.now()-last))));last=Date.now();
   const response=await fetch(`https://api.spotify.com/v1/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
   if(response.status===401 && attempt<3){await renew();continue;}
   if(response.status===429){const p=await response.json().catch(()=>({}));if(p.reason==='QUOTA_EXCEEDED'||p.error?.reason==='QUOTA_EXCEEDED')throw new Error('Spotify quota exhausted; checkpoint retained.');const seconds=Number(response.headers.get('Retry-After')||30);if(seconds>60)throw new Error(`Spotify cooldown ${seconds}s; resume the checkpoint later.`);await new Promise(r=>setTimeout(r,Math.max(1,seconds)*1000));continue;}
   if(response.status>=500 && attempt<3){await new Promise(r=>setTimeout(r,2000));continue;}
   if(!response.ok)throw new Error(`Spotify metadata HTTP ${response.status}; checkpoint retained.`);
   return response.json();
  }
  throw new Error('Spotify retry limit reached; checkpoint retained.');
 };
}
