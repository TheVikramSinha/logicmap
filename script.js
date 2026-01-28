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
let isDirty = false;

// Selection State
let selectedSourceCols = new Set();
let selectedTargetCols = new Set();

// 50-Color Hex Palette
const COLOR_PALETTE = [
    '#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#475569',
    '#db2777', '#9333ea', '#4f46e5', '#0891b2', '#0d9488', '#16a34a',
    '#ca8a04', '#ea580c', '#e11d48', '#be123c', '#86198f', '#6d28d9',
    '#1e40af', '#155e75', '#115e59', '#166534', '#854d0e', '#9a3412',
    '#9f1239', '#881337', '#701a75', '#581c87', '#3730a3', '#1e3a8a',
    '#172554', '#064e3b', '#065f46', '#042f2e', '#4a044e', '#450a0a',
    '#57534e', '#44403c', '#292524', '#1c1917', '#18181b', '#27272a',
    '#be185d', '#a21caf', '#7e22ce', '#6b21a8', '#c026d3', '#0284c7',
    '#0369a1', '#075985'
];
let importBatchCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    setupViewport();
    updateDropdowns();
    document.addEventListener('keydown', (e) => {
        if((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
    });
});

window.addEventListener('beforeunload', (e) => {
    if (tables.length > 0 || isDirty) { e.preventDefault(); e.returnValue = ''; }
});

/* --- LAYOUT ENGINE --- */
function getSmartCoordinates() {
    let maxX = 0;
    let minY = 100;
    if (tables.length > 0) {
        tables.forEach(t => {
            if (t.x + 200 > maxX) maxX = t.x + 200;
            if (t.y < minY) minY = t.y;
        });
        maxX += 150; // Buffer
    } else {
        maxX = 100;
    }
    return { x: maxX, y: minY };
}

