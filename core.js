/* Shared geometry and ZIP encoder; no network or third-party dependencies. */
(function(root){
  'use strict';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function gapPixels(state){return state.compensate ? state.gap*state.h/480 : 0;}
  function fitSize(W,H,count,gap,compensate){
    const h=Math.min(H,Math.floor(W/(count*.42+(compensate?(count-1)*gap/480:0))));
    const w=Math.max(16,Math.floor((W-(compensate?(count-1)*gap*h/480:0))/count));
    return {w,h};
  }
  function arrange(state){
    const g=gapPixels(state), total=state.count*state.w+(state.count-1)*g;
    const x=(state.W-total)/2,y=(state.H-state.h)/2;
    return Array.from({length:state.count},(_,i)=>({x:x+i*(state.w+g),y}));
  }
  function coverRect(imageW,imageH,w,h,zoom=1,panX=0,panY=0){
    const scale=Math.max(w/imageW,h/imageH)*zoom;
    const dw=imageW*scale,dh=imageH*scale;
    return {x:(w-dw)/2+panX*(dw-w)/2,y:(h-dh)/2+panY*(dh-h)/2,w:dw,h:dh};
  }
  function photoTiles(photos){return photos.flatMap(photo=>Array.from({length:photo.count},(_,index)=>({photo,index}))).map((tile,index)=>({...tile,number:index+1}));}
  const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(data){let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files){
    const chunks=[],central=[];let offset=0,centralSize=0;
    for(const file of files){
      const name=new TextEncoder().encode(file.name),data=file.data,crc=crc32(data);
      const local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
      const cd=new Uint8Array(46+name.length),v=new DataView(cd.buffer);
      v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);cd.set(name,46);
      chunks.push(local,data);central.push(cd);offset+=local.length+data.length;centralSize+=cd.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return new Blob([...chunks,...central,end],{type:'application/zip'});
  }
  const api={clamp,gapPixels,fitSize,arrange,coverRect,photoTiles,crc32,zip};
  if(typeof module!=='undefined')module.exports=api;else root.SplitCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
