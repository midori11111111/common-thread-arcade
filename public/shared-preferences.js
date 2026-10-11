export const sharedOptions={vibe:['シンプル','かわいい','かっこいい','ポップ','おまかせ'],palette:['紺・白','黒・白','青・白','緑・クリーム','ピンク・白','おまかせ']};
export const paletteColors={'紺・白':['#213F63','#FFFFFF'],'黒・白':['#202020','#FFFFFF'],'青・白':['#3866AD','#FFFFFF'],'緑・クリーム':['#355B45','#EFE6D4'],'ピンク・白':['#D18BA5','#FFFFFF']};
export function summarizePreferences(students){
 const tally=key=>{const values=new Map();for(const s of students){const v=s.shared?.[key];if(v&&v!=='おまかせ')values.set(v,(values.get(v)||0)+1);}return [...values].sort((a,b)=>b[1]-a[1]);};
 return {responded:students.filter(s=>s.shared).length,vibe:tally('vibe'),palette:tally('palette'),themes:students.filter(s=>s.shared?.idea).map(s=>({name:s.name,text:s.shared.idea})),avoids:students.filter(s=>s.shared?.avoid).map(s=>({name:s.name,text:s.shared.avoid}))};
}