/* --- UNDO --- */
function saveState() {
    isDirty = true;
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
        const worldX = (e.clientX - view.x) / view.scale;
        const worldY = (e.clientY - view.y) / view.scale;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.min(Math.max(0.1, view.scale + delta), 4);
        view.x = e.clientX - (worldX * newScale);
        view.y = e.clientY - (worldY * newScale);
        view.scale = newScale;
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
    window.addEventListener('mouseup', () => { isDragging = false; viewport.style.cursor = 'grab'; });
}
function updateTransform() { document.getElementById('world').style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`; }
function adjustZoom(delta) {
    const newScale = Math.min(Math.max(0.1, view.scale + delta), 4);
    const rect = document.getElementById('viewport').getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - view.x) / view.scale;
    const worldY = (centerY - view.y) / view.scale;
    view.x = centerX - (worldX * newScale);
    view.y = centerY - (worldY * newScale);
    view.scale = newScale;
    updateTransform();
    document.getElementById('zoom-level').innerText = Math.round(view.scale * 100) + '%';
}
function resetView() { view = { x: 0, y: 0, scale: 1 }; updateTransform(); document.getElementById('zoom-level').innerText = '100%'; }

/* --- FACE-TO-FACE ROUTING --- */
function drawRelationships() {
    const svg = document.getElementById('connectionsLayer');
    const defs = svg.querySelector('defs').outerHTML;
    svg.innerHTML = defs; 

    relationships.forEach(rel => {
        const sEl = document.getElementById(`${rel.fromTable}_${rel.fromCol}`);
        const eEl = document.getElementById(`${rel.toTable}_${rel.toCol}`);

        if (sEl && eEl) {
            const r1 = sEl.getBoundingClientRect();
            const r2 = eEl.getBoundingClientRect();
            const w = document.getElementById('world').getBoundingClientRect();
            const s = view.scale;
            const off = 100000; // Infinite Offset

            const sX = (r1.left + r1.width/2 - w.left)/s + off;
            const sY = (r1.top + r1.height/2 - w.top)/s + off;
            const eX = (r2.left + r2.width/2 - w.left)/s + off;
            const eY = (r2.top + r2.height/2 - w.top)/s + off;

            const sFaces = [{x: (r1.right-w.left)/s+off, y: sY, dir: 1}, {x: (r1.left-w.left)/s+off, y: sY, dir: -1}];
            const eFaces = [{x: (r2.right-w.left)/s+off, y: eY, dir: 1}, {x: (r2.left-w.left)/s+off, y: eY, dir: -1}];

            let start = sFaces[0], end = eFaces[1];
            if (eX > sX + 50) { start = sFaces[0]; end = eFaces[1]; }
            else if (eX < sX - 50) { start = sFaces[1]; end = eFaces[0]; }
            else { start = sFaces[0]; end = eFaces[0]; }

            const curvature = 0.5;
            const dist = Math.max(50, Math.abs(end.x - start.x) * curvature);
            const d = `M ${start.x} ${start.y} C ${start.x + dist*start.dir} ${start.y}, ${end.x + dist*end.dir} ${end.y}, ${end.x} ${end.y}`;

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

/* --- DRAGGING LOGIC (GROUP + SINGLE) --- */
let activeTbl = null;
let offsetTbl = { x:0, y:0 };
let groupDragData = []; 
let isGroupDrag = false;

// 1. Regular Move via Header
function startDragTable(e, div) {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    
    e.stopPropagation();
    e.preventDefault();
    activeTbl = div;
    const t = tables.find(x => x.id === activeTbl.id);
    groupDragData = [];
    isGroupDrag = false;

    // Shift Key = Group Drag
    if (e.shiftKey && t.groupId) {
        initGroupDrag(t, e);
    } else {
        // Single Drag
        const rect = div.getBoundingClientRect();
        offsetTbl.x = (e.clientX - rect.left) / view.scale;
        offsetTbl.y = (e.clientY - rect.top) / view.scale;
    }
    
    window.addEventListener('mousemove', onDragTable);
    window.addEventListener('mouseup', stopDragTable);
}

// 2. Explicit Group Move via Handle (⋈)
function startGroupDrag(e, id) {
    e.stopPropagation();
    e.preventDefault();
    const t = tables.find(x => x.id === id);
    if (!t) return;
    
    const div = document.getElementById(id);
    activeTbl = div;
    initGroupDrag(t, e);
    
    window.addEventListener('mousemove', onDragTable);
    window.addEventListener('mouseup', stopDragTable);
}

function initGroupDrag(t, e) {
    isGroupDrag = true;
    const group = tables.filter(tbl => tbl.groupId === t.groupId);
    
    // Calculate based on World Mouse Position
    const startWorldX = (e.clientX - view.x) / view.scale;
    const startWorldY = (e.clientY - view.y) / view.scale;
    
    group.forEach(g => {
        const el = document.getElementById(g.id);
        if(el) el.style.opacity = '0.7'; // Feedback
        
        groupDragData.push({
            id: g.id,
            // Store delta from mouse to table top-left
            dx: g.x - startWorldX,
            dy: g.y - startWorldY
        });
    });
}

function onDragTable(e) {
    if (!activeTbl) return;
    
    if (isGroupDrag) {
        // Current World Mouse
        const worldMouseX = (e.clientX - view.x) / view.scale;
        const worldMouseY = (e.clientY - view.y) / view.scale;
        
        groupDragData.forEach(item => {
            const tbl = tables.find(t => t.id === item.id);
            if(tbl) {
                tbl.x = worldMouseX + item.dx;
                tbl.y = worldMouseY + item.dy;
                
                const el = document.getElementById(tbl.id);
                if(el) {
                    el.style.left = tbl.x + 'px';
                    el.style.top = tbl.y + 'px';
                }
            }
        });
    } else {
        // Single Table Logic
        const currentX = (e.clientX - view.x) / view.scale - offsetTbl.x;
        const currentY = (e.clientY - view.y) / view.scale - offsetTbl.y;
        
        const t = tables.find(x => x.id === activeTbl.id);
        t.x = currentX;
        t.y = currentY;
        activeTbl.style.left = t.x + 'px';
        activeTbl.style.top = t.y + 'px';
    }
    drawRelationships();
}

function stopDragTable() {
    if(isGroupDrag) {
        groupDragData.forEach(item => {
            const el = document.getElementById(item.id);
            if(el) el.style.opacity = '1';
        });
    }
    activeTbl = null;
    groupDragData = [];
    isGroupDrag = false;
    window.removeEventListener('mousemove', onDragTable);
    window.removeEventListener('mouseup', stopDragTable);
    saveState();
}

/* --- RENDER UI (WITH COLOR & HANDLE) --- */
function renderTableUI(table) {
    const existing = document.getElementById(table.id); 
    if(existing) existing.remove();
    
    const div = document.createElement('div'); 
    div.className = 'db-table'; 
    div.id = table.id; 
    div.style.left = table.x + 'px'; 
    div.style.top = table.y + 'px';
    
    // Inline Hex Color
    const headerColor = table.color || '#2563eb';

    // Group Handle
    const groupIcon = table.groupId ? 
        `<span class="group-handle" title="Drag to move group" onmousedown="startGroupDrag(event, '${table.id}')">⋈</span>` : '';

    div.innerHTML = `
        <div class="table-header" onmousedown="startDragTable(event, this.parentElement)" style="background-color: ${headerColor}">
            <div style="display:flex; align-items:center; gap:6px;">
                ${groupIcon}
                <span>${table.name}</span>
            </div>
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

/* --- ADD & IMPORT --- */
function addTable(name, columns, color='#2563eb', x=null, y=null) {
    if (x === null) {
        const pos = getSmartCoordinates();
        x = pos.x;
        y = pos.y;
    }
    const tbl = { 
        id: 'tbl_' + Date.now() + Math.random().toString(16).slice(2), 
        name, x, y, columns, 
        color: color, 
        groupId: null 
    };
    tables.push(tbl);
    renderTableUI(tbl);
    updateDropdowns();
    return tbl.id;
}

function processManualTable() {
    const name = document.getElementById('manualTableName').value;
    const color = document.getElementById('manualTableColor').value;
    if(!name) return alert("Enter Name");
    
    const cols = [];
    document.querySelectorAll('#manualColumnList .col-row').forEach(r => {
        const cName = r.querySelector('.col-name').value.trim();
        const cType = r.querySelector('.col-type').value;
        if(cName) cols.push({ name: cName, type: cType });
    });

    if (cols.length === 0) return alert("Add at least one column");

    if(editingId) {
        saveState();
        const t = tables.find(x => x.id === editingId);
        t.name = name; t.columns = cols; t.color = color;
        renderTableUI(t); drawRelationships();
    } else {
        const pos = getSmartCoordinates();
        addTable(name, cols, color, pos.x, pos.y);
        view.x = -pos.x * view.scale + 150;
        view.y = -pos.y * view.scale + 150;
        updateTransform();
    }
    document.getElementById('newTableModal').style.display='none';
}

function loadProject(input) {
    const f = input.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            const d = JSON.parse(e.target.result);
            saveState();
            const idMap = {};
            const batchColor = COLOR_PALETTE[importBatchCount % COLOR_PALETTE.length];
            const batchGroupId = 'group_' + Date.now();
            importBatchCount++;

            const startPos = getSmartCoordinates();
            let loadedMinX = Infinity;
            let loadedMinY = Infinity;

            d.tables.forEach((t, i) => {
                const newId = 'tbl_' + Date.now() + Math.random().toString(16).slice(2);
                idMap[t.id] = newId;
                t.id = newId;
                t.groupId = batchGroupId;
                t.color = batchColor;

                if (t.x === undefined) {
                    // Grid Layout
                    const col = i % 3; 
                    const row = Math.floor(i / 3);
                    t.x = startPos.x + (col * 250);
                    t.y = startPos.y + (row * 350);
                } else {
                    // Shift existing block
                    t.x = (t.x || 0) + startPos.x;
                    t.y = (t.y || 0) + 50; 
                }
                
                if (t.x < loadedMinX) loadedMinX = t.x;
                if (t.y < loadedMinY) loadedMinY = t.y;

                tables.push(t);
                renderTableUI(t);
            });

            if (d.relationships) {
                d.relationships.forEach(rel => {
                    if (idMap[rel.fromTable] && idMap[rel.toTable]) {
                        rel.id = 'rel_' + Date.now() + Math.random();
                        rel.fromTable = idMap[rel.fromTable];
                        rel.toTable = idMap[rel.toTable];
                        relationships.push(rel);
                    }
                });
            }
            drawRelationships(); updateDropdowns(); renderRelationshipList();
            if (tables.length > 0) {
                view.x = -loadedMinX * view.scale + 100; 
                view.y = -loadedMinY * view.scale + 100;
                updateTransform();
            }
        } catch (err) { alert("Error loading JSON: " + err); }
    };
    r.readAsText(f);
    input.value = '';
}

