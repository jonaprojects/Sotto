export type RepeatMode = 'off' | 'all' | 'one';
export const nextRepeat = (mode: RepeatMode): RepeatMode => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
export function orderUpcoming<T extends {id:string}>(records:T[],index:number,shuffle:boolean,source:T[],random= Math.random):T[] {
    const history=records.slice(0,index+1), upcoming=records.slice(index+1);
    if(shuffle){for(let i=upcoming.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[upcoming[i],upcoming[j]]=[upcoming[j],upcoming[i]];}}
    else{const order=new Map(source.map((r,i)=>[r.id,i]));upcoming.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));}
    return [...history,...upcoming];
}
export function endedAction(index:number,count:number,repeat:RepeatMode,exhausted:boolean):{kind:'restart'|'stop'|'wait'}|{kind:'next';index:number} {
    if(!count)return {kind:'stop'};
    if(repeat==='one')return {kind:'restart'};
    if(index+1<count)return {kind:'next',index:index+1};
    if(!exhausted)return {kind:'wait'};
    if(repeat==='all')return count===1?{kind:'restart'}:{kind:'next',index:0};
    return {kind:'stop'};
}
