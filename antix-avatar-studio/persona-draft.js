// Local editing drafts are deliberately separate from workspace/model payloads.
const volatileDrafts = new Map();
export function bindPersonaDraft({fields,scope,id,storage=localStorage,onStatus=()=>{}}) {
  const key=`second-me-persona-draft:${JSON.stringify([scope,id])}`;
  const read=()=>Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.value]));
  let base=JSON.stringify(read());
  let cached=volatileDrafts.get(key);
  try{cached=JSON.parse(storage.getItem(key)||"null")||cached}catch{}
  if(cached && cached.base===base && cached.values && Object.keys(fields).every(name=>typeof cached.values[name]==="string")){
    for(const [name,field] of Object.entries(fields))field.value=cached.values[name];
    onStatus("restored");
  }
  const capture=()=>{
    const values=read();
    if(JSON.stringify(values)===base){
      volatileDrafts.delete(key);
      try{storage.removeItem(key)}catch{}
      onStatus("clean");return;
    }
    const draft={base,values};
    volatileDrafts.set(key,draft);
    try{storage.setItem(key,JSON.stringify(draft));onStatus("local")}
    catch{onStatus("unavailable")}
  };
  for(const field of Object.values(fields))field.addEventListener("input",capture);
  return {
    saved(){
      base=JSON.stringify(read());volatileDrafts.delete(key);
      try{storage.removeItem(key)}catch{}
    },
    dispose(){for(const field of Object.values(fields))field.removeEventListener("input",capture)},
  };
}
