package main

import (
	"browser-mac/internal/personalpages"
	"browser-mac/internal/web"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

func (a *App) PersonalizedPages() []personalpages.Page {
	if a.personalized == nil {
		return []personalpages.Page{}
	}
	return a.personalized.List()
}
func (a *App) PersonalizedSave(recipe string) error {
	if a.personalized == nil {
		return errors.New("Seitenspeicher nicht verfügbar")
	}
	if len(recipe) > 128*1024 {
		return errors.New("Ansicht zu groß")
	}
	var page personalpages.Page
	decoder := json.NewDecoder(strings.NewReader(recipe))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&page); err != nil {
		return err
	}
	if err := a.personalized.Save(page); err != nil {
		return err
	}
	a.emit("personalized-pages-changed", "")
	return nil
}
func (a *App) PersonalizedEnable(id string, enabled bool) error {
	if a.personalized == nil {
		return errors.New("Seitenspeicher nicht verfügbar")
	}
	err := a.personalized.Enable(id, enabled)
	if err == nil {
		a.emit("personalized-pages-changed", "")
	}
	return err
}
func (a *App) PersonalizedRemove(id string) error {
	if a.personalized == nil {
		return errors.New("Seitenspeicher nicht verfügbar")
	}
	err := a.personalized.Remove(id)
	if err == nil {
		a.emit("personalized-pages-changed", "")
	}
	return err
}
func (a *App) PersonalizedSource(tab int, selectors []string) (map[string]any, error) {
	if len(selectors) > 60 {
		return nil, errors.New("Zu viele Quellfelder")
	}
	for _, selector := range selectors {
		if len(selector) > 1000 {
			return nil, errors.New("Ungültiger Selektor")
		}
	}
	payload, _ := json.Marshal(selectors)
	raw, err := web.Evaluate(tab, personalizedSourceScript+"\nJSON.stringify(lunaPersonalizedSource("+string(payload)+"));")
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err = json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, err
	}
	if message, ok := result["error"].(string); ok {
		return nil, errors.New(message)
	}
	return result, nil
}