function processSmartImport() {
    const txt = document.getElementById('importText').value.trim();
    const name = document.getElementById('importTableName').value;
    if(!txt) return;
    saveState();
    
    const pos = getSmartCoordinates();
    let xOff = pos.x; 
    let yOff = pos.y;

    if(txt.includes('erDiagram') || txt.includes('||--') || txt.includes('}|--')) {
        parseMermaid(txt, xOff, yOff); 
    } else {
        const cols = [];
        txt.split('\n').forEach(l => {
            const p = l.trim().split(/\s+/);
            if(p.length>=2) cols.push({ type: p[0], name: p[1] });
        });
        addTable(name || 'Imported', cols, '#2563eb', xOff, yOff);
    }
    
    document.getElementById('importText').value = '';
    document.getElementById('importTableName').value = '';
    closeModal('importModal');
    
    view.x = -xOff * view.scale + 150;
    view.y = -yOff * view.scale + 150;
    updateTransform();
}

function parseMermaid(code, startX, startY) {
    code = code.replace(/erDiagram/g, '').trim();
    const batchColor = COLOR_PALETTE[importBatchCount % COLOR_PALETTE.length];
    importBatchCount++;
    const batchGroupId = 'group_' + Date.now();
    
    const createdTables = {};
    const entityRegex = /([a-zA-Z0-9_]+)\s*\{([^}]+)\}/g;
    let match;
    let tableCount = 0;

    while ((match = entityRegex.exec(code)) !== null) {
        const tableName = match[1];
        const content = match[2].trim();
        const rows = content.split('\n');
        const cols = [];
        rows.forEach(row => {
            let cleanRow = row.split('%%')[0].trim();
            if(!cleanRow) return;
            const parts = cleanRow.split(/\s+/);
            if(parts.length >= 2) cols.push({ type: parts[0], name: parts[1] });
        });
        
        const col = tableCount % 3;
        const row = Math.floor(tableCount / 3);
        const tx = startX + (col * 250);
        const ty = startY + (row * 350);
        tableCount++;

        const id = addTable(tableName, cols, batchColor, tx, ty);
        const t = tables.find(x => x.id === id);
        t.groupId = batchGroupId;
        createdTables[tableName] = { id, cols, name: tableName };
    }
    const relRegex = /([a-zA-Z0-9_]+)\s+([}|][|o]?(?:--|\.\.)[|o]?[|{])\s+([a-zA-Z0-9_]+)/g; 
    while ((match = relRegex.exec(code)) !== null) { const t1Name = match[1]; const t2Name = match[3]; const symbol = match[2]; const t1 = createdTables[t1Name]; const t2 = createdTables[t2Name]; if(t1 && t2) { let fromCol = t1.cols[0]?.name || 'unknown'; let toCol = t2.cols[0]?.name || 'unknown'; let type = '1:1'; if (symbol.includes('{') || symbol.includes('}')) type = '1:N'; relationships.push({ id: 'rel_' + Date.now() + Math.random(), fromTable: t1.id, fromCol: fromCol, toTable: t2.id, toCol: toCol, type: type }); } } 
    drawRelationships(); renderRelationshipList();
}

