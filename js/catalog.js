/* =============================================
   RAZE LABS – Catálogo v2
   Planilha – colunas esperadas (linha 1):
   codigo | descricao | valor_unitario | qtd_minima | peso | linha | sabores | embalagens | disponivel | nutri | foto1..foto5
   ============================================= */

// ─── CONFIGURAÇÃO ──────────────────────────────
const SHEET_ID   = '18HdMbP0zGMsUmVTI2F1xZhHny-TkJ3mY';
const SHEET_NAME = 'Produtos';
const WHATSAPP   = '5577997020000';

const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

// ─── ESTADO ────────────────────────────────────
let allProducts    = [];
let activeFilter   = 'Todos';
let searchTerm     = '';
let activeSabor    = '';
let cart           = [];
let currentProduct = null;
let selectedSabor  = null;
let selectedTam    = null;
let carouselIdx    = 0;
let carouselImgs   = [];

// ─── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  setupModal();
  setupCart();
  setupSearch();
});

// ─── CARREGAR ──────────────────────────────────
async function loadProducts() {
  if (SHEET_ID === 'SEU_ID_DA_PLANILHA_AQUI') {
    allProducts = getDemoProducts();
  } else {
    try {
      const r = await fetch(CSV_URL);
      if (!r.ok) throw new Error();
      allProducts = parseCSV(await r.text());
    } catch {
      allProducts = getDemoProducts();
    }
  }
  buildFilters();
  buildSaborFilter();
  renderGrid();
}

// ─── PARSE CSV ─────────────────────────────────
// Colunas: codigo | descricao | valor_unitario | qtd_minima | peso | linha | sabores | embalagens | disponivel | nutri | foto1..foto5
function parseCSV(text) {
  const lines  = text.trim().split('\n');
  const header = splitLine(lines[0]).map(h => h.toLowerCase().trim().replace(/\s+/g,'_'));

  const ci = {
    codigo:     fi(header, ['codigo','código']),
    descricao:  fi(header, ['descricao','descrição','nome','produto']),
    valor_unit: fi(header, ['valor_unitario','valor_unit','valor','preco','preço','unit']),
    qtd_minima: fi(header, ['qtd_minima','qtd_min','quantidade_minima','pedido_minimo','minimo','min']),
    peso:       fi(header, ['peso','weight']),
    linha:      fi(header, ['linha','line','categoria','category']),
    sabores:    fi(header, ['sabores','sabor','flavors','flavor']),
    embalagens: fi(header, ['embalagens','embalagem','tamanhos','opcao','opção']),
    disponivel: fi(header, ['disponivel','disponível','ativo','status']),
    nutri:      fi(header, ['nutri','tags','destaques']),
  };
  const fotoIdxs = header.map((h,i) => (h.startsWith('foto')||h.startsWith('photo')) ? i : -1).filter(i => i>=0);

  return lines.slice(1).map(line => {
    const c = splitLine(line);
    if (!c[ci.descricao]?.trim()) return null;

    const fotos = fotoIdxs.map(i => (c[i]||'').trim()).filter(Boolean).map(convertDrive);
    const dispRaw = (c[ci.disponivel]||'sim').trim().toLowerCase();
    const disponivel = !['não','nao','no','false','0','esgotado'].includes(dispRaw);

    const valorUnit = parsePrecoStr((c[ci.valor_unit]||'').trim());
    const qtdMin    = parseInt((c[ci.qtd_minima]||'1').replace(/\D/g,'')) || 1;

    return {
      codigo:     (c[ci.codigo]     ||'').trim(),
      nome:       (c[ci.descricao]  ||'').trim(),
      valorUnit,                          // número float
      qtdMin,                             // número inteiro
      peso:       (c[ci.peso]       ||'').trim(),
      linha:      (c[ci.linha]      ||'Outros').trim(),
      sabores:    splitAttr(c[ci.sabores]),
      embalagens: splitAttr(c[ci.embalagens]),
      disponivel,
      nutri:      splitAttr(c[ci.nutri]),
      fotos,
    };
  }).filter(Boolean);
}

function fi(header, aliases) {
  for (const a of aliases) { const i = header.indexOf(a); if (i>=0) return i; }
  return -1;
}
function splitAttr(str) {
  if (!str) return [];
  return str.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}