const personalizedSourceScript = `function lunaPersonalizedSource(selectors, options={}, configs=[]) {
 if(!['http:','https:'].includes(location.protocol)) return {error:'Nur echte Webseiten können als Quelle dienen.'};
 const safe=el=>!el.closest('input,textarea,select,script,style,[contenteditable="true"],[hidden]');
 const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 const attrs=el=>Object.fromEntries(['alt','title','aria-label','datetime'].map(name=>[name,el.getAttribute(name)||'']));
 const text=el=>{const copy=el.cloneNode(true);copy.querySelectorAll('script,style,input,textarea,select,[contenteditable="true"],[hidden]').forEach(n=>n.remove());return ((copy.textContent||'').trim().replace(/\s+/g,' ')||el.getAttribute('alt')||el.getAttribute('aria-label')||el.getAttribute('title')||'').slice(0,4000)};
 const value=(el,format)=>format?.attribute&&format.attribute!=='text'?(el.getAttribute(format.attribute)||'').slice(0,4000):text(el);
 const safeURL=value=>{try{const u=new URL(value,location.href);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
 const unique=(selector,el)=>{try{const found=document.querySelectorAll(selector);return found.length===1&&found[0]===el}catch{return false}};
 const anchor=el=>{
   if(el.id&&unique('#'+CSS.escape(el.id),el))return '#'+CSS.escape(el.id);
   for(const name of ['data-testid','data-test','data-id','aria-label']){const value=el.getAttribute(name);if(name==='aria-label'&&/\d/.test(value||''))continue;if(value&&value.length<100){const selector=el.tagName.toLowerCase()+'['+name+'="'+CSS.escape(value)+'"]';if(unique(selector,el))return selector}}
   const tag=el.tagName.toLowerCase();if(tag.includes('-')&&unique(tag,el))return tag;
   for(const name of el.classList){if(name.length<40&&!/\d{3}|^(ng-|css-|sc-)/.test(name)){const selector=tag+'.'+CSS.escape(name);if(unique(selector,el))return selector}}
   return '';
 };
 const selectorFor=target=>{const parts=[];let el=target;while(el&&el!==document.body&&parts.length<40){const stable=anchor(el);if(stable){parts.unshift(stable);return parts.join(' > ')}const tag=el.tagName.toLowerCase();const siblings=el.parentElement?[...el.parentElement.children].filter(n=>n.tagName===el.tagName):[];parts.unshift(tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(el)+1)+')':''));el=el.parentElement}return el===document.body?'body > '+parts.join(' > '):''};
 const ancestry=el=>{const nodes=[];for(let parent=el.parentElement;parent&&parent!==document.body&&nodes.length<4;parent=parent.parentElement){const stable=anchor(parent);if(stable)nodes.push({selector:stable,tag:parent.tagName.toLowerCase()})}return nodes};
 const describe=el=>({selector:selectorFor(el),tag:el.tagName.toLowerCase(),text:text(el),attributes:attrs(el),anchors:ancestry(el),href:el.matches('a[href]')?safeURL(el.href):undefined,image:el.matches('img')?safeURL(el.currentSrc||el.src):undefined});
 if(selectors.length) return {url:location.href,title:document.title,fields:selectors.map((selector,index)=>{
   const config=configs[index]||{};
   try{
    if(!selector)return {selector,values:[],count:0};
    const all=[...document.querySelectorAll(selector)].filter(safe), nodes=all.slice(0,50);
    const inside=tag=>[...new Set(nodes.flatMap(el=>[...(el.matches(tag)?[el]:[]),...el.querySelectorAll(tag)]))].filter(safe).slice(0,50);
    const contexts=nodes.flatMap(el=>el.matches('ul,ol')?[...el.children].filter(safe):el.matches('table')?[...el.querySelectorAll('tr')].filter(safe):[el]).slice(0,50);
    const items=config.columns?.length?contexts.map(row=>({cells:config.columns.map(column=>{
      let el;try{el=column.selector===':scope'?row:row.querySelector(column.selector)}catch{return {text:'',error:'Ungültiger Spaltenselektor: '+column.selector}}
      if(!el||!safe(el))return {text:'',missing:true};
      const img=el.matches('img')?el:el.querySelector('img');const link=el.matches('a[href]')?el:el.querySelector('a[href]');
      return {text:value(el,column.format),image:img?safeURL(img.currentSrc||img.src):'',href:link?safeURL(link.href):'',attributes:attrs(el)};
    })})):[];
    return {selector,count:all.length,values:contexts.map(el=>value(el,config.format)).filter(Boolean),nodes:nodes.slice(0,10).map(describe),links:inside('a[href]').map(el=>({href:safeURL(el.href),text:text(el)})).filter(el=>el.href),images:inside('img').map(el=>({src:safeURL(el.currentSrc||el.src),alt:el.alt||''})).filter(el=>el.src),rows:inside('tr').map(el=>[...el.querySelectorAll('th,td')].filter(safe).slice(0,12).map(text)).filter(row=>row.length),items};
   }catch(error){return {selector,count:0,values:[],error:String(error.message||error)}}
 })};
 let elements;
 try{const root=options.root_selector?document.querySelector(options.root_selector):(options.area==='all'?document:(document.querySelector('main,[role="main"],article,#content,#main-content')||document.body));if(!root)return {error:'Inhaltsbereich nicht gefunden: '+options.root_selector};elements=[...root.querySelectorAll(options.selector||'h1,h2,h3,p,li,dt,dd,td,span,div,a[href],img,svg[aria-label],tr,table,ul,ol,[title],[aria-label],[role="heading"],[data-testid]')].filter(el=>safe(el)&&visible(el)&&(options.area==='all'||!el.closest('nav,footer,[role="navigation"],[role="contentinfo"]')));if(root.matches?.(options.selector||'x-no-match'))elements.unshift(root);if(options.values_only)elements=elements.filter(el=>/\d/.test([text(el),...Object.values(attrs(el))].join(' ')));}
 catch(error){return {error:'Ungültiger Suchselektor: '+options.selector+' · '+error.message}}
 if(options.query){const query=options.query.toLocaleLowerCase();elements=elements.filter(el=>[text(el),...Object.values(attrs(el))].some(v=>v.toLocaleLowerCase().includes(query)));elements.sort((a,b)=>text(a).length-text(b).length)}
 else if(!options.selector)elements=elements.filter(el=>el.children.length===0||el.matches('h1,h2,h3,p,li,dt,dd,td,a[href],img,tr,table,ul,ol,[title],[aria-label],[role="heading"],[data-testid]'));
 elements=elements.filter(el=>text(el)||el.matches('img'));
 const offset=Math.max(0,Number(options.offset)||0),limit=100;
 const nodes=elements.slice(offset,offset+limit).map(describe).filter(node=>node.selector);
 return {url:location.href,title:document.title,nodes,total:elements.length,offset,next_offset:offset+limit<elements.length?offset+limit:null};
}
`

