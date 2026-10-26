package main

import (
	"browser-mac/internal/personalpages"
	"browser-mac/internal/web"
	"encoding/json"
	"errors"
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
	if len(recipe) > 65536 {
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
	if len(selectors) > 24 {
		return nil, errors.New("Zu viele Quellfelder")
	}
	for _, selector := range selectors {
		if selector == "" || len(selector) > 1000 {
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

const personalizedSourceScript = `function lunaPersonalizedSource(selectors) {
 if(!['http:','https:'].includes(location.protocol)) return {error:'Nur echte Webseiten können als Quelle dienen.'};
 const text=el=>{const copy=el.cloneNode(true);copy.querySelectorAll('script,style,input,textarea,select,[contenteditable="true"],[hidden]').forEach(n=>n.remove());return (copy.textContent||'').trim().replace(/\s+/g,' ').slice(0,4000)};
 const safe=el=>!el.closest('input,textarea,select,script,style,[contenteditable="true"],[hidden]');
 const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
 const selectorFor=el=>{const parts=[];while(el&&el!==document.body&&parts.length<30){if(el.id){parts.unshift('#'+CSS.escape(el.id));return parts.join(' > ')}const tag=el.tagName.toLowerCase();const siblings=el.parentElement?[...el.parentElement.children].filter(n=>n.tagName===el.tagName):[];parts.unshift(tag+':nth-of-type('+(siblings.indexOf(el)+1)+')');el=el.parentElement}return el===document.body?'body > '+parts.join(' > '):''};
 if(selectors.length){return {url:location.href,title:document.title,fields:selectors.map(selector=>{try{const nodes=[...document.querySelectorAll(selector)].filter(safe).slice(0,20);return {selector,values:nodes.map(text).filter(Boolean)}}catch{return {selector,values:[]}}})}}
 const seen=new Set();const sourceRoot=document.querySelector('main,[role="main"]')||document.body;const nodes=[...sourceRoot.querySelectorAll('h1,h2,h3,p,li,dt,dd,td,span,div,[role="heading"],[data-testid]')].filter(el=>(el.children.length===0||el.matches('h1,h2,h3,p,li,dt,dd,td,[role="heading"],[data-testid]'))&&safe(el)&&visible(el)).filter(el=>{const value=text(el);if(!value||seen.has(value))return false;seen.add(value);return true}).slice(0,180).map(el=>({selector:selectorFor(el),tag:el.tagName.toLowerCase(),text:text(el)})).filter(node=>node.selector);
 return {url:location.href,title:document.title,nodes};
}`