function splitLine(line) {
  const r = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch==='"') { if (inQ && line[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
    else if (ch===',' && !inQ) { r.push(cur); cur=''; }
    else cur += ch;
  }
  r.push(cur); return r;
}
function convertDrive(url) {
  if (!url || url==='.' || url==='-') return '';
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800` : url;
}
function parsePrecoStr(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.')) || 0;
}

// ─── HELPERS DE EXIBIÇÃO ───────────────────────
function totalPedido(p) {
  // valor total = unitário × qtd mínima
  return p.valorUnit * p.qtdMin;
}
function fmtPreco(n) {
  if (!n) return '';
  return n.toFixed(2).replace('.', ',');
}
function priceHTML_card(p) {
  if (!p.valorUnit) return `<p class="card-price sem-preco">Consulte o preço</p>`;
  const total = totalPedido(p);
  return `
    <div class="card-price-block">
      <p class="card-price">R$ ${fmtPreco(total)}</p>
      <p class="card-price-detail">caixa c/ ${p.qtdMin} · unit. R$ ${fmtPreco(p.valorUnit)}</p>
    </div>`;
}

// ─── FILTROS LINHA ─────────────────────────────
function buildFilters() {
  const bar = document.getElementById('filterBar');
  const linhas = ['Todos', ...new Set(allProducts.map(p=>p.linha).filter(Boolean).sort())];
  bar.innerHTML = linhas.map(l =>
    `<button class="filter-btn${l==='Todos'?' active':''}" data-cat="${l}">${l}</button>`
  ).join('');
  bar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.cat;
      renderGrid();
    });
  });
}

// ─── FILTRO SABOR ──────────────────────────────
function buildSaborFilter() {
  const sel = document.getElementById('saborFilter');
  const sabores = [...new Set(allProducts.flatMap(p=>p.sabores))].filter(Boolean).sort();
  sabores.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s; sel.appendChild(opt);
  });
  sel.addEventListener('change', () => { activeSabor = sel.value; renderGrid(); });
}

// ─── BUSCA ─────────────────────────────────────
function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderGrid();
  });
}

// ─── RENDER GRID ───────────────────────────────
function renderGrid() {
  const grid = document.getElementById('catalogGrid');
  const filtered = allProducts.filter(p => {
    const catOk   = activeFilter === 'Todos' || p.linha === activeFilter;
    const termOk  = p.nome.toLowerCase().includes(searchTerm);
    const saborOk = !activeSabor || p.sabores.map(s=>s.toLowerCase()).includes(activeSabor.toLowerCase());
    return catOk && termOk && saborOk;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><span>🔍</span>Nenhum produto encontrado.</div>';
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const idx   = allProducts.indexOf(p);
    const thumb = p.fotos[0] || ph();
    const esgBadge = !p.disponivel ? `<span class="card-esgotado-badge">Esgotado</span>` : '';
    const quickBtn = p.disponivel
      ? `<button class="card-quick-add" data-idx="${idx}">+ Carrinho</button>`
      : '';
    const linhaCls = linhaClass(p.linha);
    const linhaBadge = `<span class="card-linha-badge badge-${linhaCls}">${p.linha}</span>`;
    const nutriPills = p.nutri.slice(0,2).map(n =>
      `<span class="nutri-pill">${n}</span>`
    ).join('');
    const pesoHTML = p.peso ? `<p class="card-peso">${p.peso}</p>` : '';

    return `
      <article class="product-card${!p.disponivel?' esgotado':''}" data-idx="${idx}" tabindex="0" role="button">
        <div class="card-img-wrap">
          <img src="${thumb}" alt="${p.nome}" loading="lazy"/>
          ${linhaBadge}${esgBadge}${quickBtn}
        </div>
        <div class="card-body">
          <span class="card-linha${linhaCls==='strong'?' strong':''}">${p.linha}</span>
          <h3 class="card-name">${p.nome}</h3>
          ${nutriPills ? `<div class="card-nutri">${nutriPills}</div>` : ''}
          ${pesoHTML}
          ${priceHTML_card(p)}
        </div>
      </article>`;
  }).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('.card-quick-add')) openModal(allProducts[+card.dataset.idx]);
    });
    card.addEventListener('keydown', e => {
      if (e.key==='Enter'||e.key===' ') openModal(allProducts[+card.dataset.idx]);
    });
  });

  grid.querySelectorAll('.card-quick-add').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const p = allProducts[+btn.dataset.idx];
      if (p.sabores.length || p.embalagens.length) { openModal(p); return; }
      addToCart(p, null, null);
      showToast(`"${p.nome.substring(0,26)}..." adicionado 🛒`);
    });
  });
}

function linhaClass(linha) {
  const l = linha.toLowerCase();
  if (l.includes('strong'))      return 'strong';
  if (l.includes('performance')) return 'performance';
  if (l.includes('red rex'))     return 'redrex';
  return 'clean';
}
function ph() { return `https://placehold.co/400x400/1a1a1a/e02020?text=RAZE+LABS`; }

// ─── MODAL ─────────────────────────────────────
function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id==='modalOverlay') closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });
  document.getElementById('carouselPrev').addEventListener('click', () => goCarousel(-1));
  document.getElementById('carouselNext').addEventListener('click', () => goCarousel(1));
}

