import * as vscode from 'vscode';
import { AgentEvent, SessionStats } from '../agent/types';

export class ChatPanel {
  private static current?: ChatPanel;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly submit: (text: string) => Promise<void>,
    private readonly actions: {
      newSession(): void; clearSession(): void; stop(): void; addFiles(): void;
      addSkill(): void; addMcp(): void; history(): void; loadSession(id: string): void; deleteSession(id: string): void; togglePin(id: string): void; toggleAutoApprove(): void;
    }
  ) {
    panel.webview.html = this.html();
    panel.webview.onDidReceiveMessage(async message => {
      if (message.type === 'send') await this.submit(String(message.text));
      if (message.type === 'new') this.actions.newSession();
      if (message.type === 'clear') this.actions.clearSession();
      if (message.type === 'stop') this.actions.stop();
      if (message.type === 'addFiles') this.actions.addFiles();
      if (message.type === 'addSkill') this.actions.addSkill();
      if (message.type === 'addMcp') this.actions.addMcp();
      if (message.type === 'history') this.actions.history();
      if (message.type === 'loadSession') this.actions.loadSession(String(message.id));
      if (message.type === 'deleteSession') this.actions.deleteSession(String(message.id));
      if (message.type === 'togglePin') this.actions.togglePin(String(message.id));
      if (message.type === 'toggleAutoApprove') this.actions.toggleAutoApprove();
    });
    panel.onDidDispose(() => { if (ChatPanel.current?.panel === panel) ChatPanel.current = undefined; });
  }

  static show(context: vscode.ExtensionContext, submit: (text: string) => Promise<void>, actions: ChatPanel['actions']) {
    if (ChatPanel.current) { ChatPanel.current.panel.reveal(); return ChatPanel.current; }
    const panel = vscode.window.createWebviewPanel('localAgent.chat', 'NIGHTFALL', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    ChatPanel.current = new ChatPanel(panel, submit, actions);
    return ChatPanel.current;
  }

  add(event: AgentEvent) { this.panel.webview.postMessage(event); }
  clear() { this.panel.webview.postMessage({ type: 'clearMessages' }); }
  history(sessions: Array<{ id: string; title: string; updatedAt: number; pinned: boolean }>) { this.panel.webview.postMessage({ type: 'history', sessions }); }
  restore(messages: Array<{ role: string; content: string | null }>) { this.panel.webview.postMessage({ type: 'restore', messages }); }
  metrics(stats: SessionStats | undefined) { const inputTokens = stats?.inputTokens || 0; const outputTokens = stats?.outputTokens || 0; const tokensPerSecond = stats?.elapsedMs ? outputTokens / (stats.elapsedMs / 1000) : 0; this.panel.webview.postMessage({ type: 'sessionMetrics', inputTokens, outputTokens, tokensPerSecond }); }
  setAutoApprove(enabled: boolean) { this.panel.webview.postMessage({ type: 'autoApprove', enabled }); }

  private html() {
    const nonce = String(Date.now());
    return `<!doctype html>
<html><head><meta charset="UTF-8"><style>
:root{--ink:#e6e8eb;--muted:#a9afb7;--canvas:#202225;--card:#292c30;--field:#32363b;--line:#444950;--yellow:#f2c94c;--yellow-soft:#5b4d26;--pink:#d87597;--blue:#5fa8c7;--green:#8fba60;--purple:#9b8ac1;}
*{box-sizing:border-box}body{margin:0;padding:20px;min-width:280px;color:var(--ink);background:var(--canvas);font:400 14px Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.45}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:9px;background:var(--card);padding:13px 15px;box-shadow:0 2px 8px #0005;margin-bottom:8px}
h1{font-size:16px;line-height:1;margin:0;font-weight:700;letter-spacing:.2px;color:var(--ink)}.tag{border:1px solid #806b2e;border-radius:999px;background:var(--yellow-soft);color:var(--yellow);padding:4px 8px;font-size:10px;font-weight:600;white-space:nowrap}
.panel{border:1px solid var(--line);border-radius:9px;background:var(--card);box-shadow:0 2px 8px #0004;padding:12px}#messages{min-height:50vh;max-height:58vh;overflow:auto;padding:2px}
.msg{white-space:pre-wrap;margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:8px;box-shadow:none;background:#35393e}.user{background:#294652;color:#dcecf2}.assistant{background:#35462b;color:#e5f1d8}.tool{background:#40384d;color:#eee7fa;font-size:12px}.error{background:#55362f;color:#ffdcd2}.status{background:var(--yellow-soft);color:#f8e6a0;font-size:12px}
textarea{display:block;width:100%;background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:11px;font:400 14px Inter,ui-sans-serif,system-ui,sans-serif;resize:vertical;outline:none}textarea:focus{border-color:var(--yellow);box-shadow:0 0 0 1px var(--yellow);background:#383c41}
button{margin:9px 5px 0 0;padding:7px 10px;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:6px;box-shadow:none;font:600 12px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:background .12s,border-color .12s,color .12s}button:hover{background:#3a3e43;border-color:#707782;color:var(--yellow)}button:active{background:#454a51}button:disabled{opacity:.45;cursor:not-allowed}#send{background:var(--yellow);border-color:var(--yellow);color:#1b1c1e;font-weight:700}#send:hover{background:#ffda62;color:#1b1c1e}#stop{color:#f0a4a4;border-color:#805252}#autoApprove.active{background:var(--yellow);border-color:var(--yellow);color:#1b1c1e}
#history{display:none;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.session{display:block;width:100%;text-align:left;background:var(--field);color:var(--ink);margin:7px 0}
#metrics{color:var(--muted);font-size:11px;margin:0 2px 14px;letter-spacing:.2px}
</style></head><body>
<header><h1>NIGHTFALL</h1><span class="tag">LOCAL / READY</span></header><div id="metrics">TOKENS 0 IN · 0 OUT · — TOK/S</div>
<section class="panel"><div id="messages"></div><textarea id="input" rows="4" placeholder="Ask the local agent..."></textarea>
<div><button id="send">SEND</button><button id="stop">STOP</button><button id="autoApprove">AUTO-APPROVE: OFF</button><button id="files">+ FILES</button><button id="skill">+ SKILL</button><button id="mcp">+ MCP</button><button id="historyBtn">HISTORY</button><button id="new">NEW SESSION</button><button id="clear">CLEAR</button></div><div id="history"></div></section>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),box=document.getElementById('messages'),input=document.getElementById('input'),send=document.getElementById('send'),autoBtn=document.getElementById('autoApprove'),history=document.getElementById('history'),metrics=document.getElementById('metrics');let totalIn=0,totalOut=0,autoApprove=false;
function add(cls,text){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;box.appendChild(d);d.scrollIntoView()}
send.onclick=()=>{if(input.value.trim()){add('user','YOU: '+input.value);vscode.postMessage({type:'send',text:input.value});input.value='';send.disabled=true}};
document.getElementById('stop').onclick=()=>vscode.postMessage({type:'stop'});autoBtn.onclick=()=>vscode.postMessage({type:'toggleAutoApprove'});document.getElementById('files').onclick=()=>vscode.postMessage({type:'addFiles'});document.getElementById('skill').onclick=()=>vscode.postMessage({type:'addSkill'});document.getElementById('mcp').onclick=()=>vscode.postMessage({type:'addMcp'});document.getElementById('historyBtn').onclick=()=>vscode.postMessage({type:'history'});document.getElementById('new').onclick=()=>vscode.postMessage({type:'new'});document.getElementById('clear').onclick=()=>{box.innerHTML='';vscode.postMessage({type:'clear'})};
function setAutoApprove(enabled){autoApprove=Boolean(enabled);autoBtn.textContent=autoApprove?'AUTO-APPROVE: ON':'AUTO-APPROVE: OFF';autoBtn.classList.toggle('active',autoApprove)}
window.addEventListener('message',e=>{const m=e.data;if(m.type==='clearMessages'){box.innerHTML='';totalIn=0;totalOut=0;setAutoApprove(false);metrics.textContent='TOKENS 0 IN · 0 OUT · — TOK/S'}else if(m.type==='autoApprove'){setAutoApprove(m.enabled)}else if(m.type==='assistant'){add('assistant','AGENT: '+(m.text||''));send.disabled=false}else if(m.type==='tool_call')add('tool','TOOL: '+m.tool+' '+JSON.stringify(m.args||{}));else if(m.type==='tool_result')add('tool','RESULT: '+(m.text||''));else if(m.type==='approval')add('tool','APPROVAL: '+(m.text||''));else if(m.type==='error'){add('error','ERROR: '+(m.text||''));send.disabled=false}else if(m.type==='status'){add('status',m.text==='running'?'AGENT IS RUNNING...':'AGENT '+m.text.toUpperCase()+'.');send.disabled=m.text==='running'}else if(m.type==='metrics'){totalIn+=m.inputTokens||0;totalOut+=m.outputTokens||0;metrics.textContent='TOKENS '+totalIn+' IN · '+totalOut+' OUT · '+(m.tokensPerSecond?m.tokensPerSecond.toFixed(1):'—')+' TOK/S'}else if(m.type==='history'){history.style.display='block';history.innerHTML='<b>OLD SESSIONS</b>';if(!m.sessions.length)history.innerHTML+='<div>NO SAVED SESSIONS YET.</div>';m.sessions.forEach(s=>{const row=document.createElement('div'),load=document.createElement('button'),pin=document.createElement('button'),del=document.createElement('button');load.className='session';load.textContent=(s.pinned?'★ ':'')+s.title+' · '+new Date(s.updatedAt).toLocaleString();load.onclick=()=>vscode.postMessage({type:'loadSession',id:s.id});pin.textContent=s.pinned?'UNPIN':'PIN';pin.onclick=()=>vscode.postMessage({type:'togglePin',id:s.id});del.textContent='DELETE';del.onclick=()=>vscode.postMessage({type:'deleteSession',id:s.id});row.appendChild(load);row.appendChild(pin);row.appendChild(del);history.appendChild(row)})}else if(m.type==='restore'){box.innerHTML='';m.messages.forEach(message=>{if(message.role==='user')add('user','YOU: '+(message.content||''));else if(message.role==='assistant')add('assistant','AGENT: '+(message.content||''))})}else if(m.type==='sessionMetrics'){totalIn=m.inputTokens||0;totalOut=m.outputTokens||0;metrics.textContent='TOKENS '+totalIn+' IN · '+totalOut+' OUT · '+(m.tokensPerSecond?m.tokensPerSecond.toFixed(1):'—')+' TOK/S'}});
</script></body></html>`;
  }
}