/* --- EXPORT SNAPSHOT (HEX COLORS) --- */
function exportSnapshot() {
    if (tables.length === 0) return alert("Nothing to export!");
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tables.forEach(t => { if (t.x < minX) minX = t.x; if (t.y < minY) minY = t.y; if (t.x + 200 > maxX) maxX = t.x + 200; if (t.y + 200 > maxY) maxY = t.y + 200; });
    const padding = 50; const width = (maxX - minX) + (padding * 2); const height = (maxY - minY) + (padding * 2); const shiftX = -minX + padding; const shiftY = -minY + padding;
    let svgPaths = "";
    relationships.forEach(rel => {
        const startT = tables.find(t => t.id === rel.fromTable); const endT = tables.find(t => t.id === rel.toTable); if(!startT || !endT) return;
        const startRowIdx = startT.columns.findIndex(c => c.name === rel.fromCol); const endRowIdx = endT.columns.findIndex(c => c.name === rel.toCol);
        let startY = (startT.y + shiftY) + 37 + (startRowIdx * 29) + 14; let endY = (endT.y + shiftY) + 37 + (endRowIdx * 29) + 14;
        let startX = (startT.x + shiftX) + 200; let endX = (endT.x + shiftX);
        let d = `M ${startX} ${startY} C ${startX+50} ${startY}, ${endX-50} ${endY}, ${endX} ${endY}`;
        svgPaths += `<path d="${d}" stroke="#2b2b2b" stroke-width="1.2" fill="none" marker-end="url(#arrow-head)" />`;
    });
    
    const tablesHTML = tables.map(t => { 
        const x = t.x + shiftX; const y = t.y + shiftY; 
        const rows = t.columns.map(c => `<div class="row"><span>${c.name}</span><span class="type">${c.type}</span></div>`).join(''); 
        const headerColor = t.color || '#2563eb'; // Export with inline Hex
        return `<div class="table" style="left: ${x}px; top: ${y}px;"><div class="header" style="background:${headerColor}">${t.name}</div><div class="body">${rows}</div></div>`; 
    }).join('');
    
    const viewerScript = `<script>let view={x:0,y:0,scale:1};const world=document.getElementById('world');let isDragging=false,start={x:0,y:0};window.addEventListener('mousedown',e=>{isDragging=true;start={x:e.clientX-view.x,y:e.clientY-view.y};document.body.style.cursor='grabbing'});window.addEventListener('mousemove',e=>{if(!isDragging)return;view.x=e.clientX-start.x;view.y=e.clientY-start.y;update()});window.addEventListener('mouseup',()=>{isDragging=false;document.body.style.cursor='default'});window.addEventListener('wheel',e=>{e.preventDefault();const worldX=(e.clientX-view.x)/view.scale;const worldY=(e.clientY-view.y)/view.scale;const delta=e.deltaY>0?-0.1:0.1;view.scale=Math.min(Math.max(0.1,view.scale+delta),4);view.x=e.clientX-(worldX*view.scale);view.y=e.clientY-(worldY*view.scale);update()},{passive:false});function update(){world.style.transform=\`translate(\${view.x}px,\${view.y}px) scale(\${view.scale})\`}<\/script>`;
    const finalHTML = `<!DOCTYPE html><html><head><title>LogicMap Snapshot</title><style>body{margin:0;padding:0;background:#e5e7eb;font-family:'Inter',sans-serif;overflow:hidden;height:100vh;width:100vw}.viewport{width:100%;height:100%;cursor:grab;background-image:radial-gradient(#cbd5e1 1px,transparent 1px);background-size:20px 20px;background-color:#f8f9fa}.world{transform-origin:0 0;position:absolute;top:0;left:0}svg{position:absolute;width:${width}px;height:${height}px;pointer-events:none;overflow:visible}.table{position:absolute;width:200px;background:white;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);z-index:10}.header{color:white;padding:8px 12px;font-size:13px;font-weight:600;border-radius:6px 6px 0 0}.body{padding:4px 0}.row{display:flex;justify-content:between;padding:6px 12px;font-size:12px;color:#1e293b;border-bottom:1px solid transparent}.type{color:#64748b;font-size:11px}</style><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"></head><body><div class="viewport"><div id="world" class="world"><svg><defs><marker id="arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#2b2b2b" stroke-width="1" /></marker></defs>${svgPaths}</svg>${tablesHTML}</div></div>${viewerScript}</body></html>`;
    const blob = new Blob([finalHTML], {type: "text/html"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "LogicMap_Snapshot.html"; a.click();
}

/* --- UTILS --- */
function openEditTableModal(id, e) { if(e) e.stopPropagation(); editingId = id; const table = tables.find(t => t.id === id); document.getElementById('newTableModal').style.display = 'flex'; document.getElementById('manualTableName').value = table.name; document.getElementById('manualTableColor').value = table.color || '#2563eb'; document.getElementById('manualColumnList').innerHTML = ''; table.columns.forEach(c => addManualColumnRow(c.name, c.type)); }
function openNewTableModal() { editingId = null; document.getElementById('newTableModal').style.display = 'flex'; document.getElementById('manualTableName').value = ''; document.getElementById('manualTableColor').value = '#2563eb'; document.getElementById('manualColumnList').innerHTML = ''; addManualColumnRow(); }
let draggedRow = null;
function addManualColumnRow(name='', type='string') { const list = document.getElementById('manualColumnList'); const row = document.createElement('div'); row.className = 'col-row'; row.draggable = true; row.addEventListener('dragstart', e => { draggedRow = row; row.classList.add('dragging'); }); row.addEventListener('dragend', () => { row.classList.remove('dragging'); draggedRow = null; }); list.addEventListener('dragover', e => { e.preventDefault(); const after = getDragAfterElement(list, e.clientY); if (!after) list.appendChild(draggedRow); else list.insertBefore(draggedRow, after); }); row.innerHTML = `<span style="cursor:grab; padding:5px; color:#64748b;">☰</span><input type="text" class="col-name" value="${name}" style="flex:2"><select class="col-type" style="flex:1"><option value="string" ${type==='string'?'selected':''}>String</option><option value="int" ${type==='int'?'selected':''}>Int</option><option value="boolean" ${type==='boolean'?'selected':''}>Bool</option><option value="date" ${type==='date'?'selected':''}>Date</option><option value="id" ${type==='id'?'selected':''}>ID</option></select><button class="btn-remove-col" onclick="this.parentElement.remove()">×</button>`; list.appendChild(row); }
function getDragAfterElement(container, y) { const els = [...container.querySelectorAll('.col-row:not(.dragging)')]; return els.reduce((closest, child) => { const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; if (offset < 0 && offset > closest.offset) return { offset: offset, element: child }; else return closest; }, { offset: Number.NEGATIVE_INFINITY }).element; }
function updateDropdowns(){ const opts = '<option value="">Select Table</option>' + tables.map(t=>`<option value="${t.id}">${t.name}</option>`).join(''); document.getElementById('sourceTable').innerHTML = opts; document.getElementById('targetTable').innerHTML = opts; selectedSourceCols.clear(); selectedTargetCols.clear(); renderColList(document.getElementById('sourceTable').value, 'sourceCols', 'source'); renderColList(document.getElementById('targetTable').value, 'targetCols', 'target'); }
function updateColumnLists() { selectedSourceCols.clear(); selectedTargetCols.clear(); renderColList(document.getElementById('sourceTable').value, 'sourceCols', 'source'); renderColList(document.getElementById('targetTable').value, 'targetCols', 'target'); }
function renderColList(tid, eid, side) { const ul = document.getElementById(eid); ul.innerHTML = ''; const t = tables.find(x=>x.id===tid); if(t) t.columns.forEach(c => { const li = document.createElement('li'); li.innerText = c.name; li.onclick = function() { const set = (side === 'source') ? selectedSourceCols : selectedTargetCols; const otherSet = (side === 'source') ? selectedTargetCols : selectedSourceCols; const otherSide = (side === 'source') ? 'target' : 'source'; if (set.has(c.name)) { set.delete(c.name); this.classList.remove('selected'); } else { set.add(c.name); this.classList.add('selected'); } if (set.size > 1 && otherSet.size > 1) { otherSet.clear(); const otherTid = document.getElementById(`${otherSide}Table`).value; renderColList(otherTid, `${otherSide}Cols`, otherSide); } }; const set = (side === 'source') ? selectedSourceCols : selectedTargetCols; if(set.has(c.name)) li.classList.add('selected'); ul.appendChild(li); }); }
function createSmartRelationship() { const sId = document.getElementById('sourceTable').value; const tId = document.getElementById('targetTable').value; if (!sId || !tId) return alert("Select Source and Target Tables."); if (selectedSourceCols.size === 0 || selectedTargetCols.size === 0) return alert("Select at least one column on both sides."); saveState(); if (selectedSourceCols.size > 1) { const tCol = [...selectedTargetCols][0]; selectedSourceCols.forEach(sCol => { relationships.push({ id: 'rel_'+Date.now()+Math.random(), fromTable: sId, fromCol: sCol, toTable: tId, toCol: tCol, type: 'N:1' }); }); } else if (selectedTargetCols.size > 1) { const sCol = [...selectedSourceCols][0]; selectedTargetCols.forEach(tCol => { relationships.push({ id: 'rel_'+Date.now()+Math.random(), fromTable: sId, fromCol: sCol, toTable: tId, toCol: tCol, type: '1:N' }); }); } else { const sCol = [...selectedSourceCols][0]; const tCol = [...selectedTargetCols][0]; relationships.push({ id: 'rel_'+Date.now()+Math.random(), fromTable: sId, fromCol: sCol, toTable: tId, toCol: tCol, type: '1:1' }); } drawRelationships(); renderRelationshipList(); selectedSourceCols.clear(); selectedTargetCols.clear(); updateColumnLists(); }
function requestDeleteTable(id, e) { e.stopPropagation(); deletingId = id; document.getElementById('deleteModal').style.display='flex'; }
function confirmDelete() { if (!deletingId) return; saveState(); tables = tables.filter(t => t.id !== deletingId); relationships = relationships.filter(r => r.fromTable !== deletingId && r.toTable !== deletingId); document.getElementById(deletingId)?.remove(); drawRelationships(); renderRelationshipList(); document.getElementById('deleteModal').style.display='none'; deletingId = null; }
function deleteRel(id) { saveState(); relationships = relationships.filter(r => r.id !== id); drawRelationships(); renderRelationshipList(); }
function renderRelationshipList() { const list = document.getElementById('relationshipList'); list.innerHTML = ''; relationships.forEach(r => { const t1 = tables.find(t => t.id === r.fromTable)?.name; const t2 = tables.find(t => t.id === r.toTable)?.name; const li = document.createElement('li'); li.className = 'rel-item'; li.innerHTML = `<span>${t1}.${r.fromCol} → ${t2}.${r.toCol}</span> <span class="rel-delete" onclick="deleteRel('${r.id}')">×</span>`; list.appendChild(li); }); }
function exportMermaid() { if (tables.length === 0) return alert("Nothing to export!"); let output = "erDiagram\n"; tables.forEach(t => { const safeName = t.name.replace(/[^a-zA-Z0-9_]/g, '_'); output += `    ${safeName} {\n`; t.columns.forEach(c => { const safeCol = c.name.replace(/[^a-zA-Z0-9_]/g, '_'); output += `        ${c.type} ${safeCol}\n`; }); output += `    }\n`; }); relationships.forEach(r => { const t1 = tables.find(t => t.id === r.fromTable).name.replace(/[^a-zA-Z0-9_]/g, '_'); const t2 = tables.find(t => t.id === r.toTable).name.replace(/[^a-zA-Z0-9_]/g, '_'); let symbol = '||--||'; if (r.type === '1:N' || r.type === 'N:1') symbol = '||--o{'; output += `    ${t1} ${symbol} ${t2} : "links_to"\n`; }); document.getElementById('exportText').value = output; document.getElementById('exportModal').style.display = 'flex'; }
function saveProject(){ const blob = new Blob([JSON.stringify({tables, relationships})], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='schema.json'; a.click(); }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function openModal(id) { document.getElementById(id).style.display='flex'; }
function toggleHighlight(tid, col, e) { e.stopPropagation(); document.querySelectorAll('.db-table').forEach(t => t.classList.add('dimmed')); document.getElementById(tid).classList.remove('dimmed'); drawRelationships(); relationships.forEach(r => { if((r.fromTable===tid && r.fromCol===col) || (r.toTable===tid && r.toCol===col)) { const el = document.getElementById(r.id); if(el) { el.setAttribute('stroke', '#ef4444'); el.setAttribute('stroke-width', '1.5'); el.setAttribute('marker-end', 'url(#arrow-active)'); } document.getElementById(r.fromTable).classList.remove('dimmed'); document.getElementById(r.toTable).classList.remove('dimmed'); } }); document.getElementById('viewport').onclick = () => { document.querySelectorAll('.db-table').forEach(t => t.classList.remove('dimmed')); drawRelationships(); }; }