// Unapplied selections stay local and never enter workspace/model requests.
const volatileDrafts=new Map();
export function bindMemoryDraft({inputs,scope,id,storage=localStorage,onStatus=()=>{}}){
 const key=`second-me-memory-draft:${JSON.stringify([scope,id])}`;
 const selected=()=>inputs.filter(input=>input.checked).map(input=>String(input.value)).sort();
 const signature=ids=>JSON.stringify([...ids].sort());
 let base=signature(selected()),cached=volatileDrafts.get(key);
 try{cached=JSON.parse(storage.getItem(key)||"null")||cached}catch{}
 if(cached&&cached.base===base&&Array.isArray(cached.values)&&cached.values.every(value=>typeof value==="string")){
  const ids=new Set(cached.values);
  inputs.forEach(input=>input.checked=ids.has(String(input.value)));
  onStatus("restored");
 }else if(cached)onStatus("stale");
 const capture=()=>{
  const values=selected();
  if(signature(values)===base){
   volatileDrafts.delete(key);try{storage.removeItem(key)}catch{}
   onStatus("clean");return;
  }
  const draft={base,values};volatileDrafts.set(key,draft);
  try{storage.setItem(key,JSON.stringify(draft));onStatus("local")}
  catch{onStatus("unavailable")}
 };
 inputs.forEach(input=>input.addEventListener("change",capture));
 return {
  saved(){base=signature(selected());volatileDrafts.delete(key);try{storage.removeItem(key)}catch{}},
  dispose(){inputs.forEach(input=>input.removeEventListener("change",capture))},
 };
}