func (a *App) PersonalizedInspect(tab int, query, selector string, offset int, area string, valuesOnly bool, rootSelector string) (map[string]any, error) {
	if len(query) > 500 || len(selector) > 1000 || len(rootSelector) > 1000 || (area != "" && area != "main" && area != "all") || offset < 0 || offset > 100000 {
		return nil, errors.New("Ungültige Seitensuche")
	}
	options, _ := json.Marshal(map[string]any{"query": query, "selector": selector, "offset": offset, "area": area, "values_only": valuesOnly, "root_selector": rootSelector})
	return personalizedEvaluate(tab, "[]", string(options), "[]")
}
func (a *App) PersonalizedRead(tab int, fields []personalpages.Field) (map[string]any, error) {
	if len(fields) > 60 {
		return nil, errors.New("Zu viele Bausteine")
	}
	checked := append([]personalpages.Field{}, fields...)
	for i := range checked {
		checked[i].Source = ""
	}
	if len(checked) > 0 {
		if err := personalpages.Validate(personalpages.Page{ID: "read", Title: "Quelle", URL: "https://example.org", Scope: "path", Fields: checked}); err != nil {
			return nil, err
		}
	}
	selectors := []string{}
	for _, field := range fields {
		if len(field.Selector) > 1000 {
			return nil, errors.New("Selektor zu lang")
		}
		selectors = append(selectors, field.Selector)
	}
	raw, _ := json.Marshal(selectors)
	config, _ := json.Marshal(fields)
	result, err := personalizedEvaluate(tab, string(raw), "{}", string(config))
	if err != nil {
		return nil, err
	}
	values, _ := result["fields"].([]any)
	for i, raw := range values {
		if i >= len(fields) {
			break
		}
		value, _ := raw.(map[string]any)
		if value == nil {
			continue
		}
		transformValues(value, "values", fields[i].Format)
		items, _ := value["items"].([]any)
		for _, item := range items {
			row, _ := item.(map[string]any)
			cells, _ := row["cells"].([]any)
			for j, cell := range cells {
				if j >= len(fields[i].Columns) {
					break
				}
				c, _ := cell.(map[string]any)
				if c != nil {
					text, _ := c["text"].(string)
					c["text"] = formatSourceText(text, fields[i].Columns[j].Format)
				}
			}
		}
	}
	return result, nil
}
func personalizedEvaluate(tab int, selectors, options, config string) (map[string]any, error) {
	raw, err := web.Evaluate(tab, personalizedSourceScript+"\nJSON.stringify(lunaPersonalizedSource("+selectors+","+options+","+config+"));")
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err = json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, err
	}
	if message, ok := result["error"].(string); ok {
		return nil, errors.New(message)
	}
	return result, nil
}
func transformValues(result map[string]any, key string, format *personalpages.Format) {
	if format == nil {
		return
	}
	values, _ := result[key].([]any)
	for i, value := range values {
		text, _ := value.(string)
		values[i] = formatSourceText(text, format)
	}
}
func formatSourceText(text string, format *personalpages.Format) string {
	if format == nil {
		return text
	}
	if format.Pattern != "" {
		pattern, err := regexp.Compile(format.Pattern)
		if err != nil {
			return ""
		}
		matches := pattern.FindStringSubmatch(text)
		if format.Group < 0 || format.Group >= len(matches) {
			return ""
		}
		text = matches[format.Group]
	}
	if text != "" && format.Unit != "" {
		text += " " + format.Unit
	}
	return text
}

func (a *App) PersonalizedValidate(recipe string) error {
	if len(recipe) > 128*1024 {
		return errors.New("Ansicht zu groß")
	}
	var page personalpages.Page
	decoder := json.NewDecoder(strings.NewReader(recipe))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&page); err != nil {
		return err
	}
	return personalpages.Validate(page)
}
