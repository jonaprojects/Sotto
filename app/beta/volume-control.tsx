'use client';
import {useEffect,useRef,useState} from 'react';
import {Volume1,Volume2,VolumeX} from 'lucide-react';
export function VolumeControl({value,change}:{value:number;change:(value:number)=>void}) {
    const [open,setOpen]=useState(false), box=useRef<HTMLDivElement>(null), slider=useRef<HTMLInputElement>(null), trigger=useRef<HTMLButtonElement>(null), previous=useRef(.8);
    if(value>0)previous.current=value;
    useEffect(()=>{
        if(!open)return;
        slider.current?.focus();
        const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);};
        const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}};
        document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
        return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);};
    },[open]);
    const Icon=value===0?VolumeX:value<.5?Volume1:Volume2;
    return <div ref={box} className="beta-volume"><button ref={trigger} title={`Volume ${Math.round(value*100)}%`} aria-label="Adjust volume" aria-expanded={open} aria-controls="volume-controls" onClick={()=>setOpen(v=>!v)}><Icon size={20}/></button>{open&&<div className="beta-volume-popup" id="volume-controls" role="group" aria-label="Volume controls"><div><span>Volume</span><output>{Math.round(value*100)}%</output></div><div><button aria-label={value===0?'Unmute':'Mute'} title={value===0?'Restore volume':'Mute'} onClick={()=>change(value===0?previous.current:0)}>{value===0?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><input ref={slider} aria-label="Volume" aria-valuetext={`${Math.round(value*100)} percent`} type="range" min={0} max={100} step={1} value={Math.round(value*100)} onChange={e=>change(Number(e.target.value)/100)}/></div></div>}</div>;
}
