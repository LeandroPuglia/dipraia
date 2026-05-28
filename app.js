// DiPraia — app.js v2
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── estado ───────────────────────────────────────────────────
let currentUser = null;
let filterMens  = 'todos', filterCmd = 'abertas', filterAlert = 'todos';
let editingMens = null, editingPlano = null, editingProd = null, editingUser = null, novoPlanoMensId = null;
let selectedIcon = '💧';
let fotoDataUrl  = null;

const PROD_ICONS = ['💧','🥤','🧃','🍺','🍹','⚡','🍪','🍫','🥟','🎾','🍶','👕','🏆','🥎','🍬','🕹️'];

// ── helpers ───────────────────────────────────────────────────
const today  = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const pd     = s => { if (!s) return today(); const [y,m,d] = s.split('-'); return new Date(+y,+m-1,+d); };
const diasAte  = s => Math.round((pd(s) - today()) / 86400000);
const fmtDate  = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtDT    = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };
const fmtR     = v => 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtR0    = v => 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});
const initials = n => (n||'?').split(' ').slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const isoToday = () => today().toISOString().split('T')[0];
const addMonths = (s, m) => { const d = new Date(pd(s)); d.setMonth(d.getMonth()+m); return d.toISOString().split('T')[0]; };
const inRange  = (s, de, ate) => { if (!s) return false; const x = s.slice(0,10); return (!de||x>=de)&&(!ate||x<=ate); };

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3000);
}

function calcStatus(m) {
  if (!m.fim_plano || !m.plano_atual) return 'sem_plano';
  const d = diasAte(m.fim_plano);
  if (d < 0)  return 'inadimplente';
  if (d <= 7) return 'vencendo';
  return 'ativo';
}

function statusBadge(m) {
  const s = calcStatus(m);
  if (s === 'sem_plano')    return `<span class="badge bgr">Sem plano</span>`;
  if (s === 'inadimplente') return `<span class="badge br">Vencido ${Math.abs(diasAte(m.fim_plano))}d</span>`;
  if (s === 'vencendo')     return `<span class="badge ba">Vence ${diasAte(m.fim_plano)}d</span>`;
  return `<span class="badge bg">Ativo</span>`;
}

// ── modais ────────────────────────────────────────────────────
function abrirModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
  document.getElementById('modal-overlay').classList.add('open');
}
function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}
function handleOverlayClick(e) { if (e.target === e.currentTarget) fecharModal(); }

// ── login ─────────────────────────────────────────────────────
async function doLogin() {
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Entrando...';
  const l = document.getElementById('l-user').value.trim();
  const s = document.getElementById('l-pass').value;
  const { data, error } = await db.from('usuarios').select('*').eq('login', l).eq('senha', s).single();
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error || !data) { document.getElementById('login-error').style.display = 'block'; return; }
  currentUser = data;
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('nav-username').textContent = data.nome;
  document.getElementById('nav-userrole').textContent = data.role === 'admin' ? 'Administrador' : 'Atendente';
  renderNavUser();
  applyRole();
  navTo(data.role === 'admin' ? 'dashboard' : 'mensalistas');
}


function renderNavUser() {
  const role = document.getElementById('nav-user-bottom');

  if (!role || !currentUser) return;

  role.innerHTML = `
    <div class="nav-user-role">
      ${currentUser.role === 'admin' ? 'Administrador' : 'Atendente'}
    </div>
  `;
}


function doLogout() {
  currentUser = null;
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('l-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
}

function applyRole() {
  document.querySelectorAll('.nav-item[data-role="admin"]').forEach(el => el.style.display = currentUser.role === 'admin' ? 'flex' : 'none');
  document.querySelectorAll('.nav-admin-only').forEach(el => el.style.display = currentUser.role === 'admin' ? 'block' : 'none');
}

// ── alterar senha ─────────────────────────────────────────────
function abrirModalSenha() {
  ['s-atual','s-nova','s-conf'].forEach(x => document.getElementById(x).value = '');
  abrirModal('modal-senha');
}
async function salvarSenha() {
  const atual = document.getElementById('s-atual').value;
  const nova  = document.getElementById('s-nova').value;
  const conf  = document.getElementById('s-conf').value;
  if (!nova || !conf) { toast('Preencha todos os campos', 'error'); return; }
  if (nova !== conf)  { toast('As senhas não conferem', 'error'); return; }
  if (nova.length < 4) { toast('Senha muito curta (mín. 4 caracteres)', 'error'); return; }
  if (currentUser.senha && atual !== currentUser.senha) { toast('Senha atual incorreta', 'error'); return; }
  const { error } = await db.from('usuarios').update({ senha: nova }).eq('id', currentUser.id);
  if (error) { toast('Erro ao alterar senha', 'error'); return; }
  currentUser.senha = nova;
  toast('Senha alterada com sucesso!', 'success');
  fecharModal();
}

// ── navegação ─────────────────────────────────────────────────
function navTo(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  const nv = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pg) pg.classList.add('active');
  if (nv) nv.classList.add('active');
  const map = { dashboard: renderDash, mensalistas: renderMens, comandas: renderComandas, alertas: renderAlertas, mensagens: renderMsgSelect, planos: renderPlanos, produtos: renderProdutos, usuarios: renderUsuarios };
  if (map[page]) map[page]();
  if (page === 'relatorio') setPeriodo('mes');
}

