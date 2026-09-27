const {test}=require('node:test');
const assert=require('node:assert/strict');
const {arrange,fitSize,gapPixels,coverRect,photoTiles,cropBounds,zoomCrop,panCrop,resizeCrop,crc32,zip}=require('../core.js');
function cropFixture(){const s={W:2400,H:1400,count:4,gap:4,compensate:true,zoom:1,...fitSize(2400,1400,4,4,true)};s.positions=arrange(s);return s;}
test('zoom halves crop rectangles and gaps, keeping source dimensions intact',()=>{
 const s=cropFixture(),before=structuredClone(s),z={...s,...zoomCrop(s,2)};
 assert.equal(z.w,s.w/2);assert.equal(z.h,s.h/2);assert.equal(z.W,2400);assert.equal(z.H,1400);assert.deepEqual(s,before);
 assert.ok(Math.abs((z.positions[1].x-z.positions[0].x-z.w)-gapPixels(z))<1e-8);
 const back=zoomCrop(z,1);assert.equal(back.w,s.w);assert.equal(back.h,s.h);
 back.positions.forEach((p,i)=>assert.ok(Math.abs(p.x-s.positions[i].x)<1e-8&&Math.abs(p.y-s.positions[i].y)<1e-8));
});
test('zoomed crop can reach both original vertical edges',()=>{
 const s=cropFixture();Object.assign(s,zoomCrop(s,2));assert.equal(s.h,700);
 Object.assign(s,resizeCrop(s,'top',-100000,s.positions,s.h,true));assert.equal(s.positions[0].y,0);assert.equal(s.h,1050);
 Object.assign(s,resizeCrop(s,'bottom',100000,s.positions,s.h,true));assert.equal(s.h,1400);assert.equal(s.positions.at(-1).y+s.h,s.H);
});
test('pan reaches all source edges and zoom-out stays inside after manual height resize',()=>{
 const s=cropFixture();Object.assign(s,zoomCrop(s,4));s.positions=panCrop(s,-1,-1);assert.equal(cropBounds(s).x,0);assert.equal(cropBounds(s).y,0);
 s.positions=panCrop(s,1,1);const b=cropBounds(s);assert.equal(b.x+b.w,s.W);assert.equal(b.y+b.h,s.H);
 Object.assign(s,resizeCrop(s,'top',-100000,s.positions,s.h,true));Object.assign(s,zoomCrop(s,1));
 for(const p of s.positions){assert.ok(p.x>=-1e-8&&p.y>=-1e-8);assert.ok(p.x+s.w<=s.W+1e-8&&p.y+s.h<=s.H+1e-8);}
});
test('free crops zoom together while preserving independent vertical offsets',()=>{
 const s=cropFixture();s.h=700;s.positions[0].y=50;s.positions[1].y=300;s.positions[2].y=100;s.positions[3].y=500;
 const z=zoomCrop(s,2);assert.equal(z.positions[1].y-z.positions[0].y,125);assert.equal(z.positions[3].y-z.positions[2].y,200);
});
test('uncompensated crops cover image without seams',()=>{
 const s={W:2400,H:1400,count:4,gap:8,compensate:false,...fitSize(2400,1400,4,8,false)};
 const p=arrange(s);assert.equal(p[0].x,0);assert.equal(p[3].x+s.w,2400);assert.equal(p[1].x,p[0].x+s.w);
});
test('compensation skips exactly the preview gap in image coordinates',()=>{
 const s={W:2400,H:1400,count:4,gap:8,compensate:true,...fitSize(2400,1400,4,8,true)};
 const p=arrange(s);assert.ok(Math.abs((p[1].x-p[0].x-s.w)/s.h*480-8)<1e-9);assert.ok(p[0].x>=0);assert.ok(p[3].x+s.w<=2400);
});
test('fit keeps portrait and landscape layouts inside source',()=>{
 for(const [W,H] of [[128,32],[300,5000],[5000,300],[2400,1400]])for(const count of [1,2,3,4])for(const gap of [0,4,30]){
 const s={W,H,count,gap,compensate:true,...fitSize(W,H,count,gap,true)};const p=arrange(s);assert.ok(s.h<=H);assert.ok(p[0].x>=-1e-8);assert.ok(p.at(-1).x+s.w<=W+1e-8);
 }
});
test('2+2 photos keep one shared crop transform per photo through reorder',()=>{
 const a={name:'A',count:2,zoom:1.8,panX:.3},b={name:'B',count:2,zoom:1.2,panX:-.2};
 const original=photoTiles([a,b]);assert.deepEqual(original.map(t=>[t.photo.name,t.index,t.number]),[['A',0,1],['A',1,2],['B',0,3],['B',1,4]]);
 const moved=photoTiles([b,a]);assert.deepEqual(moved.map(t=>t.photo.name),['B','B','A','A']);assert.equal(moved[2].photo,original[0].photo);assert.equal(moved[3].photo.zoom,1.8);
});
test('one photo divides into 2, 3 or 4 consecutive regions, not repeated images',()=>{
 for(const count of [2,3,4]){const photo={W:2400,H:1200,count,gap:0,compensate:false,...fitSize(2400,1200,count,0,false)};photo.positions=arrange(photo);const tiles=photoTiles([photo]);assert.equal(tiles.length,count);assert.equal(photo.positions[0].x,0);assert.equal(photo.positions.at(-1).x+photo.w,2400);for(let i=1;i<count;i++)assert.equal(photo.positions[i].x,photo.positions[i-1].x+photo.w);}
});
test('3+1 layout and removal produce continuous output numbering',()=>{
 const a={count:3},b={count:1};assert.deepEqual(photoTiles([a,b]).map(t=>t.number),[1,2,3,4]);assert.deepEqual(photoTiles([b]).map(t=>t.number),[1]);assert.deepEqual(photoTiles([]),[]);
});
test('replacement cover + pan never leave an uncovered edge',()=>{
 for(const pan of [-1,0,1])for(const zoom of [1,2,4]){
 const r=coverRect(1200,800,400,900,zoom,pan,pan);assert.ok(r.x<=0&&r.y<=0);assert.ok(r.x+r.w>=400&&r.y+r.h>=900);
 }
});
test('ZIP contains valid CRC and file boundaries',async()=>{
 const data=new TextEncoder().encode('123456789');assert.equal(crc32(data),0xcbf43926);
 const blob=zip([{name:'image_01.png',data},{name:'image_02.png',data}]);const a=new Uint8Array(await blob.arrayBuffer()),v=new DataView(a.buffer);
 assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(14,true),0xcbf43926);assert.equal(v.getUint32(a.length-22,true),0x06054b50);assert.equal(v.getUint16(a.length-12,true),2);
 const dir=v.getUint32(a.length-6,true);assert.equal(v.getUint32(dir,true),0x02014b50);
});
