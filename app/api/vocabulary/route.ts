import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { words } from '../../../lib/catalog';
export async function GET(){
 const user=await getChatGPTUser(); if(!user)return Response.json({error:'Sign in to keep your vocabulary.'},{status:401});
 try { const result=await env.DB!.prepare('SELECT word_id AS wordId, status, encounters FROM vocabulary WHERE user_id = ?').bind(user.userId).all();return Response.json({progress:result.results}); }
 catch(error){console.error(error);return Response.json({error:'Your vocabulary is unavailable. Please retry.'},{status:503});}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to save your vocabulary.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 let payload:{wordIds?:unknown;status?:unknown};try{payload=await request.json() as typeof payload;if(!payload||typeof payload!=='object')throw new Error('Invalid request');}catch{return Response.json({error:'Invalid request'},{status:400});}
 const {wordIds,status}=payload;
 if(!Array.isArray(wordIds)||wordIds.length>50||!wordIds.length||!wordIds.every((id:unknown)=>typeof id==='string'&&words[id])||typeof status!=='string'||!['encountered','saved','learned'].includes(status))return Response.json({error:'Invalid vocabulary update'},{status:400});
 try{await env.DB!.batch(wordIds.map((id:string)=>env.DB!.prepare("INSERT INTO vocabulary (user_id,word_id,status,encounters,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(user_id,word_id) DO UPDATE SET status = CASE WHEN excluded.status = 'encountered' THEN vocabulary.status ELSE excluded.status END, encounters = vocabulary.encounters + CASE WHEN excluded.status = 'encountered' THEN 1 ELSE 0 END, updated_at = excluded.updated_at").bind(user.userId,id,status,Date.now())));return Response.json({ok:true});}
 catch(error){console.error(error);return Response.json({error:'Could not save. Please try again.'},{status:503});}
}
