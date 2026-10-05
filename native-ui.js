/**
 * Breach's canvas-native semantic graph.
 *
 * Widgets are plain JavaScript objects. This module never creates HTML controls,
 * parses markup, reads stylesheets, or asks the DOM to lay out a menu. The small
 * DOM-shaped API keeps game state/action bindings independent of the renderer.
 * native-layout.js owns all rectangles, clipping, drawing, and hit testing.
 */
export const THEME = Object.freeze({
  bg:'#080d10', panel:'#10191e', panelRaised:'#17242b', border:'#32444b',
  text:'#eef4ed', muted:'#95a7ab', accent:'#dcff4a', accentText:'#101909',
  danger:'#ef8078', focus:'#dcff4a', radius:4, controlHeight:46,
  font:'system-ui, -apple-system, sans-serif', spacing:8,
});

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const cssName=name=>String(name).replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);
const jsName=name=>String(name).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
const dataName=name=>`data-${cssName(name)}`;
const zeroRect=()=>({x:0,y:0,left:0,top:0,right:0,bottom:0,width:0,height:0});
function rectOf(value={}){
  const x=finite(value.x??value.left),y=finite(value.y??value.top);
  const width=Math.max(0,finite(value.width??value.w)),height=Math.max(0,finite(value.height??value.h));
  return {x,y,left:x,top:y,right:x+width,bottom:y+height,width,height};
}
function nodeList(items){Object.defineProperty(items,'item',{value:index=>items[index]||null,enumerable:false});return items;}
function splitOutside(text,separator=','){
  const parts=[];let start=0,depth=0,quote='';
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quote){if(char===quote&&text[i-1]!=='\\')quote='';continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='('||char==='[')depth++;else if(char===')'||char===']')depth--;
    else if(!depth&&char===separator){parts.push(text.slice(start,i).trim());start=i+1;}
  }
  parts.push(text.slice(start).trim());return parts.filter(Boolean);
}
function unescapeSelector(value){return value.replace(/\\(.)/g,'$1');}
const selectorCache=new Map();
function selectorParts(selector){
  if(selectorCache.has(selector))return selectorCache.get(selector);
  const parts=[];let token='',depth=0,quote='',join=null;
  const flush=()=>{if(token.trim()){parts.push({selector:token.trim(),join});token='';join=' ';}};
  for(let i=0;i<selector.length;i++){
    const char=selector[i];
    if(quote){token+=char;if(char===quote&&selector[i-1]!=='\\')quote='';continue;}
    if(char==='"'||char==="'"){quote=char;token+=char;continue;}
    if(char==='('||char==='[')depth++;else if(char===')'||char===']')depth--;
    if(!depth&&/[>+~]/.test(char)){flush();join=char;continue;}
    if(!depth&&/\s/.test(char)){flush();continue;}
    token+=char;
  }
  flush();if(selectorCache.size>512)selectorCache.clear();selectorCache.set(selector,parts);return parts;
}
function matchesCompound(node,selector,scope){
  if(!isWidget(node)||node.nodeType!==1)return false;
  let i=0;
  const tag=selector.match(/^(\*|[\w-]+)/);
  if(tag){if(tag[1]!=='*'&&node.localName!==tag[1].toLowerCase())return false;i=tag[0].length;}
  while(i<selector.length){
    const mark=selector[i++];
    if(mark==='.'||mark==='#'){
      const match=selector.slice(i).match(/^(?:\\.|[\w-])+/);if(!match)return false;
      const name=unescapeSelector(match[0]);i+=match[0].length;
      if(mark==='.'?!node.classList.contains(name):node.id!==name)return false;
    }else if(mark==='['){
      let end=i,quote='';for(;end<selector.length;end++){const c=selector[end];if(quote){if(c===quote&&selector[end-1]!=='\\')quote='';}else if(c==='"'||c==="'")quote=c;else if(c===']')break;}
      const raw=selector.slice(i,end).trim();i=end+1;
      const attr=raw.match(/^([^\s~|^$*!=]+)\s*(?:(~=|\|=|\^=|\$=|\*=|!=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*([iIsS])?)?$/);
      if(!attr)return false;
      const [,name,op,dq,sq,bare,flag]=attr,actual=node.getAttribute(unescapeSelector(name));
      if(!op){if(actual===null)return false;continue;}
      let a=actual===null?'':String(actual),b=unescapeSelector(dq??sq??bare??'');if(flag?.toLowerCase()==='i'){a=a.toLowerCase();b=b.toLowerCase();}
      if(op==='='&&(actual===null||a!==b))return false;
      if(op==='!='&&a===b)return false;
      if(op==='~='&&!a.split(/\s+/).includes(b))return false;
      if(op==='|='&&a!==b&&!a.startsWith(`${b}-`))return false;
      if(op==='^='&&(!b||!a.startsWith(b)))return false;
      if(op==='$='&&(!b||!a.endsWith(b)))return false;
      if(op==='*='&&(!b||!a.includes(b)))return false;
    }else if(mark===':'){
      const match=selector.slice(i).match(/^[\w-]+/);if(!match)return false;
      const name=match[0];i+=name.length;let argument='';
      if(selector[i]==='('){let depth=1,start=++i,quote='';for(;i<selector.length&&depth;i++){const c=selector[i];if(quote){if(c===quote&&selector[i-1]!=='\\')quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')depth++;else if(c===')')depth--;}argument=selector.slice(start,i-1);}
      if(name==='not'){if(matchesSelector(node,argument,scope))return false;}
      else if(name==='is'||name==='where'){if(!matchesSelector(node,argument,scope))return false;}
      else if(name==='has'){if(!node.querySelector(argument))return false;}
      else if(name==='scope'){if(node!==scope)return false;}
      else if(name==='disabled'){if(!node.disabled)return false;}
      else if(name==='enabled'){if(node.disabled)return false;}
      else if(name==='checked'){if(!node.checked&&!node.selected)return false;}
      else if(name==='focus'||name==='focus-visible'){if(node.ownerDocument?.activeElement!==node)return false;}
      else if(name==='focus-within'){if(!node.contains(node.ownerDocument?.activeElement))return false;}
      else if(name==='first-child'){if(node.parentElement?.firstElementChild!==node)return false;}
      else if(name==='last-child'){if(node.parentElement?.lastElementChild!==node)return false;}
      else if(name==='only-child'){if(node.parentElement?.children.length!==1)return false;}
      else if(name==='empty'){if(node.childNodes.some(child=>child.nodeType===1||child.textContent))return false;}
      else if(name==='root'){if(node!==node.ownerDocument?.root)return false;}
      else if(name==='nth-child'){
        const index=(node.parentElement?.children.indexOf(node)??-1)+1;
        if(argument==='odd'?index%2!==1:argument==='even'?index%2!==0:index!==Number(argument))return false;
      }else return false;
    }else return false;
  }
  return true;
}
function matchesSelector(node,selector,scope=node){
  return splitOutside(String(selector||'')).some(group=>{
    const parts=selectorParts(group);
    function test(candidate,index){
      if(!candidate||!matchesCompound(candidate,parts[index].selector,scope))return false;
      if(!index)return true;
      const join=parts[index].join;
      if(join==='>')return test(candidate.parentElement,index-1);
      if(join==='+')return test(candidate.previousElementSibling,index-1);
      if(join==='~'){for(let previous=candidate.previousElementSibling;previous;previous=previous.previousElementSibling)if(test(previous,index-1))return true;return false;}
      for(let parent=candidate.parentElement;parent;parent=parent.parentElement)if(test(parent,index-1))return true;
      return false;
    }
    return parts.length>0&&test(node,parts.length-1);
  });
}
class ClassTokens{
  constructor(widget){this.widget=widget;}
  get value(){return this.widget._attrs.class||'';}
  set value(value){this.widget.setAttribute('class',value);}
  _tokens(){return this.value.split(/\s+/).filter(Boolean);}
  get length(){return this._tokens().length;}
  contains(token){return this._tokens().includes(String(token));}
  add(...tokens){const next=new Set(this._tokens());for(const token of tokens)if(String(token))next.add(String(token));this.value=[...next].join(' ');}
  remove(...tokens){const remove=new Set(tokens.map(String));this.value=this._tokens().filter(token=>!remove.has(token)).join(' ');}
  toggle(token,force){const present=this.contains(token),next=force===undefined?!present:!!force;if(next)this.add(token);else this.remove(token);return next;}
  replace(oldToken,newToken){if(!this.contains(oldToken))return false;this.value=this._tokens().map(token=>token===oldToken?String(newToken):token).join(' ');return true;}
  item(index){return this._tokens()[index]||null;}
  forEach(callback,thisArg){this._tokens().forEach((token,index)=>callback.call(thisArg,token,index,this));}
  entries(){return this._tokens().entries();} keys(){return this._tokens().keys();} values(){return this._tokens().values();}
  [Symbol.iterator](){return this.values();} toString(){return this.value;}
}
function makeStyle(widget){
  const values=Object.create(null);
  const api={
    setProperty(name,value){const key=jsName(name),next=String(value??'');if(values[key]!==next){values[key]=next;widget._changed('attributes','style');}},
    getPropertyValue(name){return values[jsName(name)]??'';},
    getPropertyPriority(){return '';},
    removeProperty(name){const key=jsName(name),old=values[key]||'';delete values[key];if(old)widget._changed('attributes','style');return old;},
    toString(){return Object.entries(values).map(([key,value])=>`${cssName(key)}: ${value}`).join('; ');},
  };
  return new Proxy(api,{
    get(target,key){if(key==='cssText')return target.toString();if(key===Symbol.iterator)return function*(){yield* Object.keys(values).map(cssName);};if(key==='length')return Object.keys(values).length;return key in target?target[key]:values[jsName(key)]??'';},
    set(target,key,value){if(key==='cssText'){if(String(value||'')===target.toString())return true;for(const k of Object.keys(values))delete values[k];for(const declaration of String(value||'').split(';')){const colon=declaration.indexOf(':');if(colon>0)values[jsName(declaration.slice(0,colon).trim())]=declaration.slice(colon+1).trim();}widget._changed('attributes','style');}else target.setProperty(key,value);return true;},
    ownKeys(){return Object.keys(values);},getOwnPropertyDescriptor(){return {configurable:true,enumerable:true};},
  });
}
const eventFields=['detail','key','code','repeat','shiftKey','ctrlKey','metaKey','altKey','clientX','clientY','pageX','pageY','screenX','screenY','offsetX','offsetY','movementX','movementY','button','buttons','pointerId','pointerType','isPrimary','pressure','width','height','tiltX','tiltY','twist','deltaX','deltaY','deltaZ','deltaMode','relatedTarget','data','inputType'];
export function createUiEvent(type,fields={}){
  const original=fields.originalEvent||fields.nativeEvent||(typeof fields.preventDefault==='function'?fields:null);
  const event={type:String(type),bubbles:fields.bubbles??true,cancelable:fields.cancelable??true,composed:true,target:null,currentTarget:null,eventPhase:0,defaultPrevented:!!fields.defaultPrevented,propagationStopped:false,immediatePropagationStopped:false,timeStamp:fields.timeStamp??globalThis.performance?.now?.()??Date.now(),isTrusted:!!fields.isTrusted,originalEvent:original};
  for(const key of eventFields)if(fields[key]!==undefined)event[key]=fields[key];
  for(const [key,value] of Object.entries(fields))if(!(key in event)&&typeof value!=='function')event[key]=value;
  event.preventDefault=()=>{if(event.cancelable){event.defaultPrevented=true;original?.preventDefault?.();}};
  event.stopPropagation=()=>{event.propagationStopped=true;original?.stopPropagation?.();};
  event.stopImmediatePropagation=()=>{event.immediatePropagationStopped=true;event.propagationStopped=true;original?.stopImmediatePropagation?.();};
  event.composedPath=()=>[...(event._path||[])];
  Object.defineProperties(event,{cancelBubble:{get:()=>event.propagationStopped,set:value=>{if(value)event.stopPropagation();}},returnValue:{get:()=>!event.defaultPrevented,set:value=>{if(value===false)event.preventDefault();}}});
  return event;
}
function addListener(target,type,callback,options){
  if(!callback)return;const capture=typeof options==='boolean'?options:!!options?.capture;
  const listeners=target._listeners.get(type)||[];
  if(listeners.some(item=>item.callback===callback&&item.capture===capture))return;
  if(options?.signal?.aborted)return;
  const record={callback,capture,once:!!options?.once,passive:!!options?.passive};listeners.push(record);target._listeners.set(type,listeners);
  if(options?.signal)options.signal.addEventListener('abort',()=>removeListener(target,type,callback,options),{once:true});
}
function removeListener(target,type,callback,options){const capture=typeof options==='boolean'?options:!!options?.capture;const next=(target._listeners.get(type)||[]).filter(item=>item.callback!==callback||item.capture!==capture);if(next.length)target._listeners.set(type,next);else target._listeners.delete(type);}
function invokeListeners(target,event,capture){
  event.currentTarget=target;
  for(const record of [...(target._listeners?.get(event.type)||[])]){
    if(record.capture!==capture||event.immediatePropagationStopped)continue;
    if(record.once)removeListener(target,event.type,record.callback,{capture});
    try{if(typeof record.callback==='function')record.callback.call(target,event);else record.callback.handleEvent?.(event);}catch(error){if(typeof globalThis.reportError==='function')globalThis.reportError(error);else setTimeout(()=>{throw error;},0);}
  }
  if(!capture&&!event.immediatePropagationStopped&&typeof target[`on${event.type}`]==='function')target[`on${event.type}`].call(target,event);
}
export const isWidget=value=>!!value&&value.__nativeWidget===true;
export class Widget{
  constructor(type='div',ownerDocument=null){
    this.__nativeWidget=true;this.ownerDocument=ownerDocument;this.kind=String(type).toLowerCase();this.localName=this.kind;
    this.nodeType=this.kind==='#text'?3:1;this.nodeName=this.nodeType===3?'#text':this.kind.toUpperCase();this.tagName=this.nodeType===3?undefined:this.nodeName;
    this.parentNode=null;this.childNodes=[];this._attrs=Object.create(null);this._listeners=new Map();this._rect=zeroRect();this._data='';this._value='';this._scrollTop=0;this._scrollLeft=0;this._scrollHeight=0;this._scrollWidth=0;
    this.layoutStyle={};this.classList=new ClassTokens(this);this.style=makeStyle(this);
    this.dataset=new Proxy(Object.create(null),{get:(_,key)=>typeof key==='symbol'?undefined:this._attrs[dataName(key)],set:(_,key,value)=>{this.setAttribute(dataName(key),String(value));return true;},deleteProperty:(_,key)=>{this.removeAttribute(dataName(key));return true;},has:(_,key)=>this.hasAttribute(dataName(key)),ownKeys:()=>Object.keys(this._attrs).filter(key=>key.startsWith('data-')).map(key=>jsName(key.slice(5))),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
  }
  _changed(type='attributes',attributeName){this.ownerDocument?._changed(this,type,attributeName);}
  get children(){return nodeList(this.childNodes.filter(node=>node.nodeType===1));}
  get parentElement(){return isWidget(this.parentNode)&&this.parentNode.nodeType===1?this.parentNode:null;}
  get firstChild(){return this.childNodes[0]||null;} get lastChild(){return this.childNodes.at(-1)||null;}
  get firstElementChild(){return this.children[0]||null;} get lastElementChild(){return this.children.at(-1)||null;}
  get childElementCount(){return this.children.length;}
  get nextSibling(){const list=this.parentNode?.childNodes||[];return list[list.indexOf(this)+1]||null;}
  get previousSibling(){const list=this.parentNode?.childNodes||[];return list[list.indexOf(this)-1]||null;}
  get nextElementSibling(){let next=this.nextSibling;while(next&&next.nodeType!==1)next=next.nextSibling;return next;}
  get previousElementSibling(){let previous=this.previousSibling;while(previous&&previous.nodeType!==1)previous=previous.previousSibling;return previous;}
  get isConnected(){for(let node=this;node;node=node.parentNode)if(node===this.ownerDocument?.root)return true;return false;}
  get visible(){if(!this.isConnected)return false;for(let node=this;node;node=node.parentElement)if(node.hidden||node.classList.contains('hide')||node.style.display==='none'||node.style.visibility==='hidden'||node.layoutStyle?.display==='none')return false;return true;}
  get id(){return this._attrs.id||'';} set id(value){this.setAttribute('id',value);}
  get className(){return this.classList.value;} set className(value){this.classList.value=value;}
  get textContent(){return this.nodeType===3?this._data:this.childNodes.map(node=>node.textContent).join('');}
  set textContent(value){const text=String(value??'');if(this.nodeType===3){if(text!==this._data){this._data=text;this._changed('characterData');}return;}if(!this.childNodes.length&&!text||this.childNodes.length===1&&this.firstChild.nodeType===3&&this.firstChild.textContent===text)return;this.replaceChildren(...(text?[this.ownerDocument?.createTextNode(text)||Object.assign(new Widget('#text',this.ownerDocument),{_data:text})]:[]));}
  get innerText(){return this.textContent;} set innerText(value){this.textContent=value;}
  get data(){return this._data;} set data(value){this.textContent=value;}
  get nodeValue(){return this.nodeType===3?this._data:null;} set nodeValue(value){if(this.nodeType===3)this.textContent=value;}
  get innerHTML(){return this.textContent;}
  set innerHTML(value){const text=String(value??'');if(/<\/?[a-zA-Z!][^>]*>/.test(text))throw new TypeError('Canvas widgets do not parse HTML. Build explicit widget descriptors or use textContent.');this.textContent=text;}
  setAttribute(name,value){name=String(name);const next=String(value??'');if(name==='style'){this.style.cssText=next;return;}if(this._attrs[name]===next)return;this._attrs[name]=next;if(name==='value')this._value=next;if(name==='src')this._loadImage(next);if((name==='width'||name==='height')&&this.source)this.source[name]=finite(next,name==='width'?300:150);this._changed('attributes',name);}
  getAttribute(name){if(name==='style')return this.style.cssText||null;return Object.hasOwn(this._attrs,name)?this._attrs[name]:null;}
  getAttributeNames(){return [...Object.keys(this._attrs),...(this.style.cssText?['style']:[])];}
  hasAttribute(name){return name==='style'?!!this.style.cssText:Object.hasOwn(this._attrs,name);}
  removeAttribute(name){if(name==='style'){this.style.cssText='';return;}if(Object.hasOwn(this._attrs,name)){delete this._attrs[name];this._changed('attributes',name);}}
  toggleAttribute(name,force){const present=this.hasAttribute(name),next=force===undefined?!present:!!force;if(next)this.setAttribute(name,'');else this.removeAttribute(name);return next;}
  get attributes(){return nodeList(this.getAttributeNames().map(name=>({name,value:this.getAttribute(name)})));}
  get hidden(){return this.hasAttribute('hidden');} set hidden(value){this.toggleAttribute('hidden',!!value);}
  get inert(){return this.hasAttribute('inert');} set inert(value){this.toggleAttribute('inert',!!value);}
  get disabled(){return this.hasAttribute('disabled');} set disabled(value){this.toggleAttribute('disabled',!!value);}
  get checked(){return this.hasAttribute('checked');} set checked(value){this.toggleAttribute('checked',!!value);}
  get selected(){return this.hasAttribute('selected');} set selected(value){this.toggleAttribute('selected',!!value);}
  get type(){return this._attrs.type||(this.kind==='button'?'button':this.kind==='input'?'text':'');} set type(value){this.setAttribute('type',value);}
  get tabIndex(){if(this.hasAttribute('tabindex'))return finite(this._attrs.tabindex,-1);return ['button','input','select','textarea'].includes(this.kind)||(this.kind==='a'&&this.hasAttribute('href'))?0:-1;} set tabIndex(value){this.setAttribute('tabindex',value);}
  get value(){if(this.kind==='select'){return this._value||(this.options.find(option=>option.selected)||this.options[0])?.value||'';}if(this.kind==='option')return this._attrs.value??this.textContent;return this._value||this._attrs['data-value']||'';} set value(value){const next=String(value??'');if(this._value===next)return;this._value=next;if(this.kind==='select')for(const option of this.options)option.selected=option.value===next;this._changed('value');}
  get valueAsNumber(){return Number(this.value);} set valueAsNumber(value){this.value=String(value);}
  get options(){return this.kind==='select'?this.querySelectorAll('option'):nodeList([]);}
  get selectedIndex(){return this.options.findIndex(option=>option.value===this.value);} set selectedIndex(index){this.value=this.options[index]?.value||'';}
  get width(){return this.source?.width??finite(this._attrs.width,300);} set width(value){const next=Math.max(0,finite(value));if(this.width===next)return;if(this.source)this.source.width=next;this._attrs.width=String(next);this._changed('attributes','width');}
  get height(){return this.source?.height??finite(this._attrs.height,150);} set height(value){const next=Math.max(0,finite(value));if(this.height===next)return;if(this.source)this.source.height=next;this._attrs.height=String(next);this._changed('attributes','height');}
  _loadImage(src){if(this.kind!=='img'||typeof globalThis.Image!=='function')return;if(!this.source){this.source=new globalThis.Image();this.source.addEventListener('load',()=>{this._changed('image');this.dispatchEvent(createUiEvent('load',{bubbles:false}));});this.source.addEventListener('error',()=>this.dispatchEvent(createUiEvent('error',{bubbles:false})));}this.source.src=src;}
  get complete(){return !!this.source?.complete;} get naturalWidth(){return this.source?.naturalWidth||0;} get naturalHeight(){return this.source?.naturalHeight||0;}
  _coerce(node){if(isWidget(node))return node;if(typeof node==='string'||typeof node==='number')return this.ownerDocument.createTextNode(String(node));return this.ownerDocument?._wrapSource(node);}
  appendChild(node){const child=this._coerce(node);if(!child)throw new TypeError('Only widgets, text, and canvas image surfaces belong in the native UI graph.');if(child===this||child.contains(this))throw new Error('Cannot create a widget cycle.');if(child.parentNode)child.parentNode.removeChild(child);const adopt=item=>{item.ownerDocument=this.ownerDocument;for(const next of item.childNodes)adopt(next);};adopt(child);child.parentNode=this;this.childNodes.push(child);this._changed('childList');return node;}
  append(...nodes){for(const node of nodes.flat())if(node!==null&&node!==undefined)this.appendChild(node);}
  prepend(...nodes){let reference=this.firstChild;for(const node of nodes.flat())if(node!==null&&node!==undefined)this.insertBefore(node,reference);}
  insertBefore(node,reference){if(reference==null)return this.appendChild(node);const target=isWidget(reference)?reference:this.ownerDocument?._sourceWrappers.get(reference);if(target?.parentNode!==this)throw new Error('Reference widget is not a child.');if(node===reference)return node;const child=this._coerce(node);if(child===this||child.contains(this))throw new Error('Cannot create a widget cycle.');if(child.parentNode)child.parentNode.removeChild(child);child.ownerDocument=this.ownerDocument;child.parentNode=this;this.childNodes.splice(this.childNodes.indexOf(target),0,child);this._changed('childList');return node;}
  removeChild(node){const child=isWidget(node)?node:this.ownerDocument?._sourceWrappers.get(node),index=this.childNodes.indexOf(child);if(index<0)throw new Error('Widget is not a child.');this.childNodes.splice(index,1);child.parentNode=null;this._changed('childList');return node;}
  replaceChildren(...nodes){for(const child of this.childNodes)child.parentNode=null;this.childNodes=[];this.append(...nodes);this._changed('childList');}
  replaceChild(next,previous){this.insertBefore(next,previous);this.removeChild(previous);return previous;}
  replaceWith(...nodes){const parent=this.parentNode;if(!parent)return;for(const node of nodes)parent.insertBefore(node,this);this.remove();}
  before(...nodes){if(this.parentNode)for(const node of nodes)this.parentNode.insertBefore(node,this);}
  after(...nodes){const parent=this.parentNode,reference=this.nextSibling;if(parent)for(const node of nodes)parent.insertBefore(node,reference);}
  remove(){this.parentNode?.removeChild(this);}
  contains(node){for(let item=node;item;item=item.parentNode)if(item===this)return true;return false;}
  matches(selector){return matchesSelector(this,selector,this);}
  closest(selector){for(let node=this;node;node=node.parentElement)if(matchesSelector(node,selector,node))return node;return null;}
  querySelectorAll(selector){const found=[];const walk=node=>{for(const child of node.childNodes){if(matchesSelector(child,selector,this))found.push(child);walk(child);}};walk(this);return nodeList(found);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  getElementsByClassName(name){return this.querySelectorAll(String(name).split(/\s+/).map(token=>`.${token}`).join(''));}
  getElementsByTagName(name){return this.querySelectorAll(name);}
  getRootNode(){return this.ownerDocument||this;}
  cloneNode(deep=false){const clone=new Widget(this.kind,this.ownerDocument);for(const [name,value] of Object.entries(this._attrs))clone.setAttribute(name,value);clone.style.cssText=this.style.cssText;clone._data=this._data;clone._value=this._value;if(this.kind==='canvas')clone.source=this.ownerDocument?._newCanvas();if(deep)for(const child of this.childNodes)clone.appendChild(child.cloneNode(true));return clone;}
  compareDocumentPosition(other){if(other===this)return 0;if(this.contains(other))return 4|16;if(other?.contains(this))return 2|8;const root=this.ownerDocument?.root;if(!root?.contains(this)||!root.contains(other))return 1;const order=[root,...root.querySelectorAll('*')];return order.indexOf(this)<order.indexOf(other)?4:2;}
  addEventListener(type,callback,options){addListener(this,String(type),callback,options);}
  removeEventListener(type,callback,options){removeListener(this,String(type),callback,options);}
  dispatchEvent(event){return !this.ownerDocument?.dispatch(this,event.type,event).defaultPrevented;}
  click(){if(!this.disabled&&!this.closest('[inert],[aria-disabled="true"]'))this.ownerDocument?.activate(this,{detail:0});}
  focus(options){this.ownerDocument?.setFocus(this,options);}
  blur(){if(this.ownerDocument?.activeElement===this)this.ownerDocument.setFocus(null);}
  setPointerCapture(pointerId){this.ownerDocument?._captures.set(pointerId,this);try{this.ownerDocument?.canvas?.setPointerCapture?.(pointerId);}catch{}}
  releasePointerCapture(pointerId){if(this.ownerDocument?._captures.get(pointerId)!==this)return;this.ownerDocument._captures.delete(pointerId);try{this.ownerDocument.canvas?.releasePointerCapture?.(pointerId);}catch{}this.ownerDocument.dispatch(this,'lostpointercapture',{pointerId,bubbles:false});}
  hasPointerCapture(pointerId){return this.ownerDocument?._captures.get(pointerId)===this;}
  setRect(rect){this._rect=rectOf(rect);return this._rect;}
  getBoundingClientRect(){return {...this._rect,toJSON:()=>({...this._rect})};}
  getClientRects(){return nodeList(this.visible&&this._rect.width>0&&this._rect.height>0?[this.getBoundingClientRect()]:[]);}
  get clientWidth(){return this._rect.width;} get clientHeight(){return this._rect.height;}
  get offsetWidth(){return this.clientWidth;} get offsetHeight(){return this.clientHeight;}
  get offsetLeft(){return this._rect.left-(this.parentElement?._rect.left||0);} get offsetTop(){return this._rect.top-(this.parentElement?._rect.top||0);}
  get offsetParent(){return this.parentElement;}
  get scrollHeight(){return Math.max(this._scrollHeight,this.clientHeight);} set scrollHeight(value){this._scrollHeight=Math.max(0,finite(value));}
  get scrollWidth(){return Math.max(this._scrollWidth,this.clientWidth);} set scrollWidth(value){this._scrollWidth=Math.max(0,finite(value));}
  get scrollTop(){return this._scrollTop;} set scrollTop(value){const next=Math.max(0,Math.min(Math.max(0,this.scrollHeight-this.clientHeight),finite(value)));if(this._scrollTop!==next){this._scrollTop=next;this._changed('scroll');this.dispatchEvent(createUiEvent('scroll',{bubbles:false}));}}
  get scrollLeft(){return this._scrollLeft;} set scrollLeft(value){const next=Math.max(0,Math.min(Math.max(0,this.scrollWidth-this.clientWidth),finite(value)));if(this._scrollLeft!==next){this._scrollLeft=next;this._changed('scroll');this.dispatchEvent(createUiEvent('scroll',{bubbles:false}));}}
  scrollTo(x,y){if(typeof x==='object'){this.scrollLeft=x.left??this.scrollLeft;this.scrollTop=x.top??this.scrollTop;}else{this.scrollLeft=x;this.scrollTop=y;}}
  scrollBy(x,y){if(typeof x==='object')this.scrollTo(this.scrollLeft+finite(x.left),this.scrollTop+finite(x.top));else this.scrollTo(this.scrollLeft+finite(x),this.scrollTop+finite(y));}
  scrollIntoView(){const rect=this._rect;for(let parent=this.parentElement;parent;parent=parent.parentElement){const clip=parent._rect;if(parent.scrollHeight>parent.clientHeight){if(rect.top<clip.top)parent.scrollTop-=clip.top-rect.top;else if(rect.bottom>clip.bottom)parent.scrollTop+=rect.bottom-clip.bottom;}if(parent.scrollWidth>parent.clientWidth){if(rect.left<clip.left)parent.scrollLeft-=clip.left-rect.left;else if(rect.right>clip.right)parent.scrollLeft+=rect.right-clip.right;}}}
  getContext(...args){return this.source?.getContext?.(...args)||null;}
  toDataURL(...args){return this.source?.toDataURL?.(...args)||'';}
  toBlob(...args){return this.source?.toBlob?.(...args);}
}
for(const name of ['min','max','step','name','href','download','title','placeholder','src','alt','role','target','accept','inputMode'])Object.defineProperty(Widget.prototype,name,{configurable:true,get(){return this._attrs[name]??'';},set(value){this.setAttribute(name,value);}});
Object.defineProperty(Widget.prototype,'maxLength',{configurable:true,get(){return finite(this._attrs.maxlength,-1);},set(value){this.setAttribute('maxlength',value);}});
Object.defineProperty(Widget.prototype,'isContentEditable',{get(){return this.getAttribute('contenteditable')==='true';}});

/** Stable presentation defaults, with explicit native layout/style overrides only. */
export function nativeStyle(widget){
  const defaults={display:widget?.hidden||widget?.classList?.contains('hide')?'none':'block',visibility:'visible',opacity:'1',overflow:'visible',overflowX:'visible',overflowY:'visible',gridTemplateColumns:'1fr',color:THEME.text,backgroundColor:'transparent',background:'transparent',fontFamily:THEME.font,fontSize:'14px',fontWeight:'500',fontStyle:'normal',lineHeight:'20px',textAlign:'left',textTransform:'none',position:'relative',zIndex:'0',borderTopLeftRadius:`${THEME.radius}px`};
  const style={...defaults,...widget?.layoutStyle};
  if(widget?.style)for(const key of Object.keys(widget.style))style[key]=widget.style[key];
  if(style.overflow!=='visible'){if(!widget?.layoutStyle?.overflowX&&!widget?.style?.overflowX)style.overflowX=style.overflow;if(!widget?.layoutStyle?.overflowY&&!widget?.style?.overflowY)style.overflowY=style.overflow;}
  style.getPropertyValue=name=>style[jsName(name)]??'';return style;
}

/**
 * The returned object is a document facade scoped to this UI. It never patches
 * window.document. Browser lifecycle/keyboard events are explicitly bridged.
 */
export function createNativeUi({canvas=null,tree={type:'div',id:'appRoot'},realElements={},onFocus=()=>{},browserDocument=globalThis.document}={}){
  const subscribers=new Set(),bridges=new Map(),realMap=new Map(Object.entries(realElements));
  let scheduled=false,lastMutation=null,disposed=false;
  const ui={
    __nativeUi:true,canvas,browserDocument,revision:0,root:null,_activeElement:null,_listeners:new Map(),_captures:new Map(),_sourceWrappers:new WeakMap(),
    get body(){return this.root;},get documentElement(){return this.root;},get activeElement(){return this._activeElement||this.root;},
    get defaultView(){return browserDocument?.defaultView||globalThis;},get hidden(){return !!browserDocument?.hidden;},get visibilityState(){return browserDocument?.visibilityState||'visible';},get readyState(){return browserDocument?.readyState||'complete';},
    get fullscreenElement(){return browserDocument?.fullscreenElement||null;},get webkitFullscreenElement(){return browserDocument?.webkitFullscreenElement||null;},get webkitCurrentFullScreenElement(){return browserDocument?.webkitCurrentFullScreenElement||null;},get fullscreenEnabled(){return browserDocument?.fullscreenEnabled;},get webkitFullscreenEnabled(){return browserDocument?.webkitFullscreenEnabled;},
    get pointerLockElement(){return browserDocument?.pointerLockElement||null;},get webkitPointerLockElement(){return browserDocument?.webkitPointerLockElement||null;},
    hasFocus(){return browserDocument?.hasFocus?.()??true;},
    _changed(target,type,attributeName){
      if(disposed)return;this.revision++;lastMutation={revision:this.revision,target,type,attributeName};
      if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(disposed)return;const change=lastMutation;for(const callback of [...subscribers])callback(change);});}
    },
    invalidate(){this._changed(this.root,'invalidate');},subscribe(callback){subscribers.add(callback);return()=>subscribers.delete(callback);},
    _newCanvas(){if(browserDocument?.createElement)return browserDocument.createElement('canvas');if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(300,150);return null;},
    _wrapSource(source){
      if(!source)return null;if(this._sourceWrappers.has(source))return this._sourceWrappers.get(source);
      const kind=String(source.tagName||'').toLowerCase()||(typeof source.getContext==='function'?'canvas':'');if(kind!=='canvas'&&kind!=='img')return null;
      const widget=new Widget(kind,this);widget.source=source;this._sourceWrappers.set(source,widget);
      for(const attr of Array.from(source.attributes||[]))widget.setAttribute(attr.name,attr.value);
      // Detached rendering surfaces have no browser layout. Preview code reads
      // their explicit graph rectangle through these instance-local delegates.
      if(!source.isConnected){try{Object.defineProperty(source,'getBoundingClientRect',{configurable:true,value:()=>widget.getBoundingClientRect()});Object.defineProperty(source,'getClientRects',{configurable:true,value:()=>widget.getClientRects()});Object.defineProperty(source,'clientWidth',{configurable:true,get:()=>widget.clientWidth});Object.defineProperty(source,'clientHeight',{configurable:true,get:()=>widget.clientHeight});}catch{}}
      return widget;
    },
    createElement(type){if(String(type).toLowerCase()==='canvas')return this._newCanvas();return new Widget(type,this);},
    createElementNS(namespace,type){const widget=new Widget(type,this);widget.namespaceURI=namespace;return widget;},
    createTextNode(text){const widget=new Widget('#text',this);widget._data=String(text??'');return widget;},
    createDocumentFragment(){return new Widget('fragment',this);},
    build(descriptor){
      if(isWidget(descriptor))return descriptor;
      if(typeof descriptor==='string'||typeof descriptor==='number')return this.createTextNode(descriptor);
      if(!descriptor)return null;
      const widget=new Widget(descriptor.type||descriptor.kind||'div',this);
      if(widget.nodeType===3){widget._data=String(descriptor.text??'');return widget;}
      if(widget.kind==='canvas'){widget.source=this._newCanvas();if(widget.source){this._sourceWrappers.set(widget.source,widget);const source=widget.source;try{Object.defineProperty(source,'getBoundingClientRect',{configurable:true,value:()=>widget.getBoundingClientRect()});Object.defineProperty(source,'clientWidth',{configurable:true,get:()=>widget.clientWidth});Object.defineProperty(source,'clientHeight',{configurable:true,get:()=>widget.clientHeight});}catch{}}}
      if(descriptor.id)widget.id=descriptor.id;
      if(descriptor.classes)widget.className=Array.isArray(descriptor.classes)?descriptor.classes.join(' '):descriptor.classes;
      for(const [key,value] of Object.entries(descriptor.attrs||{}))if(value!==false&&value!==null&&value!==undefined)widget.setAttribute(key,value===true?'':value);
      if(descriptor.style)Object.assign(widget.style,descriptor.style);
      if(descriptor.layout)widget.layout={...descriptor.layout};
      if(descriptor.text!==undefined&&descriptor.text!==null)widget.append(this.createTextNode(descriptor.text));
      for(const child of descriptor.children||[]){const item=this.build(child);if(item)widget.appendChild(item);}
      return widget;
    },
    getElementById(id){id=String(id);if(realMap.has(id))return realMap.get(id);const find=node=>{if(node?.id===id)return node;for(const child of node?.childNodes||[]){const found=find(child);if(found)return found;}return null;};return find(this.root);},
    querySelectorAll(selector){const result=[];if(this.root?.matches(selector))result.push(this.root);result.push(...(this.root?.querySelectorAll(selector)||[]));for(const [id,node] of realMap){if(node?.matches?.(selector)&&!result.includes(node)&&!result.some(item=>item.id===id))result.push(node);}return nodeList(result);},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    getElementsByClassName(name){return this.querySelectorAll(String(name).split(/\s+/).map(token=>`.${token}`).join(''));},getElementsByTagName(name){return this.querySelectorAll(name);},
    getRootNode(){return this;},contains(node){return this.root?.contains(node)||false;},
    registerRealElement(id,node){realMap.set(String(id),node);return node;},
    dispatch(target,type,fields={}){
      const event=createUiEvent(type,fields);let reachedTarget=false;event.target=target||this.root;
      const path=[];for(let node=event.target;isWidget(node);node=node.parentNode)path.push(node);if(!path.length&&event.target!==this)path.push(event.target);path.push(this);event._path=path;
      for(let i=path.length-1;i>0&&!event.propagationStopped;i--){event.eventPhase=1;invokeListeners(path[i],event,true);}
      if(!event.propagationStopped){reachedTarget=true;event.eventPhase=2;invokeListeners(path[0],event,true);if(!event.immediatePropagationStopped)invokeListeners(path[0],event,false);}
      if(event.bubbles&&!event.propagationStopped)for(let i=1;i<path.length&&!event.propagationStopped;i++){event.eventPhase=3;invokeListeners(path[i],event,false);}
      // A preview's rendering canvas can retain native Three.js/gesture hooks,
      // although it is never attached or allowed to own menu layout.
      if(reachedTarget&&isWidget(target)&&target.source?.dispatchEvent&&/^(pointer|mouse|click|wheel|contextmenu)/.test(type)){
        try{const Constructor=type.startsWith('pointer')?globalThis.PointerEvent:type==='wheel'?globalThis.WheelEvent:globalThis.MouseEvent;const forwarded=new (Constructor||globalThis.Event)(type,{...Object.fromEntries(eventFields.filter(key=>event[key]!==undefined).map(key=>[key,event[key]])),bubbles:false,cancelable:true});target.source.dispatchEvent(forwarded);if(forwarded.defaultPrevented)event.preventDefault();}catch{}
      }
      event.currentTarget=null;event.eventPhase=0;return event;
    },
    dispatchEvent(event){return !this.dispatch(this,event.type,event).defaultPrevented;},
    addEventListener(type,callback,options){addListener(this,String(type),callback,options);ensureBridge(String(type));},
    removeEventListener(type,callback,options){removeListener(this,String(type),callback,options);},
    setFocus(widget,options={}){
      if(widget&&!isWidget(widget)){widget.focus?.(options);return false;}
      if(widget&&(widget.disabled||!widget.visible||widget.closest('[inert],[aria-disabled="true"]')))return false;
      const previous=this._activeElement;if(previous===widget)return true;
      this._activeElement=widget||null;
      if(previous){this.dispatch(previous,'blur',{bubbles:false,relatedTarget:widget});this.dispatch(previous,'focusout',{relatedTarget:widget});}
      if(widget){this.dispatch(widget,'focus',{bubbles:false,relatedTarget:previous});this.dispatch(widget,'focusin',{relatedTarget:previous});if(!options.preventScroll)widget.scrollIntoView();}
      this._changed(widget||this.root,'focus');onFocus(widget,previous);return true;
    },
    focus(widget,options){return this.setFocus(widget,options);},
    activate(widget,fields={}){if(!widget||widget.disabled||widget.closest?.('[inert],[aria-disabled="true"]'))return null;this.setFocus(widget,{preventScroll:true});return this.dispatch(widget,'click',{bubbles:true,cancelable:true,detail:0,...fields});},
    adjustValue(widget,delta,{commit=true}={}){
      if(!widget||widget.disabled||!delta)return false;let options=widget.kind==='select'?widget.options:[];
      if(widget.dataset?.gameControl==='cycle'){try{options=JSON.parse(widget.dataset.options||'[]');}catch{options=[];}}
      const previous=String(widget.value);
      if(options.length){const enabled=options.filter(option=>!option.disabled),index=Math.max(0,enabled.findIndex(option=>String(option.value)===previous));widget.value=enabled[Math.max(0,Math.min(enabled.length-1,index+(delta>0?1:-1)))]?.value??previous;}
      else{const min=widget.min===''?-Infinity:finite(widget.min,-Infinity),max=widget.max===''?Infinity:finite(widget.max,Infinity),step=Math.abs(finite(widget.step,1))||1;widget.value=String(Number(Math.max(min,Math.min(max,finite(previous)+step*(delta>0?1:-1))).toFixed(6)));}
      if(String(widget.value)===previous)return false;this.dispatch(widget,'input');if(commit)this.dispatch(widget,'change');return true;
    },
    getPointerCapture(pointerId){return this._captures.get(pointerId)||null;},
    destroy(){disposed=true;for(const [type,handler] of bridges)browserDocument?.removeEventListener?.(type,handler,true);bridges.clear();subscribers.clear();this._listeners.clear();this._captures.clear();this._activeElement=null;},
  };
  for(const method of ['exitFullscreen','webkitExitFullscreen','webkitCancelFullScreen','exitPointerLock','webkitExitPointerLock','getSelection'])if(typeof browserDocument?.[method]==='function')ui[method]=browserDocument[method].bind(browserDocument);
  function ensureBridge(type){
    if(bridges.has(type)||!browserDocument?.addEventListener||/^(focus|blur|focusin|focusout|input|change)$/.test(type))return;
    const handler=original=>{
      if(disposed)return;
      if(original.target===canvas&&/^(pointer|mouse|click|wheel)/.test(type))return;
      const keyboard=/^key/.test(type),target=keyboard?(ui._activeElement?.visible?ui._activeElement:ui.root):original.target===browserDocument?ui:original.target;
      const event=ui.dispatch(target,type,original);
      if(keyboard&&type==='keydown'&&!event.defaultPrevented&&!event.propagationStopped&&!original.repeat&&(original.key==='Enter'||original.key===' '||original.code==='Space')){
        const focused=ui._activeElement;if(focused?.visible&&focused.matches('button,[role="button"],a[href]')&&!focused.disabled){event.preventDefault();ui.activate(focused,{detail:0});}
      }
    };
    bridges.set(type,handler);browserDocument.addEventListener(type,handler,true);
  }
  ui.root=Array.isArray(tree)?ui.build({type:'div',id:'appRoot',children:tree}):ui.build(tree);
  ensureBridge('keydown');ensureBridge('keyup');
  return ui;
}

function roundedPath(ctx,rect,radius){const r=rectOf(rect),rad=Math.min(Math.max(0,radius),r.width/2,r.height/2);ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(r.x,r.y,r.width,r.height,rad);else{ctx.moveTo(r.x+rad,r.y);ctx.lineTo(r.right-rad,r.y);ctx.quadraticCurveTo(r.right,r.y,r.right,r.y+rad);ctx.lineTo(r.right,r.bottom-rad);ctx.quadraticCurveTo(r.right,r.bottom,r.right-rad,r.bottom);ctx.lineTo(r.x+rad,r.bottom);ctx.quadraticCurveTo(r.x,r.bottom,r.x,r.bottom-rad);ctx.lineTo(r.x,r.y+rad);ctx.quadraticCurveTo(r.x,r.y,r.x+rad,r.y);}ctx.closePath();}
export function drawPanel(ctx,rect,{fill=THEME.panel,stroke=THEME.border,radius=THEME.radius,alpha=1,lineWidth=1}={}){ctx.save();ctx.globalAlpha*=alpha;roundedPath(ctx,rect,radius);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke&&lineWidth>0){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}ctx.restore();}
export function drawLabel(ctx,text,rect,{color=THEME.text,fontSize=14,weight=500,align='left',valign='middle',maxWidth,padding=0,font=THEME.font}={}){
  const r=rectOf(rect);ctx.save();ctx.fillStyle=color;ctx.font=`${weight} ${fontSize}px ${font}`;ctx.textAlign=align;ctx.textBaseline=valign==='top'?'top':valign==='bottom'?'bottom':'middle';const x=align==='center'?r.x+r.width/2:align==='right'?r.right-padding:r.x+padding,y=valign==='top'?r.y+padding:valign==='bottom'?r.bottom-padding:r.y+r.height/2;const width=Math.max(0,maxWidth??r.width-padding*2);if(width)ctx.fillText(String(text??''),x,y,width);ctx.restore();
}
export function drawButton(ctx,rect,{text='',active=false,focused=false,pressed=false,disabled=false,danger=false,primary=false,fontSize=14,align='center',...panel}={}){
  const fill=primary||active?THEME.accent:pressed?THEME.border:THEME.panelRaised,color=primary||active?THEME.accentText:danger?THEME.danger:THEME.text;
  drawPanel(ctx,rect,{fill,stroke:focused?THEME.focus:active?THEME.accent:THEME.border,alpha:disabled?.42:1,lineWidth:focused?2:1,...panel});
  ctx.save();ctx.globalAlpha*=disabled?.5:1;drawLabel(ctx,text,rect,{color,fontSize,weight:700,align,padding:12});ctx.restore();
}
export function directionNeighbor(current,list,dx,dy){
  if(!list?.length)return null;if(!current)return list[0];const a=rectOf(current.getBoundingClientRect?.()||current.rect||current),ax=a.x+a.width/2,ay=a.y+a.height/2;let best=null,bestScore=Infinity;
  for(const candidate of list){if(candidate===current)continue;const b=rectOf(candidate.getBoundingClientRect?.()||candidate.rect||candidate),x=b.x+b.width/2-ax,y=b.y+b.height/2-ay,forward=x*dx+y*dy;if(forward<=1)continue;const sideways=Math.abs(x*dy-y*dx),score=forward+sideways*2.4+sideways*sideways/Math.max(24,forward);if(score<bestScore){best=candidate;bestScore=score;}}
  return best;
}
