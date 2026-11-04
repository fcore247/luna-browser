package main

import (
	"browser-mac/internal/pagemonitor"
	"browser-mac/internal/web"
	"context"
	"encoding/json"
	"errors"
)

func (a *App) PageMonitors() []pagemonitor.Watch {
	if a.pageMonitors == nil {
		return []pagemonitor.Watch{}
	}
	return a.pageMonitors.List()
}
func (a *App) PageMonitorAction(id, action string) ([]pagemonitor.Watch, error) {
	if a.pageMonitors == nil {
		return nil, errors.New("Seitenüberwachung nicht verfügbar")
	}
	return a.pageMonitors.Update(id, action)
}
func (a *App) PageMonitorConfigure(id string, interval int, refresh bool) ([]pagemonitor.Watch, error) {
	if a.pageMonitors == nil {
		return nil, errors.New("Seitenüberwachung nicht verfügbar")
	}
	return a.pageMonitors.Edit(id, interval, refresh)
}

func (a *App) readMonitoredPage(ctx context.Context, w pagemonitor.Watch) (string, error) {
	target, err := a.mcpUI(ctx, "monitor_target", map[string]any{"url": w.URL})
	if err != nil {
		return "", err
	}
	obj, ok := target.(map[string]any)
	if !ok {
		return "", errors.New("Warte auf geöffnete Seite")
	}
	id, ok := obj["tab_id"].(float64)
	if !ok {
		return "", errors.New("Warte auf geöffnete Seite und Anmeldung")
	}
	config, _ := json.Marshal(map[string]string{"url": w.URL, "selector": w.Selector})
	result, err := web.Evaluate(int(id), `JSON.stringify((function(c){
 const same=(a,b)=>{const x=new URL(a),y=new URL(b);x.hash='';y.hash='';return x.href===y.href};
 if(!same(location.href,c.url)||document.readyState!=='complete')return {error:'Warte auf geöffnete Zielseite'};
 const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 if([...document.querySelectorAll('input[type=password]')].some(visible))return {error:'Warte auf Anmeldung'};
 let root;try{root=document.querySelector(c.selector)}catch{return {error:'Ungültiger Inhaltsselektor'}};
 if(!root||!visible(root))return {error:'Warte auf angemeldeten Inhaltsbereich'};
 const editing=document.activeElement?.matches('input:not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]');
 const dirty=[...document.querySelectorAll('input,textarea,select')].some(e=>{if(!visible(e)||e.disabled||e.readOnly||e.type==='hidden')return false;if(e.tagName==='SELECT'){const options=[...e.options];if(e.multiple)return options.some(o=>o.selected!==o.defaultSelected);const initial=options.findIndex(o=>o.defaultSelected);return e.selectedIndex!==(initial<0?0:initial)};if(['checkbox','radio'].includes(e.type))return e.checked!==e.defaultChecked;return !['submit','button','reset'].includes(e.type)&&e.value!==e.defaultValue});
 const clone=root.cloneNode(true);clone.querySelectorAll('script,style,noscript,template,input,textarea,select,[contenteditable],[hidden],[aria-hidden=true]').forEach(e=>e.remove());
 const text=(clone.textContent||'').replace(/\s+/g,' ').trim();
 if(!text)return {error:'Warte auf lesbaren Inhalt'};
 if(text.length>2000000)return {error:'Inhalt größer als 2 MiB'};
 return {text,can_refresh:!editing&&!dirty&&![...document.querySelectorAll('[contenteditable=true]')].some(visible)};
})(`+string(config)+`))`)
	if err != nil {
		return "", err
	}
	var snapshot struct {
		Text       string `json:"text"`
		Error      string `json:"error"`
		CanRefresh bool   `json:"can_refresh"`
	}
	if err = json.Unmarshal([]byte(result), &snapshot); err != nil {
		return "", err
	}
	if snapshot.Error != "" {
		return "", errors.New(snapshot.Error)
	}
	if w.RefreshEnabled() {
		if !snapshot.CanRefresh {
			return "", errors.New("Warte mit Neuladen: Eingabe oder ungespeicherte Formulardaten")
		}
		if _, err := a.mcpUI(ctx, "monitor_refresh", map[string]any{"url": w.URL, "tab_id": int(id), "watch_id": w.ID}); err != nil {
			return "", err
		}
		off := false
		w.AutoRefresh = &off
		return a.readMonitoredPage(ctx, w)
	}
	return snapshot.Text, nil
}
