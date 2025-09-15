// 统一的设置持久化与回传模块（独立文件）
// 目标：
// 1) 首屏恢复：优先 /export-settings → localStorage.ui_values → 默认值
// 2) 自动保存：所有 input/textarea/select 变化 → localStorage 与 /save-settings（带重试与缓存）
// 3) 关键字段同步：mindmap_* 写入 localStorage，供 mem 模式与 API 使用
// 4) 提供 SettingsPersistence.bootstrap() 入口，最小侵入集成到 index.html

(function(global){
  'use strict';

  // 在嵌入模式下（embed=1），优先使用外部（父页/Cookie）与本地 UI 值，
  // 禁止在首屏恢复阶段用服务端导出的 mindmap_* 覆盖 localStorage，避免 5173 反向覆盖 7860 设置
  // 但如果有force_update标志，则允许覆盖
  var __isEmbed = (function(){
    try{ return (new URLSearchParams(location.search)).get('embed') === '1'; }catch(e){ return false; }
  })();
  var __forceUpdate = (function(){
    try{ return (new URLSearchParams(location.search)).get('mm_force_update') === '1'; }catch(e){ return false; }
  })();

  // 简单防抖
  function debounce(fn, wait){
    var t; return function(){ var ctx=this, args=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, wait); };
  }

  function collectUIValues(){
    var map = {};
    try{
      var els = document.querySelectorAll('input, textarea, select');
      els.forEach(function(el){
        if(!el.id) return;
        var v = null;
        if(el.type==='checkbox' || el.type==='radio'){ v = !!el.checked; }
        else { v = el.value; }
        map[el.id] = v;
      });
    }catch(e){}
    return map;
  }

  function applyUIValues(values){
    try{
      Object.keys(values||{}).forEach(function(id){
        var el = document.getElementById(id);
        if(!el) return;
        var v = values[id];
        if(el.type==='checkbox' || el.type==='radio') el.checked = !!v; else el.value = (v!=null? String(v):'');
      });
    }catch(e){}
  }

  // 带重试的保存到后端
  async function saveSettingsWithRetry(payload, maxRetries){
    maxRetries = (typeof maxRetries==='number' && maxRetries>=0) ? maxRetries : 3;
    var attempt = 0; var lastErr=null;
    // 依次尝试候选 base，解决嵌入到不同端口导致的跨源失败
    function baseCandidates(){
      var c = [];
      try{ if(window.__AM_BASE__) c.push(String(window.__AM_BASE__).replace(/\/$/, '')); }catch(_e){}
      c.push('http://127.0.0.1:5173');
      c.push('http://localhost:5173');
      // 当前源最后尝试（通常没有 save-settings）
      c.push('');
      return c;
    }
    var bases = baseCandidates();
    while(attempt <= maxRetries){
      try{
        var ok = false; var lastErr = null;
        for(var i=0;i<bases.length;i++){
          var u = (bases[i] ? (bases[i] + '/save-settings') : '/save-settings');
          try{
            var r = await fetch(u, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
            if(r && r.ok){ ok = true; break; }
            lastErr = new Error('HTTP '+(r&&r.status));
          }catch(e){ lastErr = e; }
        }
        if(!ok) throw (lastErr||new Error('ALL_FAILED'));
        return true;
      }catch(e){ lastErr=e; }
      if(attempt===maxRetries) break; // 退出
      var delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(function(r){ setTimeout(r, delay); });
      attempt++;
    }
    if(lastErr) console.warn('保存设置失败（已重试）:', lastErr.message||lastErr);
    return false;
  }

  function writeMindmapKeysToLocalStorage(payload){
    try{
      if(payload.mindmap_api_base!=null) localStorage.setItem('mindmap-api-base', String(payload.mindmap_api_base||''));
      if(payload.mindmap_model!=null) localStorage.setItem('mindmap-model', String(payload.mindmap_model||''));
      if(payload.mindmap_system_prompt!=null) localStorage.setItem('mindmap-system-prompt', String(payload.mindmap_system_prompt||''));
      if(payload.mindmap_user_prompt!=null) localStorage.setItem('mindmap-user-prompt-template', String(payload.mindmap_user_prompt||''));
      if(payload.mindmap_api_key!=null) localStorage.setItem('mindmap-api-key', String(payload.mindmap_api_key||''));
    }catch(e){}
  }

  async function restoreThenBind(){
    // 1) 首屏恢复：服务端 → 本地
    // 恢复时也走候选 base
    async function loadCfg(){
      var bases = [];
      try{ if(window.__AM_BASE__) bases.push(String(window.__AM_BASE__).replace(/\/$/, '')); }catch(_e){}
      bases.push('http://127.0.0.1:5173');
      bases.push('http://localhost:5173');
      bases.push('');
      for(var i=0;i<bases.length;i++){
        try{
          var u = (bases[i] ? (bases[i] + '/export-settings') : '/export-settings');
          var r = await fetch(u);
          if(r && r.ok){ return await r.json(); }
        }catch(_e){}
      }
      return null;
    }
    try{
      var cfg = await loadCfg();
      // 在嵌入且 force_update 模式下，跳过服务器 ui_values 对 UI 的覆盖
      if(cfg && cfg.ui_values){ if(!__isEmbed || !__forceUpdate){ applyUIValues(cfg.ui_values); } try{ localStorage.setItem('ui_values', JSON.stringify(cfg.ui_values)); }catch(_){} }
      // 在嵌入且 force_update 模式下，不将服务器 mindmap_* 写回 localStorage，避免覆盖 7860 传入
      if(cfg && (!__isEmbed && !__forceUpdate)){
        writeMindmapKeysToLocalStorage({
          mindmap_api_base: cfg.mindmap_api_base,
          mindmap_model: cfg.mindmap_model,
          mindmap_system_prompt: cfg.mindmap_system_prompt,
          mindmap_user_prompt: cfg.mindmap_user_prompt,
          mindmap_api_key: cfg.mindmap_api_key
        });
      }
    }catch(e){
      // 退回 localStorage
      try{ var local = JSON.parse(localStorage.getItem('ui_values')||'{}'); applyUIValues(local); }catch(_){ }
    }

    // 2) 绑定事件：所有控件变更 → 自动保存
    try{
      var handler = debounce(function(){
        try{
          var payload = {
            mindmap_api_base: document.getElementById('mindmap-api-base')?.value || localStorage.getItem('mindmap-api-base') || '',
            mindmap_model: document.getElementById('mindmap-model-select')?.value || localStorage.getItem('mindmap-model') || '',
            mindmap_system_prompt: document.getElementById('mindmap-system-prompt')?.value || localStorage.getItem('mindmap-system-prompt') || '',
            mindmap_user_prompt: document.getElementById('mindmap-user-prompt-template')?.value || localStorage.getItem('mindmap-user-prompt-template') || '',
            mindmap_api_key: document.getElementById('mindmap-api-key')?.value || localStorage.getItem('mindmap-api-key') || '',
            ui_values: collectUIValues()
          };
          // 先写本地，后写后端
          try{ localStorage.setItem('ui_values', JSON.stringify(payload.ui_values||{})); }catch(_e){}
          writeMindmapKeysToLocalStorage(payload);
          saveSettingsWithRetry(payload, 3);
        }catch(e){}
      }, 200);
      var els = document.querySelectorAll('input, textarea, select');
      els.forEach(function(el){
        var evt = (el.tagName==='SELECT') ? 'change' : ((el.type==='checkbox'||el.type==='radio') ? 'change' : 'input');
        el.addEventListener(evt, handler);
      });
    }catch(e){}

    // 3) 首屏轻量同步一次到后端（不阻塞）
    // 注意：在嵌入模式（embed=1）下禁用首屏自动回推，以避免默认值回写覆盖 7860 设置
    // 但如果有force_update标志，则允许回推
    if(!__isEmbed || __forceUpdate){
      try{
        var initPayload = {
          mindmap_api_base: document.getElementById('mindmap-api-base')?.value || localStorage.getItem('mindmap-api-base') || '',
          mindmap_model: document.getElementById('mindmap-model-select')?.value || localStorage.getItem('mindmap-model') || '',
          mindmap_system_prompt: document.getElementById('mindmap-system-prompt')?.value || localStorage.getItem('mindmap-system-prompt') || '',
          mindmap_user_prompt: document.getElementById('mindmap-user-prompt-template')?.value || localStorage.getItem('mindmap-user-prompt-template') || '',
          mindmap_api_key: document.getElementById('mindmap-api-key')?.value || localStorage.getItem('mindmap-api-key') || '',
          ui_values: collectUIValues()
        };
        writeMindmapKeysToLocalStorage(initPayload);
        // 异步触发
        setTimeout(function(){ saveSettingsWithRetry(initPayload, 2); }, 300);
      }catch(e){}
    }
  }

  var SettingsPersistence = {
    bootstrap: function(){
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', function(){ restoreThenBind(); });
      }else{ restoreThenBind(); }
    }
  };

  global.SettingsPersistence = SettingsPersistence;
})(window);


