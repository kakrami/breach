// Storage restrictions must not prevent the game or its controls from starting.
export function createSafeStorage(name){
  const memory=new Map();let backend;
  try{backend=globalThis[name];}catch{}
  return Object.freeze({
    getItem(key){if(memory.has(key))return memory.get(key);try{return backend?.getItem(key)??null;}catch{return null;}},
    setItem(key,value){value=String(value);memory.set(key,value);try{backend?.setItem(key,value);}catch{}},
    removeItem(key){memory.set(key,null);try{backend?.removeItem(key);}catch{}}
  });
}
