import * as vscode from 'vscode';
import { AgentEvent } from '../agent/types';

export class ChatPanel {
  private static current?: ChatPanel;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly submit: (text: string) => Promise<void>,
    private readonly actions: {
      newSession(): void; clearSession(): void; stop(): void; addFiles(): void;
      addSkill(): void; addMcp(): void; history(): void; loadSession(id: string): void;
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
    });
    panel.onDidDispose(() => { if (ChatPanel.current?.panel === panel) ChatPanel.current = undefined; });
  }

  static show(context: vscode.ExtensionContext, submit: (text: string) => Promise<void>, actions: ChatPanel['actions']) {
    if (ChatPanel.current) { ChatPanel.current.panel.reveal(); return ChatPanel.current; }
    const panel = vscode.window.createWebviewPanel('localAgent.chat', 'Local Agent', vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    ChatPanel.current = new ChatPanel(panel, submit, actions);
    return ChatPanel.current;
  }

  add(event: AgentEvent) { this.panel.webview.postMessage(event); }
  clear() { this.panel.webview.postMessage({ type: 'clearMessages' }); }
  history(sessions: Array<{ id: string; title: string; updatedAt: number }>) { this.panel.webview.postMessage({ type: 'history', sessions }); }
  restore(messages: Array<{ role: string; content: string | null }>) { this.panel.webview.postMessage({ type: 'restore', messages }); }

  private html() {
    const nonce = String(Date.now());
    return `<!doctype html>
<html><head><meta charset="UTF-8"><style>
:root{--ink:#f7f0d1;--line:#111;--canvas:#252525;--card:#343434;--yellow:#f2cc4b;--pink:#df829f;--blue:#72b5d2;--green:#aeca70;--purple:#ad9bd2;}
*{box-sizing:border-box}body{margin:0;padding:20px;min-width:280px;color:var(--ink);background:var(--canvas);font:600 14px Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.4}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;border:3px solid var(--line);border-radius:12px;background:var(--yellow);color:#111;padding:14px 16px;box-shadow:6px 6px 0 var(--line);margin-bottom:20px}
h1{font-size:20px;line-height:1;margin:0;font-weight:900;letter-spacing:-.5px}.tag{border:2px solid var(--line);border-radius:999px;background:var(--pink);color:#111;padding:4px 9px;font-size:10px;font-weight:900;white-space:nowrap}
.panel{border:3px solid var(--line);border-radius:12px;background:var(--card);box-shadow:6px 6px 0 var(--line);padding:14px}#messages{min-height:50vh;max-height:58vh;overflow:auto;padding:2px}
.msg{white-space:pre-wrap;margin:12px 0;padding:12px 14px;border:3px solid var(--line);border-radius:10px;box-shadow:4px 4px 0 var(--line);background:#414141}.user{background:var(--blue);color:#111}.assistant{background:var(--green);color:#111}.tool{background:var(--purple);color:#111;font-size:12px}.error{background:#e9937e;color:#111}.status{background:var(--yellow);color:#111;font-size:12px}
textarea{display:block;width:100%;background:#414141;color:var(--ink);border:3px solid var(--line);border-radius:9px;padding:12px;font:600 14px Inter,ui-sans-serif,system-ui,sans-serif;resize:vertical;outline:none}textarea:focus{box-shadow:4px 4px 0 var(--line);background:#4b4b4b}
button{margin:10px 7px 0 0;padding:9px 12px;background:var(--yellow);color:#111;border:3px solid var(--line);border-radius:8px;box-shadow:4px 4px 0 var(--line);font:800 12px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:transform .08s,box-shadow .08s}button:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--line)}button:active{transform:translate(4px,4px);box-shadow:none}button:disabled{opacity:.45;cursor:not-allowed}
#history{display:none;margin-top:16px;padding-top:12px;border-top:3px solid var(--line)}.session{display:block;width:100%;text-align:left;background:#414141;color:var(--ink);margin:8px 0}
</style></head><body>
<header><h1>LOCAL AGENT</h1><span class="tag">LOCAL / READY</span></header>
<section class="panel"><div id="messages"></div><textarea id="input" rows="4" placeholder="Ask the local agent..."></textarea>
<div><button id="send">SEND</button><button id="stop">STOP</button><button id="files">+ FILES</button><button id="skill">+ SKILL</button><button id="mcp">+ MCP</button><button id="historyBtn">HISTORY</button><button id="new">NEW SESSION</button><button id="clear">CLEAR</button></div><div id="history"></div></section>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi(),box=document.getElementById('messages'),input=document.getElementById('input'),send=document.getElementById('send'),history=document.getElementById('history');
function add(cls,text){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;box.appendChild(d);d.scrollIntoView()}
send.onclick=()=>{if(input.value.trim()){add('user','YOU: '+input.value);vscode.postMessage({type:'send',text:input.value});input.value='';send.disabled=true}};
document.getElementById('stop').onclick=()=>vscode.postMessage({type:'stop'});document.getElementById('files').onclick=()=>vscode.postMessage({type:'addFiles'});document.getElementById('skill').onclick=()=>vscode.postMessage({type:'addSkill'});document.getElementById('mcp').onclick=()=>vscode.postMessage({type:'addMcp'});document.getElementById('historyBtn').onclick=()=>vscode.postMessage({type:'history'});document.getElementById('new').onclick=()=>vscode.postMessage({type:'new'});document.getElementById('clear').onclick=()=>{box.innerHTML='';vscode.postMessage({type:'clear'})};
window.addEventListener('message',e=>{const m=e.data;if(m.type==='clearMessages')box.innerHTML='';else if(m.type==='assistant'){add('assistant','AGENT: '+(m.text||''));send.disabled=false}else if(m.type==='tool_call')add('tool','TOOL: '+m.tool+' '+JSON.stringify(m.args||{}));else if(m.type==='tool_result')add('tool','RESULT: '+(m.text||''));else if(m.type==='approval')add('tool','APPROVAL: '+(m.text||''));else if(m.type==='error'){add('error','ERROR: '+(m.text||''));send.disabled=false}else if(m.type==='status'){add('status',m.text==='running'?'AGENT IS RUNNING...':'AGENT '+m.text.toUpperCase()+'.');send.disabled=m.text==='running'}else if(m.type==='history'){history.style.display='block';history.innerHTML='<b>OLD SESSIONS</b>';if(!m.sessions.length)history.innerHTML+='<div>NO SAVED SESSIONS YET.</div>';m.sessions.forEach(s=>{const b=document.createElement('button');b.className='session';b.textContent=s.title+' · '+new Date(s.updatedAt).toLocaleString();b.onclick=()=>vscode.postMessage({type:'loadSession',id:s.id});history.appendChild(b)})}else if(m.type==='restore'){box.innerHTML='';m.messages.forEach(message=>{if(message.role==='user')add('user','YOU: '+(message.content||''));else if(message.role==='assistant')add('assistant','AGENT: '+(message.content||''))})}});
</script></body></html>`;
  }
}
