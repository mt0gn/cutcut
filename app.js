'use strict';
const $=id=>document.getElementById(id);
const {clamp,gapPixels,fitSize,arrange,coverRect,zip}=SplitCore;
const state={W:2400,H:1400,w:500,h:1200,count:4,gap:4,compensate:true,source:null,name:'image',cells:[],selected:0,positions:[],busy:false};
let notification,raf,loadVersion=0;
const photos=[];
let activePhoto=null,loading=false;
const photoKeys=['W','H','w','h','count','source','name','cells','selected','positions','zoom','panX','panY'];
const totalCount=()=>photos.reduce((sum,p)=>sum+p.count,0);
const photoOffset=()=>photos.slice(0,photos.indexOf(activePhoto)).reduce((sum,p)=>sum+p.count,0);
function stash(){if(activePhoto)for(const key of photoKeys)activePhoto[key]=state[key];}
function activate(photo){stash();activePhoto=photo;for(const key of photoKeys)state[key]=photo[key];syncFields();render();}
function photoList(){
  $('total-count').textContent=totalCount()+' / 4칸';
  const list=$('photo-list');list.replaceChildren();let start=1;if(!photos.length){const hint=document.createElement('p');hint.className='help';hint.textContent='사진 두 장을 각각 2칸으로 나누면 1–2번 / 3–4번 칸에 이어집니다.';list.append(hint);}
  photos.forEach((photo,index)=>{
    const row=document.createElement('div');row.className='photo-row'+(photo===activePhoto?' active':'');
    const select=document.createElement('button');select.className='photo-select';select.setAttribute('aria-pressed',photo===activePhoto);
    const thumb=document.createElement('canvas');thumb.width=80;thumb.height=50;thumb.getContext('2d').drawImage(photo.source,0,0,80,50);
    const text=document.createElement('span');text.textContent=`${index+1}. ${photo.name} · ${start}${photo.count>1?'–'+(start+photo.count-1):''}번 칸`;
    select.append(thumb,text);select.onclick=()=>activate(photo);row.append(select);
    const count=document.createElement('select');count.setAttribute('aria-label',`${index+1}번째 사진 분할 수`);
    for(let n=1;n<=4;n++){const option=new Option(n+'칸',n);option.disabled=totalCount()-photo.count+n>4;count.add(option);}count.value=photo.count;
    count.onchange=()=>{activate(photo);setCount(Number(count.value));};row.append(count);
    for(const [label,delta] of [['앞으로',-1],['뒤로',1]]){const b=document.createElement('button');b.className='button';b.textContent=label;b.setAttribute('aria-label',`${index+1}번째 사진 ${label}`);b.disabled=index+delta<0||index+delta>=photos.length;b.onclick=()=>{stash();photos.splice(index,1);photos.splice(index+delta,0,photo);render();};row.append(b);}
    const remove=document.createElement('button');remove.className='text-button';remove.textContent='삭제';remove.setAttribute('aria-label',`${index+1}번째 사진 삭제`);remove.onclick=()=>{stash();photos.splice(index,1);if(photo===activePhoto){activePhoto=null;if(photos.length)activate(photos[Math.min(index,photos.length-1)]);else{state.source=null;state.count=0;render();}}else render();};row.append(remove);list.append(row);start+=photo.count;
  });
  $('upload').disabled=loading||state.busy||totalCount()>=4;$('demo').disabled=loading||state.busy||totalCount()>=4;
}
function setCount(count){if(!activePhoto||totalCount()-state.count+count>4)return;state.count=count;state.selected=Math.min(state.selected,count-1);resetLayout();}
function toast(message){$('status').textContent=message;$('status').classList.add('visible');clearTimeout(notification);notification=setTimeout(()=>$('status').classList.remove('visible'),4500);}
function freshCell(){return {image:null,name:'',zoom:1,panX:0,panY:0};}
function resetLayout(){Object.assign(state,fitSize(state.W,state.H,state.count,state.gap,state.compensate));state.positions=arrange(state);syncFields();render();}
function syncFields(){ $('width').value=state.w;$('height').value=state.h;$('gap-value').value=state.gap+' px';document.querySelectorAll('[data-count]').forEach(b=>{b.setAttribute('aria-pressed',!!activePhoto&&Number(b.dataset.count)===state.count);b.disabled=!activePhoto||totalCount()-activePhoto.count+Number(b.dataset.count)>4;});}
function queueRender(){cancelAnimationFrame(raf);raf=requestAnimationFrame(render);}
function syncSelected(){
  $('selected-label').textContent=activePhoto?`${photoOffset()+1}–${photoOffset()+state.count}`:'—';$('cell-source').textContent=state.source?state.name:'사진을 추가해주세요';
  for(const id of ['zoom','pan-x','pan-y','restore'])$(id).disabled=!state.source;
  $('zoom').value=(state.zoom||1)*100;$('zoom-value').value=Math.round((state.zoom||1)*100)+'%';$('pan-x').value=(state.panX||0)*100;$('pan-y').value=(state.panY||0)*100;
}
function drawSource(ctx,photo){const r=coverRect(photo.W,photo.H,photo.W,photo.H,photo.zoom||1,photo.panX||0,photo.panY||0);ctx.drawImage(photo.source,r.x,r.y,r.w,r.h);}
function drawTile(canvas,index,width,height,photo=state){
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const pos=photo.positions[index];
  if(photo.source){ctx.scale(width/photo.w,height/photo.h);ctx.translate(-pos.x,-pos.y);drawSource(ctx,photo);}
}
function render(){
  stash();photoList();syncFields();syncSelected();if(!state.source){$('stage').hidden=true;$('empty').hidden=false;$('preview-track').replaceChildren();$('export-info').textContent='사진을 추가해주세요.';for(const id of ['download','replace','cell-download'])$(id).disabled=true;return;}
  $('source-info').textContent=`${state.name} · ${state.W.toLocaleString()} × ${state.H.toLocaleString()} px`;$('width').max=state.W;$('height').max=state.H;
  const stage=$('stage');stage.hidden=false;$('empty').hidden=true;
  const wrapStyle=getComputedStyle($('dropzone'));const available=$('dropzone').clientWidth-parseFloat(wrapStyle.paddingLeft)-parseFloat(wrapStyle.paddingRight);
  stage.style.width=Math.min(available,480*state.W/state.H)+'px';stage.style.aspectRatio=state.W+'/'+state.H;
  const source=$('source-canvas');const ratio=Math.min(1,1600/state.W);source.width=Math.round(state.W*ratio);source.height=Math.round(state.H*ratio);const sourceCtx=source.getContext('2d');sourceCtx.scale(ratio,ratio);drawSource(sourceCtx,state);
  const frames=$('frames');
  while(frames.children.length>state.count)frames.lastElementChild.remove();
  while(frames.children.length<state.count){const el=document.createElement('div');el.className='frame';el.tabIndex=0;el.setAttribute('role','button');el.append(document.createElement('canvas'),Object.assign(document.createElement('span'),{className:'frame-badge'}));frames.append(el);}
  const preview=$('preview-track');if(preview.querySelector('.preview-empty'))preview.replaceChildren();
  while(preview.children.length>totalCount())preview.lastElementChild.remove();
  while(preview.children.length<totalCount()){const figure=document.createElement('figure');figure.className='preview-item';figure.append(document.createElement('canvas'),document.createElement('figcaption'));preview.append(figure);}
  [...frames.children].forEach((el,i)=>{const p=state.positions[i];el.classList.toggle('selected',i===state.selected);el.setAttribute('aria-label',`${i+1}번 칸 선택 및 이동`);el.setAttribute('aria-pressed',i===state.selected);el.style.left=p.x/state.W*100+'%';el.style.top=p.y/state.H*100+'%';el.style.width=state.w/state.W*100+'%';el.style.height=state.h/state.H*100+'%';el.lastChild.textContent=String(i+1).padStart(2,'0');
    el.setAttribute('aria-label',`${photoOffset()+i+1}번 칸 선택 및 이동`);el.lastChild.textContent=String(photoOffset()+i+1).padStart(2,'0');const previewH=Math.min(state.h,640),previewW=Math.max(1,Math.round(state.w/state.h*previewH));drawTile(el.firstChild,i,previewW,previewH);
  });
  let outputIndex=0;for(const photo of photos)for(let i=0;i<photo.count;i++){const figure=preview.children[outputIndex];const h=Math.min(photo.h,640),w=Math.max(1,Math.round(photo.w/photo.h*h));drawTile(figure.firstChild,i,w,h,photo);figure.lastChild.textContent=String(++outputIndex).padStart(2,'0');}
  // Preview image height is 240px on desktop, half of the 480px reference height.
  const visualH=window.matchMedia('(max-width:700px)').matches?200:240;preview.style.gap=state.gap*visualH/480+'px';
  const p=state.positions[state.selected];for(const [id,y] of [['top-handle',p.y],['bottom-handle',p.y+state.h]]){const el=$(id);el.style.top=y/state.H*100+'%';el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax',state.H);el.setAttribute('aria-valuenow',Math.round(y));}
  const scale=Number($('scale').value),w=Math.round(state.w*scale),h=Math.round(state.h*scale);$('export-info').textContent=`전체 ${totalCount()}장 · 선택한 사진의 칸: ${w.toLocaleString()} × ${h.toLocaleString()} px`;
  for(const id of ['download','replace','cell-download'])$(id).disabled=state.busy;
}
async function decode(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG, JPG, WEBP 이미지를 선택해주세요.');
  if(file.size>30*1024*1024)throw Error('30MB 이하의 이미지를 선택해주세요.');
  const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(img.naturalWidth<128||img.naturalHeight<32)throw Error('폭 128px, 높이 32px 이상인 이미지를 선택해주세요.');if(img.naturalWidth*img.naturalHeight>40000000)throw Error('4천만 화소 이하로 줄인 이미지를 사용해주세요.');return img;}finally{URL.revokeObjectURL(url);}
}
async function loadSource(files){if(loading||state.busy)return;loading=true;photoList();try{for(const file of files){if(totalCount()>=4){toast('최대 4칸입니다. 기존 사진의 칸 수를 줄이거나 삭제한 뒤 추가해주세요.');break;}try{const img=await decode(file);setSource(img,file.name);}catch(e){toast(e.message);}}}finally{loading=false;photoList();}}
function setSource(image,name){if(totalCount()>=4){toast('기존 사진의 칸 수를 줄여 새 사진의 자리를 만들어주세요.');return;}stash();const photo={source:image,W:image.width,H:image.height,name:name.replace(/\.[^.]+$/,''),count:1,cells:Array.from({length:4},freshCell),selected:0,positions:[],zoom:1,panX:0,panY:0};Object.assign(photo,fitSize(photo.W,photo.H,photo.count,state.gap,state.compensate));photo.positions=arrange({...photo,gap:state.gap,compensate:state.compensate});photos.push(photo);activate(photo);}
$('upload').onclick=()=>$('source-file').click();$('source-file').onchange=e=>{loadSource(Array.from(e.target.files));e.target.value='';};
$('replace').onclick=()=>$('cell-file').click();$('cell-file').onchange=async e=>{const file=e.target.files[0],photo=activePhoto;e.target.value='';if(!file||!photo||loading||state.busy)return;loading=true;photoList();try{const image=await decode(file);if(!photos.includes(photo))return;activate(photo);state.source=image;state.W=image.width;state.H=image.height;state.name=file.name.replace(/\.[^.]+$/,'');state.zoom=1;state.panX=0;state.panY=0;resetLayout();}catch(err){toast(err.message);}finally{loading=false;photoList();}};
$('restore').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;render();};
const dropzone=$('dropzone');['dragenter','dragover'].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add('dragover');}));dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('dragover'));dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('dragover');loadSource(Array.from(e.dataTransfer.files));});
$('counts').onclick=e=>{const count=Number(e.target.dataset.count);if(count)setCount(count);};
$('fit').onclick=()=>{if(state.source)resetLayout();};
function updateDimensions(){if(!state.source)return;let w=clamp(Math.round(Number($('width').value)||16),16,state.W),h=clamp(Math.round(Number($('height').value)||16),16,state.H);if($('movement').value==='linked'){if(state.compensate&&state.gap>0)h=Math.min(h,Math.floor((state.W-state.count*16)*480/((state.count-1)*state.gap)));const g=state.compensate?state.gap*h/480:0;w=Math.min(w,Math.floor((state.W-(state.count-1)*g)/state.count));w=Math.max(16,w);}
  state.w=w;state.h=h;if($('movement').value==='linked')state.positions=arrange(state);else state.positions.forEach(p=>{p.x=clamp(p.x,0,state.W-w);p.y=clamp(p.y,0,state.H-h);});syncFields();render();}