function openModal(product) {
  currentProduct = product;
  selectedSabor  = null;
  selectedTam    = null;
  carouselIdx    = 0;

  document.getElementById('modalLinha').textContent = product.linha;
  document.getElementById('modalName').textContent  = product.nome;

  // Peso — só informação
  const pesoEl = document.getElementById('modalPeso');
  pesoEl.textContent = product.peso ? `Peso: ${product.peso}` : '';

  // Preço: valor unitário + total do pedido mínimo
  const priceEl  = document.getElementById('modalPrice');
  const qtdEl    = document.getElementById('modalQtdInfo');
  if (product.valorUnit) {
    const total = totalPedido(product);
    priceEl.innerHTML = `R$ ${fmtPreco(total)} <span class="modal-price-unit">caixa c/ ${product.qtdMin} un.</span>`;
    qtdEl.textContent = `Valor unitário: R$ ${fmtPreco(product.valorUnit)}`;
    qtdEl.style.display = 'block';
  } else {
    priceEl.textContent = 'Consulte o preço';
    qtdEl.style.display = 'none';
  }

  // Tags nutricionais
  document.getElementById('nutriTags').innerHTML = product.nutri.map(n =>
    `<span class="nutri-tag">${n}</span>`
  ).join('');

  // Esgotado / disponível
  const actEl     = document.getElementById('modalActions');
  const esgEl     = document.getElementById('modalEsgotado');
  const esgInfoEl = document.getElementById('modalEsgotadoInfo');
  if (!product.disponivel) {
    esgEl.style.display='inline'; actEl.style.display='none'; esgInfoEl.style.display='flex';
  } else {
    esgEl.style.display='none'; actEl.style.display='flex'; esgInfoEl.style.display='none';
  }

  // Carrossel
  carouselImgs = product.fotos.length ? product.fotos : [ph()];
  buildCarousel();

  // ── Sabores: dropdown se >4, botões se ≤4 ──
  const saborRow  = document.getElementById('saborRow');
  const saborOpts = document.getElementById('saborOptions');
  saborOpts.innerHTML = '';

  if (product.sabores.length) {
    if (product.sabores.length > 4) {
      // Dropdown select
      const sel = document.createElement('select');
      sel.className = 'sabor-select';
      sel.innerHTML = `<option value="">Escolha o sabor...</option>` +
        product.sabores.map(s => `<option value="${s}">${s}</option>`).join('');
      sel.addEventListener('change', () => { selectedSabor = sel.value || null; });
      saborOpts.appendChild(sel);
    } else {
      // Botões
      saborOpts.innerHTML = product.sabores.map(s =>
        `<button class="attr-btn" data-val="${s}">${s}</button>`
      ).join('');
      saborOpts.querySelectorAll('.attr-btn').forEach(b => {
        b.addEventListener('click', () => {
          saborOpts.querySelectorAll('.attr-btn').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected'); selectedSabor = b.dataset.val;
        });
      });
    }
    saborRow.style.display = 'flex';
  } else {
    saborRow.style.display = 'none';
  }

  // ── Embalagens ──
  const tamRow  = document.getElementById('tamRow');
  const tamOpts = document.getElementById('tamOptions');
  if (product.embalagens.length) {
    tamOpts.innerHTML = product.embalagens.map(t =>
      `<button class="attr-btn" data-val="${t}">${t}</button>`
    ).join('');
    tamOpts.querySelectorAll('.attr-btn').forEach(b => {
      b.addEventListener('click', () => {
        tamOpts.querySelectorAll('.attr-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected'); selectedTam = b.dataset.val;
      });
    });
    tamRow.style.display = 'flex';
  } else {
    tamRow.style.display = 'none';
  }

  // Botão adicionar
  const btnAdd = document.getElementById('btnAddCart');
  btnAdd.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Adicionar ao carrinho`;
  btnAdd.classList.remove('added');
  btnAdd.onclick = () => {
    if (product.sabores.length && !selectedSabor)    { showToast('Selecione o sabor 👆'); return; }
    if (product.embalagens.length && !selectedTam)   { showToast('Selecione a embalagem 👆'); return; }
    addToCart(product, selectedSabor, selectedTam);
    btnAdd.innerHTML = '✓ Adicionado!';
    btnAdd.classList.add('added');
    setTimeout(closeModal, 700);
  };

  // WhatsApp direto
  const attrs = [selectedSabor&&`Sabor: ${selectedSabor}`, selectedTam&&`Embalagem: ${selectedTam}`].filter(Boolean).join(' | ');
  let waMsg = `Olá! Vi no catálogo e tenho interesse:\n*${product.nome}*`;
  if (attrs) waMsg += `\n${attrs}`;
  if (product.valorUnit) waMsg += `\nValor unitário: R$ ${fmtPreco(product.valorUnit)}\nPedido mínimo: ${product.qtdMin} un.\nTotal: R$ ${fmtPreco(totalPedido(product))}`;
  if (product.peso) waMsg += `\nPeso: ${product.peso}`;
  waMsg += `\n\nPoderia confirmar disponibilidade?`;
  document.getElementById('modalWhatsapp').href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMsg)}`;

  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── CARROSSEL ─────────────────────────────────
function buildCarousel() {
  const track = document.getElementById('carouselTrack');
  const dots  = document.getElementById('carouselDots');
  track.innerHTML = carouselImgs.map(src =>
    `<img src="${src}" alt="Foto" loading="lazy"/>`
  ).join('');
  dots.innerHTML = carouselImgs.map((_,i) =>
    `<span class="carousel-dot${i===0?' active':''}"></span>`
  ).join('');
  document.getElementById('carouselPrev').classList.toggle('hidden', carouselImgs.length<=1);
  document.getElementById('carouselNext').classList.toggle('hidden', carouselImgs.length<=1);
  updateCarousel();
}
function goCarousel(dir) {
  carouselIdx = (carouselIdx + dir + carouselImgs.length) % carouselImgs.length;
  updateCarousel();
}
function updateCarousel() {
  document.getElementById('carouselTrack').style.transform = `translateX(-${carouselIdx*100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((d,i) => d.classList.toggle('active', i===carouselIdx));
}

// ─── CARRINHO ──────────────────────────────────
function setupCart() {
  document.getElementById('cartFab').addEventListener('click', openCart);
  document.getElementById('cartClose').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', e => {
    if (e.target===document.getElementById('cartOverlay')) closeCart();
  });
  document.getElementById('btnSendOrder').addEventListener('click', sendOrder);
  document.getElementById('btnClearCart').addEventListener('click', () => {
    if (confirm('Limpar todos os itens do carrinho?')) { cart=[]; renderCart(); }
  });
}

function addToCart(product, sabor, tam) {
  const key = [product.nome, sabor||'', tam||''].join('|');
  const ex = cart.find(i=>i.key===key);
  if (ex) ex.caixas++;                     // incrementa caixas, não unidades
  else cart.push({ key, product, sabor, tam, caixas: 1 });
  renderCart(); bumpBadge();
}

function renderCart() {
  const itemsEl  = document.getElementById('cartItems');
  const emptyEl  = document.getElementById('cartEmpty');
  const footerEl = document.getElementById('cartFooter');
  const badge    = document.getElementById('cartBadge');

  // badge = total de caixas
  badge.textContent = cart.reduce((s,i)=>s+i.caixas, 0);

  if (!cart.length) {
    itemsEl.innerHTML=''; emptyEl.style.display='flex'; footerEl.style.display='none'; return;
  }
  emptyEl.style.display='none'; footerEl.style.display='flex';

  itemsEl.innerHTML = cart.map((item,i) => {
    const thumb     = item.product.fotos[0]||ph();
    const totalCx   = totalPedido(item.product) * item.caixas;
    const subHTML   = item.product.valorUnit
      ? `R$ ${fmtPreco(totalCx)} <span style="font-size:.7rem;color:#888">(${item.caixas} cx × R$ ${fmtPreco(totalPedido(item.product))})</span>`
      : 'A consultar';
    const attrs = [item.sabor&&`${item.sabor}`, item.tam&&`${item.tam}`].filter(Boolean).join(' · ');
    const qtdInfo = item.product.qtdMin > 1
      ? `<span class="cart-item-qtdmin">${item.caixas} cx × ${item.product.qtdMin} un. = ${item.caixas * item.product.qtdMin} un. total</span>`
      : `<span class="cart-item-qtdmin">${item.caixas} un.</span>`;
    return `
      <div class="cart-item" data-i="${i}">
        <img class="cart-item-img" src="${thumb}" alt="${item.product.nome}"/>
        <div class="cart-item-info">
          <span class="cart-item-name">${item.product.nome}</span>
          ${attrs?`<span class="cart-item-attrs">${attrs}</span>`:''}
          ${qtdInfo}
          <span class="cart-item-price">${subHTML}</span>
        </div>
        <div class="cart-item-controls">
          <div class="qty-row">
            <button class="qty-btn" data-a="dec" data-i="${i}">−</button>
            <span class="qty-num">${item.caixas}</span>
            <button class="qty-btn" data-a="inc" data-i="${i}">+</button>
          </div>
          <button class="btn-remove-item" data-i="${i}">remover</button>
        </div>
      </div>`;
  }).join('');

  itemsEl.querySelectorAll('.qty-btn').forEach(b => {
    b.addEventListener('click', () => {
      const i=+b.dataset.i;
      if (b.dataset.a==='inc') cart[i].caixas++;
      else { cart[i].caixas--; if(cart[i].caixas<=0) cart.splice(i,1); }
      renderCart();
    });
  });
  itemsEl.querySelectorAll('.btn-remove-item').forEach(b => {
    b.addEventListener('click', () => { cart.splice(+b.dataset.i,1); renderCart(); });
  });

  // Total geral
  let total = 0; let temSemPreco = false;
  cart.forEach(i => {
    const t = totalPedido(i.product) * i.caixas;
    if (t) total += t; else temSemPreco = true;
  });
  document.getElementById('cartTotal').textContent = total ? `R$ ${fmtPreco(total)}` : '—';
  document.getElementById('cartObs').style.display  = temSemPreco ? 'block':'none';
}

function bumpBadge() {
  const b = document.getElementById('cartBadge');
  b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  setTimeout(()=>b.classList.remove('bump'), 300);
}
function openCart()  { renderCart(); document.getElementById('cartOverlay').classList.add('open'); document.body.style.overflow='hidden'; }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.body.style.overflow=''; }

// ─── ENVIO PEDIDO ──────────────────────────────
function sendOrder() {
  if (!cart.length) return;
  let msg = `💪 *Olá Bruno!*\nSegue meu pedido:\n\n`;
  cart.forEach((item,i) => {
    const totalCx = totalPedido(item.product) * item.caixas;
    const unTotal = item.caixas * item.product.qtdMin;
    msg += `*${i+1}. ${item.product.nome}*\n`;
    if (item.sabor) msg += `   Sabor: ${item.sabor}\n`;
    if (item.tam)   msg += `   Embalagem: ${item.tam}\n`;
    msg += `   Caixas: ${item.caixas}`;
    if (item.product.qtdMin > 1) msg += ` (${unTotal} unidades)`;
    if (item.product.valorUnit) {
      msg += `\n   Unit.: R$ ${fmtPreco(item.product.valorUnit)} | Cx: R$ ${fmtPreco(totalPedido(item.product))} | Subtotal: R$ ${fmtPreco(totalCx)}`;
    }
    msg += `\n\n`;
  });
  const total = cart.reduce((s,i)=> s + totalPedido(i.product)*i.caixas, 0);
  if (total) msg += `*TOTAL DO PEDIDO: R$ ${fmtPreco(total)}*\n\n`;
  msg += `Aguardo confirmação de disponibilidade e entrega. Obrigado!`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── TOAST ─────────────────────────────────────
function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}

// ─── PRODUTOS DEMO ─────────────────────────────
function getDemoProducts() {
  return [
    { codigo:'LC01', nome:'100% Whey Gourmet 1,5kg', valorUnit:200.00, qtdMin:6, peso:'1,5 kg',
      linha:'Linha Clean',
      sabores:['Café Cremoso','Cookies Cream','Sorvete de Pistache','Milkshake de Chocolate','Céu Azul','Creme Suíço','Morango c/ Leite Condensado','Canjica','Milho Verde'],
      embalagens:['1,5 kg','750 g'], disponivel:true, nutri:['22g Proteína','Zero Açúcares Ad.'],
      fotos:['images/p-whey100-cafe.png','images/p-whey100-cremesuico.png','images/p-whey100-pistache.png'] },

    { codigo:'LC02', nome:'100% Whey Gourmet 450g', valorUnit:80.00, qtdMin:12, peso:'450 g',
      linha:'Linha Clean',
      sabores:['Chocolate com Coco','Creme de Amendoim','Leitinho Cremoso','Frutas Tropicais'],
      embalagens:['450 g'], disponivel:true, nutri:['22g Proteína'],
      fotos:['images/p-whey100-milkshake.png'] },

    { codigo:'LC03', nome:'Bulk Whey 900g', valorUnit:130.00, qtdMin:4, peso:'1,095 kg',
      linha:'Linha Clean',
      sabores:['Chokotine','Açaí com Leite Condensado','Sorvete de Morango','Cookies','Coco'],
      embalagens:['900 g'], disponivel:true, nutri:['21g Proteína'],
      fotos:['images/p-bulkwhey.png'] },

    { codigo:'LC04', nome:'Bulk Mass 3kg', valorUnit:180.00, qtdMin:4, peso:'3 kg',
      linha:'Linha Clean',
      sabores:['Chocolate','Morango','Cookies','Baunilha','Açaí','Frutas Tropicais','Napolitano'],
      embalagens:['3 kg'], disponivel:true, nutri:['25g Proteína/dose','Batata Doce e Creatina'],
      fotos:['images/p-bulkmass.png'] },

    { codigo:'LC05', nome:'Bulk Mass Zero Lactose 2kg', valorUnit:170.00, qtdMin:4, peso:'2 kg',
      linha:'Linha Clean',
      sabores:['Chocolate','Morango','Frutas Tropicais','Baunilha'],
      embalagens:['2 kg'], disponivel:true, nutri:['29g Proteína/dose','Zero Lactose'],
      fotos:['images/p-bulkmass-zerolact.png'] },

    { codigo:'LC06', nome:'Whey Protein Isolado Zero Lactose 900g', valorUnit:220.00, qtdMin:4, peso:'900 g',
      linha:'Linha Clean',
      sabores:['Chocolate','Creme','Cookies & Cream','Morango'],
      embalagens:['900 g'], disponivel:true, nutri:['25g Proteína','Zero Lactose'],
      fotos:['images/p-wheyisolado.png'] },

    { codigo:'LC07', nome:'Colágeno Hidrolisado 300g', valorUnit:60.00, qtdMin:12, peso:'300 g',
      linha:'Linha Clean', sabores:['Morango','Uva','Laranja','Maçã Verde'],
      embalagens:['300 g'], disponivel:true, nutri:['Tipos I, II & III','Biotina'],
      fotos:['images/p-colageno.png'] },

    { codigo:'LC08', nome:'MultPlus Multivitamínico 120 caps', valorUnit:55.00, qtdMin:12, peso:'120 g',
      linha:'Linha Clean', sabores:[], embalagens:['120 caps'], disponivel:true,
      nutri:['23 Vitaminas e Minerais'], fotos:['images/p-multplus.png'] },

    { codigo:'LC09', nome:'Omega 3 Ultra Concentrado 120 caps', valorUnit:65.00, qtdMin:12, peso:'160 g',
      linha:'Linha Clean', sabores:[], embalagens:['120 caps'], disponivel:true,
      nutri:['595mg EPA','401mg DHA'], fotos:['images/p-omega3.png'] },

    { codigo:'LC10', nome:'Creatina Monohidratada 300g', valorUnit:50.00, qtdMin:12, peso:'300 g',
      linha:'Linha Clean', sabores:['Laranja','Morango','Uva','Limão'],
      embalagens:['300 g'], disponivel:true, nutri:['Zero Carbo'],
      fotos:['images/p-creatina.png'] },

    { codigo:'LC11', nome:'SlimDry Diurético 210g', valorUnit:55.00, qtdMin:12, peso:'210 g',
      linha:'Linha Clean',
      sabores:['Abacaxi com Hortelã','Morango com Limão','Laranja com Morango'],
      embalagens:['210 g'], disponivel:true, nutri:['Chá Instantâneo'],
      fotos:['images/p-slimdry.png'] },

    { codigo:'LC12', nome:'COQ-10 Coenzima Q10 30 caps', valorUnit:45.00, qtdMin:12, peso:'21 g',
      linha:'Linha Clean', sabores:[], embalagens:['30 caps'], disponivel:true,
      nutri:['200mg CoQ10'], fotos:['images/p-coq10.png'] },

    { codigo:'LS01', nome:'Pure Whey Protein Premium 900g', valorUnit:190.00, qtdMin:4, peso:'900 g',
      linha:'Linha Strong',
      sabores:['Creme Suíço','Morango','Chocolate','Chokotine','Açaí','Frutas Tropicais','Pistache','Leitinho Cookies'],
      embalagens:['900 g'], disponivel:true, nutri:['23g Proteína','9g BCAA'],
      fotos:['images/p-purewhey.png'] },

    { codigo:'LS03', nome:'Creatine 100% Pura', valorUnit:45.00, qtdMin:12, peso:'',
      linha:'Linha Strong', sabores:[], embalagens:['300 g','150 g'], disponivel:true,
      nutri:['3g Creatina/dose','100% Pura'], fotos:['images/p-creatine-strong.png'] },

    { codigo:'LS04', nome:'Glutamina 100% Pura 300g', valorUnit:55.00, qtdMin:12, peso:'300 g',
      linha:'Linha Strong', sabores:[], embalagens:['300 g'], disponivel:true,
      nutri:['5g Glutamina/dose'], fotos:['images/p-glutamina.png'] },

    { codigo:'LP01', nome:'11 Bravo Testo Booster 60 caps', valorUnit:80.00, qtdMin:6, peso:'54 g',
      linha:'Linha Performance', sabores:[], embalagens:['60 caps'], disponivel:true,
      nutri:['Testo Booster'], fotos:['images/p-11bravo.png'] },

    { codigo:'LP02', nome:'Derrete ABD 60 caps', valorUnit:70.00, qtdMin:6, peso:'30 g',
      linha:'Linha Performance', sabores:[], embalagens:['60 caps'], disponivel:true,
      nutri:['200mg Cafeína','L-Carnitina'], fotos:['images/p-derrete.png'] },

    { codigo:'LP03', nome:'Immortal Pre Workout 300g', valorUnit:90.00, qtdMin:6, peso:'300 g',
      linha:'Linha Performance', sabores:['Uva','Black Ice','Tutti Frutti','Frutas Amarelas'],
      embalagens:['300 g'], disponivel:true, nutri:['Beta Alanina','Cafeína'],
      fotos:['images/p-immortal.png'] },

    { codigo:'LP04', nome:'Nightmare Pre Workout 300g', valorUnit:90.00, qtdMin:6, peso:'300 g',
      linha:'Linha Performance', sabores:['Tangerina','Maçã Verde'],
      embalagens:['300 g'], disponivel:true, nutri:['400mg Cafeína','Citrulina'],
      fotos:['images/p-nightmare.png'] },

    { codigo:'LP05', nome:'Ninja Pump Pre Workout 300g', valorUnit:90.00, qtdMin:6, peso:'300 g',
      linha:'Linha Performance', sabores:['Tangerina','Maçã Verde'],
      embalagens:['300 g'], disponivel:true, nutri:['Zero Cafeína','L-Arginina'],
      fotos:['images/p-ninjapump.png'] },

    { codigo:'LP06', nome:'Venomous Pre Workout 300g', valorUnit:110.00, qtdMin:6, peso:'300 g',
      linha:'Linha Performance', sabores:['Uva','Green Ice','Green Apple','Morango'],
      embalagens:['300 g'], disponivel:true, nutri:['400mg Cafeína','O Mais Forte'],
      fotos:['images/p-venomous.png'] },

    { codigo:'LR01', nome:'Beef Protein Isolate 900g', valorUnit:210.00, qtdMin:4, peso:'900 g',
      linha:'Linha Red Rex', sabores:['Uva','Morango','Laranja com Morango'],
      embalagens:['900 g'], disponivel:true, nutri:['28g Proteína','Low Carb'],
      fotos:['images/p-beefprotein.png'] },
  ];
}
