/* --- STATE --- */
let tables = [];
let relationships = [];
let historyStack = [];
const MAX_HISTORY = 20;
let editingId = null;
let deletingId = null;

let view = { x: 0, y: 0, scale: 1 };
let isDragging = false;
let startDrag = { x: 0, y: 0 };

/* --- INIT --- */
document.addEventListener('DOMContentLoaded', () => {
    setupViewport();
    updateDropdowns();
    // Shortcuts
    document.addEventListener('keydown', (e) => {
        if((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
    });
});

/* --- UNDO --- */
function saveState() {
    if (historyStack.length >= MAX_HISTORY) historyStack.shift();
    historyStack.push(JSON.stringify({ tables, relationships }));
}
function undo() {
    if (!historyStack.length) return;
    const prev = JSON.parse(historyStack.pop());
    tables = prev.tables;
    relationships = prev.relationships;
    refreshAll();
}
function refreshAll() {
    document.getElementById('world').innerHTML = '<svg id="connectionsLayer"><defs>' + document.querySelector('defs').outerHTML + '</defs></svg>';
    tables.forEach(t => renderTableUI(t));
    drawRelationships();
    updateDropdowns();
    renderRelationshipList();
}

/* --- VIEWPORT --- */
function setupViewport() {
    const viewport = document.getElementById('viewport');
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        view.scale = Math.min(Math.max(0.2, view.scale + delta), 4);
        updateTransform();
        document.getElementById('zoom-level').innerText = Math.round(view.scale * 100) + '%';
    });
    viewport.addEventListener('mousedown', (e) => {
        if (e.target.id === 'viewport' || e.target.id === 'connectionsLayer') {
            isDragging = true;
            startDrag = { x: e.clientX - view.x, y: e.clientY - view.y };
            viewport.style.cursor = 'grabbing';
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        view.x = e.clientX - startDrag.x;
        view.y = e.clientY - startDrag.y;
        updateTransform();
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        viewport.style.cursor = 'grab';
    });
}
function updateTransform() {
    document.getElementById('world').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}
function resetView() {
    view = { x: 0, y: 0, scale: 1 };
    updateTransform();
}

/* --- TABLES --- */
function addTable(name, columns, x=null, y=null) {
    if (x === null) x = (Math.abs(view.x) + 100) / view.scale;
    if (y === null) y = (Math.abs(view.y) + 100) / view.scale;
    
    const tbl = { id: 'tbl_' + Date.now(), name, x, y, columns };
    tables.push(tbl);
    renderTableUI(tbl);
    updateDropdowns();
}

function renderTableUI(table) {
    const existing = document.getElementById(table.id);
    if(existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'db-table';
    div.id = table.id;
    div.style.left = table.x + 'px';
    div.style.top = table.y + 'px';

    div.innerHTML = `
        <div class="table-header" onmousedown="startDragTable(event, this.parentElement)">
            <span>${table.name}</span>
            <div class="header-actions">
                <button class="btn-header" onclick="openEditTableModal('${table.id}', event)">✎</button>
                <button class="btn-header" onclick="requestDeleteTable('${table.id}', event)">×</button>
            </div>
        </div>
        <div class="table-body">
            ${table.columns.map(col => `
                <div class="table-row" id="${table.id}_${col.name}" onclick="toggleHighlight('${table.id}', '${col.name}', event)">
                    <span>${col.name}</span><span>${col.type}</span>
                </div>
            `).join('')}
        </div>
    `;
    document.getElementById('world').appendChild(div);
}

/* --- GRID ROUTING --- */
function drawRelationships() {
    const svg = document.getElementById('connectionsLayer');
    const defs = svg.querySelector('defs').outerHTML;
    svg.innerHTML = defs; 

    relationships.forEach(rel => {
        const startEl = document.getElementById(`${rel.fromTable}_${rel.fromCol}`);
        const endEl = document.getElementById(`${rel.toTable}_${rel.toCol}`);

        if (startEl && endEl) {
            const r1 = startEl.getBoundingClientRect();
            const r2 = endEl.getBoundingClientRect();
            const w = document.getElementById('world').getBoundingClientRect();

            const startX = (r1.right - w.left) / view.scale;
            const startY = (r1.top + r1.height/2 - w.top) / view.scale;
            const endLeft = (r2.left - w.left) / view.scale;
            const endRight = (r2.right - w.left) / view.scale;
            const endY = (r2.top + r2.height/2 - w.top) / view.scale;
            const startLeft = (r1.left - w.left) / view.scale;

            let x1 = startX, x2 = endLeft;
            
            // Logic: Forward or Backward
            if (endLeft > startX + 50) {
                 x1 = startX; x2 = endLeft;
            } else if (endRight < startLeft - 50) {
                 x1 = startLeft; x2 = endRight;
            }

            const midX = x1 + (x2 - x1) / 2;
            let d = '';
            
            // Backward loop logic simplification for stability
            if (x2 < x1) {
                d = `M ${startX} ${startY} L ${startX+20} ${startY} L ${startX+20} ${endY} L ${endLeft} ${endY}`;
            } else {
                d = `M ${x1} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${x2} ${endY}`;
            }

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("stroke", "#2b2b2b");
            path.setAttribute("stroke-width", "1.2");
            path.setAttribute("fill", "none");
            path.setAttribute("marker-end", "url(#arrow-head)");
            path.id = rel.id;
            path.style.cursor = "pointer";
            path.onclick = (e) => { if(confirm('Remove link?')) deleteRel(rel.id); };
            svg.appendChild(path);
        }
    });
}

/* --- DRAG --- */
let activeTbl = null;
let offsetTbl = { x:0, y:0 };
function startDragTable(e, div) {
    e.stopPropagation();
    activeTbl = div;
    const rect = div.getBoundingClientRect();
    offsetTbl.x = (e.clientX - rect.left) / view.scale;
    offsetTbl.y = (e.clientY - rect.top) / view.scale;
    window.addEventListener('mousemove', onDragTable);
    window.addEventListener('mouseup', stopDragTable);
}
function onDragTable(e) {
    if (!activeTbl) return;
    const worldRect = document.getElementById('world').getBoundingClientRect();
    const newX = (e.clientX - worldRect.left) / view.scale - offsetTbl.x;
    const newY = (e.clientY - worldRect.top) / view.scale - offsetTbl.y;
    activeTbl.style.left = newX + 'px';
    activeTbl.style.top = newY + 'px';
    const t = tables.find(x => x.id === activeTbl.id);
    if(t) { t.x = newX; t.y = newY; }
    drawRelationships();
}
function stopDragTable() {
    activeTbl = null;
    window.removeEventListener('mousemove', onDragTable);
    window.removeEventListener('mouseup', stopDragTable);
}

/* --- ACTIONS --- */
function requestDeleteTable(id, e) {
    e.stopPropagation();
    deletingId = id;
    document.getElementById('deleteModal').style.display='flex';
}
function confirmDelete() {
    if (!deletingId) return;
    saveState();
    tables = tables.filter(t => t.id !== deletingId);
    relationships = relationships.filter(r => r.fromTable !== deletingId && r.toTable !== deletingId);
    document.getElementById(deletingId)?.remove();
    drawRelationships();
    renderRelationshipList();
    document.getElementById('deleteModal').style.display='none';
    deletingId = null;
}
function addRelationship(type) {
    const sId = document.getElementById('sourceTable').value;
    const tId = document.getElementById('targetTable').value;
    const sCol = document.querySelector('#sourceCols .selected')?.innerText;
    const tCol = document.querySelector('#targetCols .selected')?.innerText;
    if (!sId || !tId || !sCol || !tCol) return alert("Select tables and columns.");
    saveState();
    relationships.push({ id: 'rel_'+Date.now(), fromTable: sId, fromCol: sCol, toTable: tId, toCol: tCol, type });
    drawRelationships();
    renderRelationshipList();
}
function deleteRel(id) {
    saveState();
    relationships = relationships.filter(r => r.id !== id);
    drawRelationships();
    renderRelationshipList();
}
function renderRelationshipList() {
    const list = document.getElementById('relationshipList');
    list.innerHTML = '';
    relationships.forEach(r => {
        const t1 = tables.find(t => t.id === r.fromTable)?.name;
        const t2 = tables.find(t => t.id === r.toTable)?.name;
        const li = document.createElement('li');
        li.className = 'rel-item';
        li.innerHTML = `<span>${t1}.${r.fromCol} ➝ ${t2}.${r.toCol}</span> <span class="rel-delete" onclick="deleteRel('${r.id}')">×</span>`;
        list.appendChild(li);
    });
}

/* --- MODALS --- */
function openNewTableModal() {
    editingId = null;
    document.getElementById('newTableModal').style.display = 'flex';
    document.getElementById('manualTableName').value = '';
    document.getElementById('manualColumnList').innerHTML = '';
    addManualColumnRow(); addManualColumnRow();
}
function openEditTableModal(id, e) {
    if(e) e.stopPropagation();
    editingId = id;
    const table = tables.find(t => t.id === id);
    document.getElementById('newTableModal').style.display = 'flex';
    document.getElementById('manualTableName').value = table.name;
    document.getElementById('manualColumnList').innerHTML = '';
    table.columns.forEach(c => addManualColumnRow(c.name, c.type));
}
function addManualColumnRow(name='', type='string') {
    const row = document.createElement('div');
    row.className = 'col-row';
    row.innerHTML = `
        <input type="text" class="col-name" value="${name}" style="flex:2">
        <select class="col-type" style="flex:1">
            <option value="string" ${type==='string'?'selected':''}>String</option>
            <option value="int" ${type==='int'?'selected':''}>Int</option>
            <option value="boolean" ${type==='boolean'?'selected':''}>Bool</option>
            <option value="date" ${type==='date'?'selected':''}>Date</option>
            <option value="id" ${type==='id'?'selected':''}>ID</option>
        </select>
        <button class="btn-remove-col" onclick="this.parentElement.remove()">×</button>
    `;
    document.getElementById('manualColumnList').appendChild(row);
}
function processManualTable() {
    const name = document.getElementById('manualTableName').value;
    if(!name) return alert("Enter Name");
    const cols = [];
    document.querySelectorAll('#manualColumnList .col-row').forEach(r => {
        const cName = r.querySelector('.col-name').value;
        const cType = r.querySelector('.col-type').value;
        if(cName) cols.push({ name: cName, type: cType });
    });
    if(editingId) {
        saveState();
        const t = tables.find(x => x.id === editingId);
        t.name = name; t.columns = cols;
        renderTableUI(t);
        drawRelationships();
    } else {
        addTable(name, cols);
    }
    document.getElementById('newTableModal').style.display='none';
}
function processSmartImport() {
    const txt = document.getElementById('importText').value;
    const name = document.getElementById('importTableName').value || 'Imported';
    if(!txt) return;
    const cols = [];
    txt.split('\n').forEach(l => {
        const p = l.trim().split(/\s+/);
        if(p.length>=2) cols.push({ type: p[0], name: p[1] });
    });
    addTable(name, cols);
    document.getElementById('importText').value = '';
    document.getElementById('importTableName').value = '';
    document.getElementById('importModal').style.display='none';
}
function closeModal(id) { document.getElementById(id).style.display='none'; }
function openModal(id) { document.getElementById(id).style.display='flex'; }
function updateDropdowns(){
    const opts = '<option value="">Select Table</option>' + tables.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    document.getElementById('sourceTable').innerHTML = opts;
    document.getElementById('targetTable').innerHTML = opts;
}
function updateColumnLists(){
    renderColList(document.getElementById('sourceTable').value, 'sourceCols');
    renderColList(document.getElementById('targetTable').value, 'targetCols');
}
function renderColList(tid, eid){
    const ul = document.getElementById(eid);
    ul.innerHTML = '';
    const t = tables.find(x=>x.id===tid);
    if(t) t.columns.forEach(c => {
        const li = document.createElement('li');
        li.innerText = c.name;
        li.onclick = function(){ Array.from(ul.children).forEach(x=>x.classList.remove('selected')); this.classList.add('selected'); };
        ul.appendChild(li);
    });
}
function toggleHighlight(tid, col, e) {
    e.stopPropagation();
    document.querySelectorAll('.db-table').forEach(t => t.classList.add('dimmed'));
    document.getElementById(tid).classList.remove('dimmed');
    const uid = `${tid}_${col}`;
    drawRelationships(); 
    relationships.forEach(r => {
        if((r.fromTable===tid && r.fromCol===col) || (r.toTable===tid && r.toCol===col)) {
            const el = document.getElementById(r.id);
            if(el) { 
                el.setAttribute('stroke', '#ef4444'); 
                el.setAttribute('stroke-width', '2');
                el.setAttribute('marker-end', 'url(#arrow-active)');
            }
            document.getElementById(r.fromTable).classList.remove('dimmed');
            document.getElementById(r.toTable).classList.remove('dimmed');
        }
    });
    document.getElementById('viewport').onclick = () => {
        document.querySelectorAll('.db-table').forEach(t => t.classList.remove('dimmed'));
        drawRelationships();
    };
}
function saveProject(){
    const blob = new Blob([JSON.stringify({tables, relationships})], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download='schema.json';
    a.click();
}
function loadProject(input){
    const f=input.files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=e=>{
        const d=JSON.parse(e.target.result);
        tables=d.tables; relationships=d.relationships;
        refreshAll();
    };
    r.readAsText(f);
}

/* --- EXPORT SNAPSHOT --- */
function exportSnapshot() {
    if (tables.length === 0) return alert("Nothing to export!");

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tables.forEach(t => {
        if (t.x < minX) minX = t.x;
        if (t.y < minY) minY = t.y;
        if (t.x + 200 > maxX) maxX = t.x + 200; 
        if (t.y + 200 > maxY) maxY = t.y + 200; 
    });
    
    const padding = 50;
    const width = (maxX - minX) + (padding * 2);
    const height = (maxY - minY) + (padding * 2);
    const shiftX = -minX + padding;
    const shiftY = -minY + padding;

    let svgPaths = "";
    relationships.forEach(rel => {
        const startT = tables.find(t => t.id === rel.fromTable);
        const endT = tables.find(t => t.id === rel.toTable);
        if(!startT || !endT) return;
        const startRowIdx = startT.columns.findIndex(c => c.name === rel.fromCol);
        const endRowIdx = endT.columns.findIndex(c => c.name === rel.toCol);
        const startY = (startT.y + shiftY) + 37 + (startRowIdx * 29) + 14; 
        const endY = (endT.y + shiftY) + 37 + (endRowIdx * 29) + 14;
        const startX = (startT.x + shiftX) + 200; 
        const endX = (endT.x + shiftX);           
        let d = '';
        if(endX < startX + 50) {
             d = `M ${startX} ${startY} L ${startX+20} ${startY} L ${startX+20} ${endY} L ${endX} ${endY}`;
        } else {
             const midX = startX + (endX - startX)/2;
             d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
        }
        svgPaths += `<path d="${d}" stroke="#2b2b2b" stroke-width="1.2" fill="none" marker-end="url(#arrow-head)" />`;
    });

    const tablesHTML = tables.map(t => {
        const x = t.x + shiftX;
        const y = t.y + shiftY;
        const rows = t.columns.map(c => `<div class="row"><span>${c.name}</span><span class="type">${c.type}</span></div>`).join('');
        return `<div class="table" style="left: ${x}px; top: ${y}px;"><div class="header">${t.name}</div><div class="body">${rows}</div></div>`;
    }).join('');

    const finalHTML = `
<!DOCTYPE html>
<html>
<head>
<title>LogicMap Export</title>
<style>
    body { margin: 0; padding: 0; background: #ffffff; font-family: 'Inter', sans-serif; }
    .canvas { position: relative; width: ${width}px; height: ${height}px; background-color: #f8f9fa; background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 20px 20px; margin: 20px auto; border: 1px solid #e2e8f0; }
    svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
    .table { position: absolute; width: 200px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: flex; flex-direction: column; z-index: 10; }
    .header { background: #2563eb; color: white; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 6px 6px 0 0; }
    .body { padding: 4px 0; }
    .row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 12px; color: #1e293b; border-bottom: 1px solid transparent; }
    .type { color: #64748b; font-size: 11px; }
    @media print { body { margin: 0; background: white; } .canvas { border: none; margin: 0; } }
</style>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
    <div class="canvas">
        <svg><defs><marker id="arrow-head" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,2 L10,6 L0,10" fill="none" stroke="#2b2b2b" stroke-width="1.2" /></marker></defs>${svgPaths}</svg>
        ${tablesHTML}
    </div>
</body>
</html>`;

    const blob = new Blob([finalHTML], {type: "text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "LogicMap_Snapshot.html";
    a.click();
}