// ── dashboard ─────────────────────────────────────────────────
async function renderDash() {
  document.getElementById('metrics').innerHTML = '<div class="loading">Carregando...</div>';
  const [{ data: mens }, { data: cmds }] = await Promise.all([
    db.from('mensalistas').select('*'),
    db.from('comandas').select('*, comanda_itens(*)')
  ]);
  const m = mens||[], c = cmds||[];
  const ativos  = m.filter(x => calcStatus(x) === 'ativo').length;
  const inad    = m.filter(x => calcStatus(x) === 'inadimplente').length;
  const venc    = m.filter(x => calcStatus(x) === 'vencendo').length;
  const sempl   = m.filter(x => calcStatus(x) === 'sem_plano').length;
  const total   = m.filter(x => calcStatus(x) !== 'sem_plano').length;
  const receita = m.filter(x => calcStatus(x) !== 'sem_plano').reduce((a,x) => a + Number(x.valor_plano), 0);
  const cmdAb   = c.filter(x => x.status === 'aberta');
  const totCmd  = cmdAb.reduce((a,x) => a + (x.comanda_itens||[]).reduce((b,i) => b + i.preco_unitario*i.quantidade, 0), 0);
  document.getElementById('dash-date').textContent = today().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total c/ plano</div><div class="metric-value blue">${total}</div></div>
    <div class="metric"><div class="metric-label">Ativos</div><div class="metric-value green">${ativos}</div></div>
    <div class="metric"><div class="metric-label">Inadimplentes</div><div class="metric-value red">${inad}</div></div>
    <div class="metric"><div class="metric-label">Vencendo (7d)</div><div class="metric-value amber">${venc}</div></div>
    <div class="metric"><div class="metric-label">Sem plano</div><div class="metric-value gray">${sempl}</div></div>
    <div class="metric"><div class="metric-label">Receita/mês</div><div class="metric-value">${fmtR0(receita)}</div></div>
    <div class="metric"><div class="metric-label">Comandas abertas</div><div class="metric-value">${cmdAb.length}</div></div>
    <div class="metric"><div class="metric-label">Total em aberto</div><div class="metric-value blue">${fmtR0(totCmd)}</div></div>`;
  document.getElementById('dash-cmds').innerHTML = cmdAb.length
    ? `<table><thead><tr><th>Cliente</th><th>Itens</th><th>Abertura</th><th>Total</th></tr></thead><tbody>`
      + cmdAb.map(x => { const t=(x.comanda_itens||[]).reduce((a,i)=>a+i.preco_unitario*i.quantidade,0); return `<tr><td>${x.cliente_nome}</td><td>${(x.comanda_itens||[]).reduce((a,i)=>a+i.quantidade,0)}</td><td>${fmtDT(x.aberta_em)}</td><td style="color:var(--green);font-weight:600">${fmtR(t)}</td></tr>`; }).join('') + `</tbody></table>`
    : `<div class="empty"><span class="empty-icon">✅</span>Nenhuma comanda aberta</div>`;
  const vl = m.filter(x => calcStatus(x) === 'vencendo');
  document.getElementById('dash-venc').innerHTML = vl.length
    ? `<table><thead><tr><th>Nome</th><th>Plano</th><th>Dias</th><th>Valor</th></tr></thead><tbody>` + vl.map(x=>`<tr><td>${x.nome}</td><td>${x.plano_atual}</td><td>${diasAte(x.fim_plano)}d</td><td>${fmtR0(x.valor_plano)}</td></tr>`).join('') + `</tbody></table>`
    : `<div class="empty"><span class="empty-icon">✅</span>Nenhum vencimento em 7 dias</div>`;
  const il = m.filter(x => calcStatus(x) === 'inadimplente');
  document.getElementById('dash-inad').innerHTML = il.length
    ? `<table><thead><tr><th>Nome</th><th>Plano</th><th>Venceu</th><th>Valor</th></tr></thead><tbody>` + il.map(x=>`<tr><td>${x.nome}</td><td>${x.plano_atual}</td><td style="color:var(--red)">${fmtDate(x.fim_plano)}</td><td>${fmtR0(x.valor_plano)}</td></tr>`).join('') + `</tbody></table>`
    : `<div class="empty"><span class="empty-icon">✅</span>Nenhum inadimplente</div>`;
}

// ── mensalistas ───────────────────────────────────────────────
async function renderMens() {
  document.getElementById('tb-mens').innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';
  const { data: mens } = await db.from('mensalistas').select('*').order('nome');
  let lista = mens||[];
  const q = document.getElementById('mens-search').value.toLowerCase();
  if (q) lista = lista.filter(m => m.nome.toLowerCase().includes(q));
  if (filterMens === 'ativo')        lista = lista.filter(m => calcStatus(m) === 'ativo');
  if (filterMens === 'inadimplente') lista = lista.filter(m => calcStatus(m) === 'inadimplente');
  if (filterMens === 'vencendo')     lista = lista.filter(m => calcStatus(m) === 'vencendo');
  if (filterMens === 'sem_plano')    lista = lista.filter(m => calcStatus(m) === 'sem_plano');
  document.getElementById('tb-mens').innerHTML = lista.length
    ? lista.map(m => `<tr>
        <td><div class="mens-avatar">${m.foto_url ? `<img src="${m.foto_url}" alt="">` : initials(m.nome)}</div></td>
        <td><strong>${m.nome}</strong></td>
        <td>${m.plano_atual||'—'}</td>
        <td>${fmtDate(m.fim_plano)}</td>
        <td>${m.valor_plano ? fmtR0(m.valor_plano) : '—'}</td>
        <td>${statusBadge(m)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm" onclick="editarMens(${m.id})" title="Editar dados">✏️</button>
            <button class="btn btn-sm" onclick="adicionarNovoPlano(${m.id})" title="${calcStatus(m)==='sem_plano'?'Adicionar plano':'Novo plano'}">📋</button>
            <button class="btn btn-sm" onclick="verHistorico(${m.id})" title="Histórico">📜</button>
            ${calcStatus(m)!=='sem_plano' ? `<button class="btn btn-sm btn-warn" onclick="encerrarPlano(${m.id})" title="Encerrar plano">⏹️</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="excluirMens(${m.id})" title="Excluir">🗑️</button>
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">Nenhum mensalista encontrado</td></tr>`;
}

function abrirModalMens(id=null) {
  editingMens = id; fotoDataUrl = null;
  const prev = document.getElementById('foto-preview');
  prev.innerHTML = '📷';
  if (id) {
    db.from('mensalistas').select('*').eq('id', id).single().then(({ data: m }) => {
      if (!m) return;
      document.getElementById('modal-mens-title').textContent = 'Editar dados';
      document.getElementById('f-nome').value  = m.nome;
      document.getElementById('f-cpf').value   = m.cpf||'';
      document.getElementById('f-tel').value   = m.telefone||'';
      document.getElementById('f-email').value = m.email||'';
      if (m.foto_url) { fotoDataUrl = m.foto_url; prev.innerHTML = `<img src="${m.foto_url}" alt="">`; }
    });
  } else {
    document.getElementById('modal-mens-title').textContent = 'Novo mensalista';
    ['f-nome','f-cpf','f-tel','f-email'].forEach(x => document.getElementById(x).value = '');
  }
  abrirModal('modal-mens');
}
function editarMens(id) { abrirModalMens(id); }

async function salvarMensalista() {
  const nome = document.getElementById('f-nome').value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const obj = { nome, cpf: document.getElementById('f-cpf').value.trim(), telefone: document.getElementById('f-tel').value.trim(), email: document.getElementById('f-email').value.trim(), foto_url: fotoDataUrl };
  const { error } = editingMens
    ? await db.from('mensalistas').update(obj).eq('id', editingMens)
    : await db.from('mensalistas').insert({ ...obj, status: 'sem_plano', valor_plano: 0 });
  if (error) { toast('Erro ao salvar', 'error'); return; }
  toast('Salvo com sucesso!', 'success');
  fecharModal(); renderMens();
}

async function encerrarPlano(id) {
  if (!confirm('Encerrar o plano atual deste mensalista?')) return;
  const { error } = await db.from('mensalistas').update({ plano_atual: null, inicio_plano: null, fim_plano: null, valor_plano: 0, status: 'sem_plano' }).eq('id', id);
  if (error) { toast('Erro ao encerrar plano', 'error'); return; }
  toast('Plano encerrado', 'success'); renderMens(); renderDash();
}

async function excluirMens(id) {
  if (!confirm('Excluir este mensalista e todos os seus registros?\n\nEsta ação não pode ser desfeita.')) return;
  const { error } = await db.from('mensalistas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir', 'error'); return; }
  toast('Mensalista excluído', 'success'); renderMens(); renderDash();
}

async function verHistorico(id) {
  const { data: m }    = await db.from('mensalistas').select('nome').eq('id', id).single();
  const { data: hist } = await db.from('historico_planos').select('*').eq('mensalista_id', id).order('inicio', { ascending: false });
  document.getElementById('modal-hist-title').textContent = 'Histórico — ' + (m?.nome||'');
  document.getElementById('hist-content').innerHTML = (hist||[]).length
    ? `<table><thead><tr><th>Plano</th><th>Valor</th><th>Início</th><th>Fim</th></tr></thead><tbody>`
      + hist.map(h=>`<tr><td>${h.plano}</td><td>${fmtR0(h.valor)}</td><td>${fmtDate(h.inicio)}</td><td>${fmtDate(h.fim)}</td></tr>`).join('') + `</tbody></table>`
    : `<div class="empty">Nenhum histórico</div>`;
  abrirModal('modal-hist');
}

async function adicionarNovoPlano(id) {
  novoPlanoMensId = id;
  const { data: m }  = await db.from('mensalistas').select('nome').eq('id', id).single();
  const { data: pl } = await db.from('planos').select('*').eq('arquivado', false).order('nome');
  document.getElementById('modal-npm-title').textContent = 'Plano — ' + (m?.nome||'');
  document.getElementById('npm-plano').innerHTML = (pl||[]).map(p=>`<option value="${p.id}" data-val="${p.valor}" data-dur="${p.duracao_meses}" data-nome="${p.nome}">${p.nome}</option>`).join('');
  document.getElementById('npm-inicio').value = isoToday();
  autoNpmVenc();
  abrirModal('modal-novo-plano-mens');
}
function autoNpmVenc() {
  const sel = document.getElementById('npm-plano');
  const opt = sel.options[sel.selectedIndex];
  const ini = document.getElementById('npm-inicio').value;
  if (opt && ini) { document.getElementById('npm-valido').value = addMonths(ini, parseInt(opt.dataset.dur)||1); document.getElementById('npm-valor').value = opt.dataset.val; }
}
async function salvarNovoPlanMens() {
  const sel = document.getElementById('npm-plano');
  const opt = sel.options[sel.selectedIndex];
  const val = parseFloat(document.getElementById('npm-valor').value)||0;
  const ini = document.getElementById('npm-inicio').value;
  const fim = document.getElementById('npm-valido').value;
  if (!opt||!ini||!fim) { toast('Preencha todos os campos', 'error'); return; }
  const nomePlano = opt.dataset.nome;
  const { error } = await db.from('mensalistas').update({ plano_atual: nomePlano, inicio_plano: ini, fim_plano: fim, valor_plano: val, status: 'ativo' }).eq('id', novoPlanoMensId);
  if (error) { toast('Erro ao salvar plano', 'error'); return; }
  await db.from('historico_planos').insert({ mensalista_id: novoPlanoMensId, plano: nomePlano, valor: val, inicio: ini, fim });
  toast('Plano adicionado!', 'success'); fecharModal(); renderMens(); renderDash();
}

function previewFoto(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => { fotoDataUrl = e.target.result; document.getElementById('foto-preview').innerHTML = `<img src="${fotoDataUrl}" alt="">`; };
  r.readAsDataURL(f);
}

// ── comandas ──────────────────────────────────────────────────
async function renderComandas() {
  document.getElementById('lista-comandas').innerHTML = '<div class="loading">Carregando...</div>';
  const { data: cmds } = await db.from('comandas').select('*, comanda_itens(*)').order('aberta_em', { ascending: false });
  let lista = cmds||[];
  if (filterCmd === 'abertas')  lista = lista.filter(c => c.status === 'aberta');
  if (filterCmd === 'fechadas') lista = lista.filter(c => c.status === 'fechada');
  if (!lista.length) { document.getElementById('lista-comandas').innerHTML = `<div class="empty"><span class="empty-icon">🧾</span>Nenhuma comanda.</div>`; return; }
  document.getElementById('lista-comandas').innerHTML = lista.map(c => {
    const itens = c.comanda_itens||[];
    const tot   = itens.reduce((a,i) => a + i.preco_unitario*i.quantidade, 0);
    const qtd   = itens.reduce((a,i) => a + i.quantidade, 0);
    const isOpen = c.status === 'aberta';
    const itensHtml = itens.length
      ? itens.map(it => `
          <div class="item-row">
            <span class="item-icon">${it.produto_icone||'🛒'}</span>
            <span class="item-nome">${it.produto_nome}</span>
            <span class="item-time">${fmtDT(it.adicionado_em)}</span>
            ${isOpen ? `<div class="qty-ctrl">
              <button class="qty-btn" onclick="changeQty(${c.id},${it.id},-1)">−</button>
              <span style="min-width:20px;text-align:center;font-weight:600">${it.quantidade}</span>
              <button class="qty-btn" onclick="changeQty(${c.id},${it.id},1)">+</button>
            </div>` : `<span style="font-size:12px;color:var(--text2)">${it.quantidade}x</span>`}
            <span class="item-preco">${fmtR(it.preco_unitario*it.quantidade)}</span>
            ${isOpen ? `<button class="btn btn-sm btn-danger" onclick="removerItem(${it.id},${c.id})">✕</button>` : ''}
          </div>`).join('')
      : `<div style="font-size:12px;color:var(--text2);padding:8px 0">Nenhum item adicionado.</div>`;
    const addRow = isOpen ? `<div class="autocomplete">
      <div class="search-wrap" style="margin-top:10px">
        <span class="search-icon">🔍</span>
        <input type="text" id="aci-${c.id}" placeholder="Buscar produto para adicionar..." oninput="showAC(${c.id},this.value)" autocomplete="off">
      </div>
      <div class="ac-list" id="acl-${c.id}"></div>
    </div>` : '';
    return `<div class="cmd-card" id="cmd-${c.id}">
      <div class="cmd-header" onclick="toggleCmd(this)">
        <div class="cmd-avatar">${initials(c.cliente_nome)}</div>
        <div class="cmd-info">
          <div class="cmd-nome">${c.cliente_nome}</div>
          <div class="cmd-meta">${c.cliente_tel||'—'} · ${qtd} itens · ${fmtDT(c.aberta_em)}${c.observacao?' · '+c.observacao:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:var(--green)">${fmtR(tot)}</span>
          <span class="pill ${isOpen?'pill-open':'pill-closed'}">${isOpen?'Aberta':'Fechada'}</span>
          <span style="font-size:13px;color:var(--text2)">▼</span>
        </div>
      </div>
      <div class="cmd-body" style="display:none">
        ${itensHtml}${addRow}
        <div class="cmd-footer">
          <span style="font-size:13px;font-weight:600">Total: <span style="color:var(--green)">${fmtR(tot)}</span></span>
          <div style="display:flex;gap:6px">
            ${isOpen  ? `<button class="btn btn-sm btn-primary" onclick="fecharComanda(${c.id})">✅ Fechar</button>` : ''}
            ${!isOpen ? `<button class="btn btn-sm" onclick="reabrirComanda(${c.id})">🔄 Reabrir</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="excluirComanda(${c.id})">🗑️ Excluir</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleCmd(header) {
  const body = header.nextElementSibling;
  const arr  = header.querySelector('span:last-child');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▼' : '▲';
}

async function showAC(cmdId, q) {
  const list = document.getElementById('acl-'+cmdId);
  if (!q.trim()) { list.classList.remove('show'); return; }
  const { data: prods } = await db.from('produtos').select('*').eq('arquivado', false).ilike('nome', `%${q}%`).limit(6);
  if (!(prods||[]).length) { list.classList.remove('show'); return; }
  list.innerHTML = prods.map(p=>`<div class="ac-item" onclick="addItemAC(${cmdId},${p.id})"><span>${p.icone||'🛒'}</span>${p.nome} — ${fmtR(p.preco)}</div>`).join('');
  list.classList.add('show');
}

async function addItemAC(cmdId, prodId) {
  const { data: prod } = await db.from('produtos').select('*').eq('id', prodId).single();
  if (!prod) return;
  const { data: ex } = await db.from('comanda_itens').select('*').eq('comanda_id', cmdId).eq('produto_id', prodId).maybeSingle();
  if (ex) { await db.from('comanda_itens').update({ quantidade: ex.quantidade+1 }).eq('id', ex.id); }
  else    { await db.from('comanda_itens').insert({ comanda_id: cmdId, produto_id: prodId, produto_nome: prod.nome, produto_icone: prod.icone, preco_unitario: prod.preco, quantidade: 1 }); }
  const inp = document.getElementById('aci-'+cmdId); if (inp) inp.value = '';
  const lst = document.getElementById('acl-'+cmdId); if (lst) lst.classList.remove('show');
  toast('Produto adicionado!'); renderComandas();
}

async function changeQty(cmdId, itemId, delta) {
  const { data: it } = await db.from('comanda_itens').select('quantidade').eq('id', itemId).single();
  if (!it) return;
  const newQty = it.quantidade + delta;
  if (newQty <= 0) await db.from('comanda_itens').delete().eq('id', itemId);
  else             await db.from('comanda_itens').update({ quantidade: newQty }).eq('id', itemId);
  renderComandas();
}
async function removerItem(itemId) { await db.from('comanda_itens').delete().eq('id', itemId); renderComandas(); }

async function fecharComanda(id) {
  if (!confirm('Fechar esta comanda?')) return;
  const { error } = await db.from('comandas').update({ status: 'fechada', fechada_em: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Erro ao fechar', 'error'); return; }
  toast('Comanda fechada!', 'success'); renderComandas(); renderDash();
}
async function reabrirComanda(id) {
  await db.from('comandas').update({ status: 'aberta', fechada_em: null }).eq('id', id);
  toast('Comanda reaberta'); renderComandas(); renderDash();
}
async function excluirComanda(id) {
  if (!confirm('Excluir esta comanda?\n\nEsta ação não pode ser desfeita.')) return;
  const { error } = await db.from('comandas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir', 'error'); return; }
  toast('Comanda excluída', 'success'); renderComandas(); renderDash();
}
function abrirModalComanda() {
  ['fc-nome','fc-tel','fc-obs'].forEach(x => document.getElementById(x).value = '');
  abrirModal('modal-comanda');
}
async function salvarComanda() {
  const nome = document.getElementById('fc-nome').value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await db.from('comandas').insert({ cliente_nome: nome, cliente_tel: document.getElementById('fc-tel').value.trim(), observacao: document.getElementById('fc-obs').value.trim(), status: 'aberta' });
  if (error) { toast('Erro ao criar comanda', 'error'); return; }
  toast('Comanda criada!', 'success'); fecharModal(); renderComandas(); renderDash();
}

// ── alertas ───────────────────────────────────────────────────
async function renderAlertas() {
  const { data: mens } = await db.from('mensalistas').select('*');
  const m = mens||[], f = filterAlert;
  let html = '';
  if (f==='todos'||f==='inadimplente') m.filter(x=>calcStatus(x)==='inadimplente').forEach(x=>{html+=`<div class="alert-item"><div class="alert-icon ai-r">⚠️</div><div class="alert-info"><div class="alert-name">${x.nome}</div><div class="alert-desc">Atraso ${Math.abs(diasAte(x.fim_plano))}d — ${fmtR0(x.valor_plano)}/mês</div></div><button class="btn btn-sm" onclick="irMsgTipo(${x.id},'atraso')">💬 Cobrar</button></div>`;});
  if (f==='todos'||f==='vencendo')     m.filter(x=>calcStatus(x)==='vencendo').forEach(x=>{html+=`<div class="alert-item"><div class="alert-icon ai-a">⏰</div><div class="alert-info"><div class="alert-name">${x.nome}</div><div class="alert-desc">Vence em ${diasAte(x.fim_plano)}d — ${fmtDate(x.fim_plano)}</div></div><button class="btn btn-sm" onclick="irMsgTipo(${x.id},'vencimento')">💬 Avisar</button></div>`;});
  if (f==='todos'||f==='resgate')      m.filter(x=>calcStatus(x)==='sem_plano').forEach(x=>{html+=`<div class="alert-item"><div class="alert-icon ai-b">❤️</div><div class="alert-info"><div class="alert-name">${x.nome}</div><div class="alert-desc">Sem plano ativo — tentar resgatar</div></div><button class="btn btn-sm" onclick="irMsgTipo(${x.id},'resgate')">💬 Resgatar</button></div>`;});
  document.getElementById('lista-alertas').innerHTML = html || `<div class="empty"><span class="empty-icon">✅</span>Nenhum alerta</div>`;
}

// ── mensagens ─────────────────────────────────────────────────
async function renderMsgSelect() {
  const { data: mens } = await db.from('mensalistas').select('id,nome').order('nome');
  document.getElementById('msg-pessoa').innerHTML = (mens||[]).map(m=>`<option value="${m.id}">${m.nome}</option>`).join('');
  gerarMsg();
}
async function gerarMsg() {
  const id   = document.getElementById('msg-pessoa').value;
  const tipo = document.getElementById('msg-tipo').value;
  const { data: m } = await db.from('mensalistas').select('*').eq('id', id).single();
  if (!m) return;
  const pn = m.nome.split(' ')[0];
  let msg = '';
  if (tipo==='vencimento') msg=`Olá, ${pn}! 👋\n\nLembrando que seu plano *${m.plano_atual}* na DiPraia vence em *${fmtDate(m.fim_plano)}*.\n\nValor: *${fmtR0(m.valor_plano)}*\n\nQualquer dúvida, estamos aqui! 🎾`;
  else if (tipo==='atraso') msg=`Olá, ${pn}!\n\nSeu plano *${m.plano_atual}* venceu em *${fmtDate(m.fim_plano)}* e ainda não identificamos o pagamento.\n\nValor em aberto: *${fmtR0(m.valor_plano)}*\n\nEstamos à disposição! 🙏`;
  else if (tipo==='boas_vindas') msg=`Bem-vindo(a) à DiPraia, ${pn}! 🎾🏖️\n\nSeu plano *${m.plano_atual}* está ativo até *${fmtDate(m.fim_plano)}*.\n\nBons jogos! 🏆`;
  else if (tipo==='renovacao') msg=`Olá, ${pn}! 😊\n\nSeu plano *${m.plano_atual}* vence em *${fmtDate(m.fim_plano)}*. Que tal renovar?\n\nValor: *${fmtR0(m.valor_plano)}/mês*\n\nGaranta sua vaga! 🎾`;
  else if (tipo==='resgate') msg=`Olá, ${pn}! 👋\n\nSentimos sua falta aqui na DiPraia! 🎾\n\nQue tal retomar seu plano? Temos condições especiais para você.\n\nEntre em contato! 🏖️`;
  document.getElementById('msg-out').innerHTML = `<div class="msg-box">${msg.replace(/\n/g,'<br>').replace(/\*(.*?)\*/g,'<strong>$1</strong>')}</div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-sm" onclick="copiarMsg(this,\`${msg.replace(/`/g,"'")}\`)">📋 Copiar</button></div>`;
}
function copiarMsg(btn,t){navigator.clipboard.writeText(t).then(()=>{btn.textContent='✅ Copiado!';setTimeout(()=>btn.innerHTML='📋 Copiar',2000);})}
function irMsg(id){navTo('mensagens');setTimeout(()=>{document.getElementById('msg-pessoa').value=id;gerarMsg();},100);}
function irMsgTipo(id,tipo){irMsg(id);setTimeout(()=>{document.getElementById('msg-tipo').value=tipo;gerarMsg();},200);}

// ── relatório ─────────────────────────────────────────────────
function setPeriodo(t) {
  const n=new Date(); let de,ate;
  if(t==='mes') {de=new Date(n.getFullYear(),n.getMonth(),1);ate=new Date(n.getFullYear(),n.getMonth()+1,0);}
  if(t==='trim'){de=new Date(n.getFullYear(),n.getMonth()-2,1);ate=new Date(n.getFullYear(),n.getMonth()+1,0);}
  if(t==='ano') {de=new Date(n.getFullYear(),0,1);ate=new Date(n.getFullYear(),11,31);}
  document.getElementById('rel-de').value  = de.toISOString().split('T')[0];
  document.getElementById('rel-ate').value = ate.toISOString().split('T')[0];
  renderRelatorio();
}
async function renderRelatorio() {
  const de=document.getElementById('rel-de').value, ate=document.getElementById('rel-ate').value;
  const [{data:mens},{data:cmdData}] = await Promise.all([db.from('mensalistas').select('*'), db.from('comandas').select('*, comanda_itens(*)')]);
  const m=mens||[], c=cmdData||[];
  const ativos=m.filter(x=>calcStatus(x)!=='sem_plano');
  const inad=m.filter(x=>calcStatus(x)==='inadimplente');
  const receita=ativos.reduce((a,x)=>a+Number(x.valor_plano),0);
  const perdido=inad.reduce((a,x)=>a+Number(x.valor_plano),0);
  const tx=ativos.length?Math.round(inad.length/ativos.length*100):0;
  const cmdF=c.filter(x=>x.status==='fechada'&&inRange((x.fechada_em||'').slice(0,10),de,ate));
  const recCmd=cmdF.reduce((a,x)=>a+(x.comanda_itens||[]).reduce((b,i)=>b+i.preco_unitario*i.quantidade,0),0);
  document.getElementById('rel-metrics').innerHTML=`
    <div class="metric"><div class="metric-label">Receita mensalistas</div><div class="metric-value">${fmtR0(receita)}</div></div>
    <div class="metric"><div class="metric-label">Receita comandas</div><div class="metric-value green">${fmtR(recCmd)}</div></div>
    <div class="metric"><div class="metric-label">Em risco</div><div class="metric-value red">${fmtR0(perdido)}</div></div>
    <div class="metric"><div class="metric-label">Taxa inadimplência</div><div class="metric-value amber">${tx}%</div></div>`;
  const byPlano={};ativos.forEach(x=>{if(!byPlano[x.plano_atual])byPlano[x.plano_atual]={count:0,total:0};byPlano[x.plano_atual].count++;byPlano[x.plano_atual].total+=Number(x.valor_plano);});
  document.getElementById('rel-planos').innerHTML=Object.entries(byPlano).map(([p,v])=>`<div class="rel-row"><span style="font-weight:600">${p}</span><span>${v.count} mensalista(s) — ${fmtR0(v.total)}/mês</span></div>`).join('')||`<div class="empty">Sem dados</div>`;
  document.getElementById('rel-cmd').innerHTML=cmdF.length
    ?`<div class="rel-row"><span>Comandas fechadas</span><span>${cmdF.length}</span></div><div class="rel-row"><span>Receita total</span><span style="font-weight:600;color:var(--green)">${fmtR(recCmd)}</span></div><div class="rel-row"><span>Ticket médio</span><span>${fmtR(recCmd/cmdF.length)}</span></div>`
    :`<div class="empty">Nenhuma comanda fechada no período</div>`;
  document.getElementById('rel-inad').innerHTML=inad.length
    ?inad.map(x=>`<div class="rel-row"><span>${x.nome}</span><span style="color:var(--red)">${fmtR0(x.valor_plano)} — venceu ${fmtDate(x.fim_plano)}</span></div>`).join('')
    :`<div class="empty"><span class="empty-icon">✅</span>Sem inadimplentes</div>`;
}

// ── planos ────────────────────────────────────────────────────
async function renderPlanos() {
  const {data:pl}=await db.from('planos').select('*').order('nome');
  document.getElementById('lista-planos').innerHTML=(pl||[]).length
    ?pl.map(p=>`<div class="plan-card ${p.arquivado?'archived':''}">
        <div class="picon">🏷️</div>
        <div class="plan-info"><div class="plan-name">${p.nome}${p.arquivado?' <span class="badge bgr">Arquivado</span>':''}</div><div class="plan-detail">${fmtR0(p.valor)}/mês · ${p.duracao_meses} ${p.duracao_meses===1?'mês':'meses'}${p.descricao?' · '+p.descricao:''}</div></div>
        <div style="display:flex;gap:6px">
          ${!p.arquivado?`<button class="btn btn-sm" onclick="editarPlano(${p.id})">✏️ Editar</button>`:''}
          <button class="btn btn-sm ${p.arquivado?'':'btn-danger'}" onclick="${p.arquivado?`desarquivarPlano(${p.id})`:`arquivarPlano(${p.id})`}">${p.arquivado?'🔄 Reativar':'🗄️ Arquivar'}</button>
        </div>
      </div>`).join('')
    :`<div class="empty" style="padding:2rem">Nenhum plano cadastrado.</div>`;
}
async function arquivarPlano(id){if(!confirm('Arquivar este plano?'))return;await db.from('planos').update({arquivado:true}).eq('id',id);toast('Plano arquivado');renderPlanos();}
async function desarquivarPlano(id){await db.from('planos').update({arquivado:false}).eq('id',id);toast('Plano reativado');renderPlanos();}
function abrirModalPlano(id=null){
  editingPlano=id;
  if(id){db.from('planos').select('*').eq('id',id).single().then(({data:p})=>{if(!p)return;document.getElementById('modal-plano-title').textContent='Editar plano';document.getElementById('fp-nome').value=p.nome;document.getElementById('fp-valor').value=p.valor;document.getElementById('fp-duracao').value=p.duracao_meses;document.getElementById('fp-desc').value=p.descricao||'';});}
  else{document.getElementById('modal-plano-title').textContent='Novo plano';['fp-nome','fp-desc'].forEach(x=>document.getElementById(x).value='');document.getElementById('fp-valor').value='';document.getElementById('fp-duracao').value=1;}
  abrirModal('modal-plano');
}
function editarPlano(id){abrirModalPlano(id);}
async function salvarPlano(){
  const nome=document.getElementById('fp-nome').value.trim();if(!nome){toast('Informe o nome','error');return;}
  const obj={nome,valor:parseFloat(document.getElementById('fp-valor').value)||0,duracao_meses:parseInt(document.getElementById('fp-duracao').value)||1,descricao:document.getElementById('fp-desc').value.trim()};
  const {error}=editingPlano?await db.from('planos').update(obj).eq('id',editingPlano):await db.from('planos').insert({...obj,arquivado:false});
  if(error){toast('Erro ao salvar','error');return;}
  toast('Plano salvo!','success');fecharModal();renderPlanos();
}

// ── produtos ──────────────────────────────────────────────────
async function fillCatSelect(){const{data:cats}=await db.from('categorias').select('nome').order('nome');document.getElementById('pp-cat').innerHTML=(cats||[]).map(c=>`<option>${c.nome}</option>`).join('');}
function buildIconGrid(){document.getElementById('icon-grid').innerHTML=PROD_ICONS.map(ic=>`<div class="icon-opt${ic===selectedIcon?' selected':''}" onclick="selectIcon('${ic}')">${ic}</div>`).join('');}
function selectIcon(ic){selectedIcon=ic;buildIconGrid();}

async function renderProdutos(){
  const [{data:cats},{data:prods}]=await Promise.all([db.from('categorias').select('nome').order('nome'),db.from('produtos').select('*').order('nome')]);
  const catList=(cats||[]).map(c=>c.nome);const prodList=prods||[];
  document.getElementById('lista-produtos').innerHTML=catList.map(cat=>{
    const ps=prodList.filter(p=>p.categoria===cat);if(!ps.length)return'';
    return`<div class="cat-section-title">${cat}</div>`+ps.map(p=>`
      <div class="prod-card ${p.arquivado?'archived':''}">
        <div class="picon">${p.icone||'🛒'}</div>
        <div class="plan-info"><div class="plan-name">${p.nome}${p.arquivado?' <span class="badge bgr">Arquivado</span>':''}</div><div class="plan-detail">${fmtR(p.preco)} · ${p.categoria}</div></div>
        <div style="display:flex;gap:6px">
          ${!p.arquivado?`<button class="btn btn-sm" onclick="editarProd(${p.id})">✏️</button>`:''}
          <button class="btn btn-sm ${p.arquivado?'':'btn-danger'}" onclick="${p.arquivado?`desarquivarProd(${p.id})`:`arquivarProd(${p.id})`}">${p.arquivado?'🔄':'🗄️'}</button>
        </div>
      </div>`).join('');
  }).join('')||`<div class="empty" style="padding:2rem">Nenhum produto.</div>`;
}
async function arquivarProd(id){if(!confirm('Arquivar este produto?'))return;await db.from('produtos').update({arquivado:true}).eq('id',id);toast('Produto arquivado');renderProdutos();}
async function desarquivarProd(id){await db.from('produtos').update({arquivado:false}).eq('id',id);toast('Produto reativado');renderProdutos();}
async function abrirModalProd(id=null){
  editingProd=id;await fillCatSelect();
  if(id){const{data:p}=await db.from('produtos').select('*').eq('id',id).single();if(p){document.getElementById('modal-prod-title').textContent='Editar produto';document.getElementById('pp-nome').value=p.nome;document.getElementById('pp-preco').value=p.preco;document.getElementById('pp-cat').value=p.categoria;selectedIcon=p.icone||'🛒';}}
  else{document.getElementById('modal-prod-title').textContent='Novo produto';document.getElementById('pp-nome').value='';document.getElementById('pp-preco').value='';selectedIcon='🛒';}
  buildIconGrid();abrirModal('modal-prod');
}
function editarProd(id){abrirModalProd(id);}
async function salvarProd(){
  const nome=document.getElementById('pp-nome').value.trim();if(!nome){toast('Informe o nome','error');return;}
  const obj={nome,preco:parseFloat(document.getElementById('pp-preco').value)||0,categoria:document.getElementById('pp-cat').value,icone:selectedIcon};
  const{error}=editingProd?await db.from('produtos').update(obj).eq('id',editingProd):await db.from('produtos').insert({...obj,arquivado:false});
  if(error){toast('Erro ao salvar','error');return;}
  toast('Produto salvo!','success');fecharModal();renderProdutos();
}
function abrirModalCat(){document.getElementById('cat-nome').value='';abrirModal('modal-cat');}
async function salvarCat(){
  const nome=document.getElementById('cat-nome').value.trim();if(!nome){toast('Informe o nome','error');return;}
  const{error}=await db.from('categorias').insert({nome});
  if(error){toast(error.code==='23505'?'Categoria já existe':'Erro ao salvar','error');return;}
  toast('Categoria criada!','success');fecharModal();renderProdutos();
}

// ── usuários ──────────────────────────────────────────────────
async function renderUsuarios(){
  const{data:users}=await db.from('usuarios').select('*').order('nome');
  document.getElementById('lista-usuarios').innerHTML=(users||[]).map(u=>`
    <div class="user-card">
      <div class="picon">${u.role==='admin'?'🔐':'👤'}</div>
      <div class="plan-info"><div class="plan-name">${u.nome}</div><div class="plan-detail">${u.login} · ${u.role==='admin'?'Administrador':'Atendente'}</div></div>
      <div style="display:flex;gap:6px">
        ${u.id!==1
          ?`<button class="btn btn-sm" onclick="editarUser(${u.id})">✏️ Editar</button><button class="btn btn-sm btn-danger" onclick="excluirUser(${u.id})">🗑️ Excluir</button>`
          :`<span class="badge bb">⭐ Master</span>`}
      </div>
    </div>`).join('');
}
function abrirModalUser(id=null){
  editingUser=id;
  if(id){db.from('usuarios').select('*').eq('id',id).single().then(({data:u})=>{if(!u)return;document.getElementById('modal-user-title').textContent='Editar usuário';document.getElementById('u-nome').value=u.nome;document.getElementById('u-login').value=u.login;document.getElementById('u-senha').value=u.senha;document.getElementById('u-role').value=u.role;});}
  else{document.getElementById('modal-user-title').textContent='Novo usuário';['u-nome','u-login','u-senha'].forEach(x=>document.getElementById(x).value='');document.getElementById('u-role').value='atendente';}
  abrirModal('modal-user');
}
function editarUser(id){abrirModalUser(id);}
async function salvarUser(){
  const nome=document.getElementById('u-nome').value.trim(),login=document.getElementById('u-login').value.trim(),senha=document.getElementById('u-senha').value;
  if(!nome||!login||!senha){toast('Preencha todos os campos','error');return;}
  const obj={nome,login,senha,role:document.getElementById('u-role').value};
  const{error}=editingUser?await db.from('usuarios').update(obj).eq('id',editingUser):await db.from('usuarios').insert(obj);
  if(error){toast(error.code==='23505'?'Login já existe':'Erro ao salvar','error');return;}
  toast('Usuário salvo!','success');fecharModal();renderUsuarios();
}
async function excluirUser(id){
  if(!confirm('Excluir este usuário?\n\nO acesso será removido imediatamente.'))return;
  const{error}=await db.from('usuarios').delete().eq('id',id);
  if(error){toast('Erro ao excluir','error');return;}
  if(currentUser&&currentUser.id===id)doLogout();
  toast('Usuário excluído','success');renderUsuarios();
}

// ── eventos ───────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>navTo(el.dataset.page)));
document.querySelectorAll('#tabs-mens .tab').forEach(el=>el.addEventListener('click',()=>{filterMens=el.dataset.filter;document.querySelectorAll('#tabs-mens .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderMens();}));
document.querySelectorAll('#tabs-cmd .tab').forEach(el=>el.addEventListener('click',()=>{filterCmd=el.dataset.cfilter;document.querySelectorAll('#tabs-cmd .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderComandas();}));
document.querySelectorAll('#tabs-alert .tab').forEach(el=>el.addEventListener('click',()=>{filterAlert=el.dataset.afilter;document.querySelectorAll('#tabs-alert .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderAlertas();}));
document.getElementById('l-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.addEventListener('click',e=>{if(!e.target.closest('.autocomplete'))document.querySelectorAll('.ac-list').forEach(l=>l.classList.remove('show'));});

// ── mobile helpers ────────────────────────────────────────────
function toggleDrawer() {
  const d = document.getElementById('bn-drawer');
  d.classList.toggle('open');
}
function closeDrawer() {
  document.getElementById('bn-drawer').classList.remove('open');
}

// sobrescreve renderMens para incluir versão mobile
const _renderMensOrig = renderMens;
async function renderMens() {
  document.getElementById('tb-mens').innerHTML = '<tr><td colspan="7" class="loading">Carregando...</td></tr>';
  if (document.getElementById('mens-mobile-list'))
    document.getElementById('mens-mobile-list').innerHTML = '<div class="loading">Carregando...</div>';

  const { data: mens } = await db.from('mensalistas').select('*').order('nome');
  let lista = mens || [];
  const q = document.getElementById('mens-search').value.toLowerCase();
  if (q) lista = lista.filter(m => m.nome.toLowerCase().includes(q));
  if (filterMens === 'ativo')        lista = lista.filter(m => calcStatus(m) === 'ativo');
  if (filterMens === 'inadimplente') lista = lista.filter(m => calcStatus(m) === 'inadimplente');
  if (filterMens === 'vencendo')     lista = lista.filter(m => calcStatus(m) === 'vencendo');
  if (filterMens === 'sem_plano')    lista = lista.filter(m => calcStatus(m) === 'sem_plano');

  // tabela desktop
  document.getElementById('tb-mens').innerHTML = lista.length
    ? lista.map(m => `<tr>
        <td><div class="mens-avatar">${m.foto_url ? `<img src="${m.foto_url}" alt="">` : initials(m.nome)}</div></td>
        <td><strong>${m.nome}</strong></td>
        <td>${m.plano_atual || '—'}</td>
        <td>${fmtDate(m.fim_plano)}</td>
        <td>${m.valor_plano ? fmtR0(m.valor_plano) : '—'}</td>
        <td>${statusBadge(m)}</td>
        <td><div class="action-btns">
          <button class="btn btn-sm" onclick="editarMens(${m.id})" title="Editar">✏️</button>
          <button class="btn btn-sm" onclick="adicionarNovoPlano(${m.id})" title="Plano">📋</button>
          <button class="btn btn-sm" onclick="verHistorico(${m.id})" title="Histórico">📜</button>
          ${calcStatus(m) !== 'sem_plano' ? `<button class="btn btn-sm btn-warn" onclick="encerrarPlano(${m.id})" title="Encerrar">⏹️</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="excluirMens(${m.id})" title="Excluir">🗑️</button>
        </div></td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">Nenhum encontrado</td></tr>`;

  // cards mobile
  const mbl = document.getElementById('mens-mobile-list');
  if (!mbl) return;
  mbl.innerHTML = lista.length
    ? lista.map(m => `
      <div class="mens-card">
        <div class="mens-card-top">
          <div class="mens-avatar" style="width:44px;height:44px;font-size:14px">${m.foto_url ? `<img src="${m.foto_url}" alt="">` : initials(m.nome)}</div>
          <div class="mens-card-info">
            <div class="mens-card-nome">${m.nome}</div>
            <div class="mens-card-plano">${m.plano_atual || 'Sem plano'}</div>
          </div>
          ${statusBadge(m)}
        </div>
        <div class="mens-card-row"><span>Vencimento</span><span>${fmtDate(m.fim_plano)}</span></div>
        <div class="mens-card-row"><span>Valor</span><span>${m.valor_plano ? fmtR0(m.valor_plano) + '/mês' : '—'}</span></div>
        <div class="mens-card-actions">
          <button class="btn btn-sm" onclick="editarMens(${m.id})">✏️ Editar</button>
          <button class="btn btn-sm" onclick="adicionarNovoPlano(${m.id})">📋 Plano</button>
          <button class="btn btn-sm" onclick="verHistorico(${m.id})">📜 Histórico</button>
          ${calcStatus(m) !== 'sem_plano' ? `<button class="btn btn-sm btn-warn" onclick="encerrarPlano(${m.id})">⏹️ Encerrar</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="excluirMens(${m.id})">🗑️</button>
        </div>
      </div>`).join('')
    : `<div class="empty"><span class="empty-icon">👥</span>Nenhum encontrado</div>`;
}

