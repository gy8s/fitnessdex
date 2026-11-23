'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function readObject(label,close){
 const a=html.indexOf(label)+label.length;
 assert(a>=label.length,'Missing '+label);
 const b=html.indexOf(close,a);
 assert(b>a,'Missing end of '+label);
 return JSON.parse(html.slice(a,b+1));
}
const catalog=readObject('const DATA=','];'), guides=readObject('const EXERCISE_GUIDES=','};');
const ids=new Set(catalog.map(e=>e.id));
assert.equal(catalog.length,204,'Existing 149 movements plus 55 distinct mobility movements');
assert.equal(ids.size,catalog.length,'Unique movement IDs');
const byId=new Map(catalog.map(e=>[e.id,e]));
for(let n=1;n<=149;n++)assert(byId.has('e'+String(n).padStart(3,'0')),'Original ID missing: '+n);
for(const e of catalog){
 assert(guides[e.id]&&typeof guides[e.id]==='string','Missing movement guide: '+e.id);
 if(e.variantOf)assert(byId.has(e.variantOf),'Missing variant parent: '+e.id);
 if(e.side!==undefined)assert.equal(typeof e.side,'boolean','Invalid sidedness: '+e.id);
}
const names=new Set(catalog.flatMap(e=>[e.name,...(e.aliases||[])].map(s=>s.toLowerCase())));
const screenshots=["Arm Circles","Side Neck Stretch","Back Neck Stretch","Front Neck Stretch","Armpit Check Stretch","Neck Looking Around","Shoulder Opener","Front Shoulder Circles","Backward Shoulder Circles","Deltoid Stretch","Upper Back Stretch","Front Wrist Stretch","Back Wrist Stretch","Fish Pose","Mountain Pose","Yoga Backbend","Side Angle Extension","Resisted Chest Stretch","Threading The Needle","Side Oblique Stretch","Like & Dislike","Forearm Stretch","Namaste Breathing","Side Bend","Extended Arm Circles","Standing Torso Twist","Child Pose","Standing Chest Stretch","Lumbar Rotation","Spinal Rocking","Hurdler Stretch","Forward Fold","Triangle Pose","Supine Hamstring Stretch","Forward Bend","Hip Forward Stretch","Quad Stretch","Hip Flexor Stretch","Lying Glute Stretch","Hip Flexion","Bent Over Twist","Calf & Ham Stretch","Butterfly Stretch","Deep Squat Stretch","Wide Legged Bend","Reclined Cobblers Pose","Wide Leg Bend","Plow Pose","Wrist Circles","Side Neck Resistance","Front Neck Resistance","Windmill","Bent Over Stretch","Sprinters Calf Stretch","Alternating Side Lunge","Ankle Twist","Seated Forward Bend","Pigeon Pose","Roof Pose","Half Triangle","Deep Breathing","Swan Pose","Cat Cow Pose","Elbow Cat Cow Pose"];
for(const name of screenshots){
 if(['Mountain Pose','Deep Breathing'].includes(name))assert(!names.has(name.toLowerCase()),'Excluded: '+name);
 else assert(names.has(name.toLowerCase()),'Screenshot movement missing: '+name);
}
for(let n=150;n<=204;n++){
 const id='e'+n;
 const e=byId.get(id);
 assert(e&&e.cat==='Flexibility & mobility','New movement has wrong category: '+id);
 assert(['time','bodysets'].includes(e.mode),'New movement has unsupported logging mode: '+id);
 assert(e.family.length>3,'Missing family: '+id);
}
assert(html.includes("(e.aliases||[]).some(a=>a.toLowerCase().includes(text))"),'Aliases must be searchable');
assert(html.includes("['Weight training','Flexibility & mobility'].includes(category)"),'Mobility variants must be grouped');
console.log('PASS: 62 requested names covered (55 new + 7 existing), both exclusions absent, guides and variants valid.');