['width','height'].forEach(id=>$(id).addEventListener('change',updateDimensions));
$('movement').onchange=()=>{if(state.source)updateDimensions();};
function updateGap(){state.gap=Number($('gap').value);state.compensate=$('compensate').checked;$('gap-help').textContent=state.compensate?'틈에 가려질 부분을 건너뛰어 장면을 연결합니다. 저장되는 사진에는 여백이 들어가지 않습니다.':'사진을 빈틈없이 나눕니다. 이어보기에는 비교를 위한 간격만 표시됩니다.';syncFields();if(state.source){if($('movement').value==='free'){render();toast('자유 이동에서는 각 칸의 위치를 직접 조절합니다.');}else {stash();for(const photo of photos){const g=state.compensate?state.gap*photo.h/480:0;photo.w=Math.min(photo.w,Math.max(16,Math.floor((photo.W-(photo.count-1)*g)/photo.count)));photo.positions=arrange({...photo,gap:state.gap,compensate:state.compensate});}for(const key of photoKeys)state[key]=activePhoto[key];updateDimensions();}}}
$('compensate').onchange=updateGap;$('gap').oninput=updateGap;
['zoom','pan-x','pan-y'].forEach(id=>$(id).oninput=()=>{if(!state.source)return;state.zoom=Number($('zoom').value)/100;state.panX=Number($('pan-x').value)/100;state.panY=Number($('pan-y').value)/100;queueRender();});
['scale','format'].forEach(id=>$(id).onchange=render);
for(const mode of ['light','dark'])$(mode).onclick=()=>{$('preview-scroll').classList.toggle('dark',mode==='dark');$('light').setAttribute('aria-pressed',mode==='light');$('dark').setAttribute('aria-pressed',mode==='dark');};
function moveFrames(dx,dy,initial){const linked=$('movement').value==='linked';const indices=linked?state.positions.map((_,i)=>i):[state.selected];const minX=Math.min(...indices.map(i=>initial[i].x)),maxX=Math.max(...indices.map(i=>initial[i].x+state.w)),minY=Math.min(...indices.map(i=>initial[i].y)),maxY=Math.max(...indices.map(i=>initial[i].y+state.h));dx=clamp(dx,-minX,state.W-maxX);dy=clamp(dy,-minY,state.H-maxY);for(const i of indices)state.positions[i]={x:initial[i].x+dx,y:initial[i].y+dy};}
function resizeEdge(edge,dy,initial,oldH){
  const minY=Math.min(...initial.map(p=>p.y)),maxY=Math.max(...initial.map(p=>p.y));
  if($('movement').value==='linked'&&state.compensate&&state.gap>0){const maxH=Math.floor((state.W-state.count*16)*480/((state.count-1)*state.gap));dy=edge==='top'?Math.max(dy,oldH-maxH):Math.min(dy,maxH-oldH);}
  if(edge==='top'){dy=clamp(dy,-minY,oldH-16);state.h=Math.round(oldH-dy);state.positions=initial.map(p=>({...p,y:p.y+dy}));}
  else{state.h=Math.round(clamp(oldH+dy,16,state.H-maxY));}
  if($('movement').value==='linked'){
    const g=gapPixels(state),maxW=Math.floor((state.W-(state.count-1)*g)/state.count);state.w=Math.min(state.w,Math.max(16,maxW));const total=state.count*state.w+(state.count-1)*g;const x=clamp(initial[0].x,0,Math.max(0,state.W-total));state.positions.forEach((p,i)=>p.x=x+i*(state.w+g));
  }
  syncFields();
}
let drag=null;
$('stage').addEventListener('pointerdown',e=>{
  const frame=e.target.closest('.frame'),handle=e.target.closest('.crop-handle');if(!frame&&!handle)return;e.preventDefault();
  if(frame)state.selected=[...$('frames').children].indexOf(frame);
  const cell=state.cells[state.selected];drag={x:e.clientX,y:e.clientY,positions:state.positions.map(p=>({...p})),h:state.h,panX:cell.panX,panY:cell.panY,type:handle?(handle.id==='top-handle'?'top':'bottom'):(cell.image&&!e.altKey?'image':'frame')};$('stage').setPointerCapture(e.pointerId);render();
});
$('stage').addEventListener('pointermove',e=>{if(!drag)return;const factor=state.W/$('stage').getBoundingClientRect().width,dx=(e.clientX-drag.x)*factor,dy=(e.clientY-drag.y)*factor;
  if(drag.type==='frame')moveFrames(dx,dy,drag.positions);
  else if(drag.type==='image'){const c=state.cells[state.selected],r=coverRect(c.image.width,c.image.height,state.w,state.h,c.zoom);c.panX=clamp(drag.panX+dx*2/Math.max(1,r.w-state.w),-1,1);c.panY=clamp(drag.panY+dy*2/Math.max(1,r.h-state.h),-1,1);}
  else resizeEdge(drag.type,dy,drag.positions,drag.h);queueRender();
});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>$('stage').addEventListener(type,()=>drag=null));
$('frames').addEventListener('keydown',e=>{const frame=e.target.closest('.frame');if(!frame)return;state.selected=[...$('frames').children].indexOf(frame);const amount=e.shiftKey?10:1;const dir={ArrowLeft:[-amount,0],ArrowRight:[amount,0],ArrowUp:[0,-amount],ArrowDown:[0,amount]}[e.key];if(dir){e.preventDefault();moveFrames(...dir,state.positions.map(p=>({...p})));render();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();render();}});
for(const id of ['top-handle','bottom-handle'])$(id).addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();resizeEdge(id==='top-handle'?'top':'bottom',(e.key==='ArrowUp'?-1:1)*(e.shiftKey?10:1),state.positions.map(p=>({...p})),state.h);render();});
$('demo').onclick=()=>{++loadVersion;const c=document.createElement('canvas');c.width=2400;c.height=1400;const ctx=c.getContext('2d');const colors=['#c6d9dc','#c4cdda','#a9bcc6','#7e9895'];for(let i=0;i<4;i++){ctx.fillStyle=colors[i];ctx.fillRect(i*600,0,600,1400);}ctx.strokeStyle='#ffffff70';ctx.lineWidth=2;for(let x=0;x<2400;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1400);ctx.stroke();}for(let y=0;y<1400;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(2400,y);ctx.stroke();}ctx.strokeStyle='#294842';ctx.lineWidth=65;ctx.beginPath();ctx.moveTo(0,1050);ctx.lineTo(2400,350);ctx.stroke();ctx.fillStyle='#f6ffdb';ctx.font='600 160px sans-serif';ctx.fillText('01',180,280);ctx.fillText('02',780,280);ctx.fillText('03',1380,280);ctx.fillText('04',1980,280);ctx.font='32px sans-serif';ctx.fillText('SPLIT / ALIGNMENT TEST',90,1290);setSource(c,'분할 예제 패턴');};
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportImages(single=false){
  if(!state.source||state.busy||loading)return;stash();const scale=Number($('scale').value),tiles=SplitCore.photoTiles(photos).filter(tile=>!single||(tile.photo===activePhoto&&tile.index===state.selected));
  if(tiles.some(({photo})=>{const w=Math.round(photo.w*scale),h=Math.round(photo.h*scale);return w*h>24000000||w>16000||h>16000;})){toast('한 장당 2,400만 화소 / 한 변 16,000px 이하로 출력 크기를 줄여주세요.');return;}
  state.busy=true;render();$('download').textContent='이미지 만드는 중…';
  // Prevent edits while asynchronous encoders run, so all exported tiles share one layout.
  const controls=[...document.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);$('stage').style.pointerEvents='none';$('stage').inert=true;document.querySelector('main').inert=true;
  try{
    const files=[],format=$('format').value,ext=format==='jpeg'?'jpg':'png',base=state.name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,50)||'image';
    for(const {photo,index,number} of tiles){
      const w=Math.max(1,Math.round(photo.w*scale)),h=Math.max(1,Math.round(photo.h*scale));const c=document.createElement('canvas');drawTile(c,index,w,h,photo);
      if(format==='jpeg'){const ctx=c.getContext('2d');ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/'+format,.95));c.width=1;c.height=1;if(!blob)throw Error('이미지를 만들 수 없습니다. 출력 크기를 줄여주세요.');
      const name=`${String(number).padStart(2,'0')}_${photo.name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,50)||'image'}.${ext}`;if(single)save(blob,name);else files.push({name,data:new Uint8Array(await blob.arrayBuffer())});
    }
    if(!single)save(zip(files),base+'_split.zip');toast(single?'선택한 칸을 저장했습니다.':'ZIP 파일을 저장했습니다. 번호 순서대로 업로드해주세요.');
  }catch(e){toast(e.message||'저장 중 문제가 생겼습니다. 크기를 줄여 다시 시도해주세요.');}
  finally{controls.forEach(([el,disabled])=>el.disabled=disabled);state.busy=false;$('stage').style.pointerEvents='';$('stage').inert=false;document.querySelector('main').inert=false;$('download').textContent='↓ 전체 ZIP 저장';render();}
}
$('download').onclick=()=>exportImages();$('cell-download').onclick=()=>exportImages(true);
window.addEventListener('resize',queueRender);syncFields();syncSelected();
