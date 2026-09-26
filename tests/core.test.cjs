const {test}=require('node:test');
const assert=require('node:assert/strict');
const {arrange,fitSize,gapPixels,coverRect,crc32,zip}=require('../core.js');
test('uncompensated crops cover image without seams',()=>{
 const s={W:2400,H:1400,count:4,gap:8,compensate:false,...fitSize(2400,1400,4,8,false)};
 const p=arrange(s);assert.equal(p[0].x,0);assert.equal(p[3].x+s.w,2400);assert.equal(p[1].x,p[0].x+s.w);
});
test('compensation skips exactly the preview gap in image coordinates',()=>{
 const s={W:2400,H:1400,count:4,gap:8,compensate:true,...fitSize(2400,1400,4,8,true)};
 const p=arrange(s);assert.ok(Math.abs((p[1].x-p[0].x-s.w)/s.h*480-8)<1e-9);assert.ok(p[0].x>=0);assert.ok(p[3].x+s.w<=2400);
});
test('fit keeps portrait and landscape layouts inside source',()=>{
 for(const [W,H] of [[128,32],[300,5000],[5000,300],[2400,1400]])for(const count of [2,3,4])for(const gap of [0,4,30]){
 const s={W,H,count,gap,compensate:true,...fitSize(W,H,count,gap,true)};const p=arrange(s);assert.ok(s.h<=H);assert.ok(p[0].x>=-1e-8);assert.ok(p.at(-1).x+s.w<=W+1e-8);
 }
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
