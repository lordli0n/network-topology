/* ================================
   GLOBAL DURUMLAR
================================ */
let scale = 1;
let posX = 0;
let posY = 0;

let placementMode = null;
let selectedObject = null;
let selectedCable = null;

let cableDrawing = null; // { from, points, tempPath }

const canvas = document.getElementById("canvas");
const mapArea = document.getElementById("map-area");
const cableLayer = document.getElementById("cable-layer");

const connections = [];


/* ================================
   KOORDİNAT DÖNÜŞÜMÜ
================================ */
function screenToWorld(x, y) {
    const rect = mapArea.getBoundingClientRect();
    return {
        x: (x - rect.left - posX) / scale,
        y: (y - rect.top - posY) / scale
    };
}

function getDeviceCenterWorld(el) {
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    return {
        x: left + el.offsetWidth / 2,
        y: top + el.offsetHeight / 2
    };
}


/* ================================
   CİHAZ SEÇME → HARİTAYA KOYMA
================================ */
document.querySelectorAll(".palette-item").forEach(btn => {
    btn.addEventListener("click", () => {
        placementMode = btn.dataset.type;
        document.body.style.cursor = "crosshair";
    });
});

canvas.addEventListener("click", e => {
    if (cableDrawing) return;  // kablo modundaysa cihaz eklenmez
    if (!placementMode) return;

    if (e.target.closest(".object")) return;

    const pos = screenToWorld(e.clientX, e.clientY);

    const obj = document.createElement("div");
    obj.classList.add("object");
    obj.style.left = pos.x + "px";
    obj.style.top = pos.y + "px";
    obj.dataset.type = placementMode;

    const icon =
        placementMode === "switch" ? "🟦" :
        placementMode === "camera" ? "📷" :
        placementMode === "Distributor" ? "🟪" :
        "💻";

    obj.innerHTML = `
        <div class="icon">${icon}</div>
        <div class="device-label"></div>
    `;

    obj.addEventListener("click", () => selectObject(obj));
    obj.addEventListener("dblclick", () => openIpEditorFor(obj));

    obj.addEventListener("contextmenu", ev => {
        ev.preventDefault();
        showContextMenu(ev.clientX, ev.clientY, obj);
    });

    enableDeviceDrag(obj);
    mapArea.appendChild(obj);

    placementMode = null;
    document.body.style.cursor = "default";
});


/* ================================
   CİHAZ SEÇME
================================ */
function selectObject(el) {
    if (selectedObject) selectedObject.classList.remove("selected");
    selectedObject = el;
    el.classList.add("selected");
}


/* ================================
   CİHAZ SÜRÜKLEME
================================ */
function enableDeviceDrag(el) {
    let dragging = false;
    let startX = 0, startY = 0;

    el.addEventListener("mousedown", e => {
        if (e.button !== 0) return;
        dragging = true;
        e.stopPropagation();

        startX = e.clientX - (parseFloat(el.style.left) * scale + posX);
        startY = e.clientY - (parseFloat(el.style.top) * scale + posY);
    });

    document.addEventListener("mousemove", e => {
        if (!dragging) return;

        const x = (e.clientX - startX - posX) / scale;
        const y = (e.clientY - startY - posY) / scale;

        el.style.left = x + "px";
        el.style.top = y + "px";

        updateConnectionsFor(el);
    });

    document.addEventListener("mouseup", () => dragging = false);
}


/* ================================
   SAĞ TIK MENÜ
================================ */
const contextMenu = document.getElementById("context-menu");
let contextMenuTarget = null;

function showContextMenu(x, y, target) {
    contextMenuTarget = target;
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
    contextMenu.classList.remove("hidden");
}

document.addEventListener("click", e => {
    if (!contextMenu.contains(e.target))
        contextMenu.classList.add("hidden");
});

contextMenu.addEventListener("click", e => {
    const act = e.target.dataset.action;
    if (!act) return;

    if (act === "start-cable") startCable(contextMenuTarget);
    if (act === "edit-ip") openIpEditorFor(contextMenuTarget);
    if (act === "edit-label") openLabelEditor(contextMenuTarget);
    if (act === "delete") deleteDevice(contextMenuTarget);

    contextMenu.classList.add("hidden");
});


/* ================================
   IP PANELİ
================================ */
const ipEditor = document.getElementById("ip-editor");
const ipInput = document.getElementById("ip-input");

document.getElementById("ip-save").onclick = () => {
    if (!selectedObject) return;
    selectedObject.dataset.ip = ipInput.value;
    ipEditor.classList.add("hidden");
};

function openIpEditorFor(el) {
    selectedObject = el;

    const rect = mapArea.getBoundingClientRect();
    ipEditor.style.left = rect.left + posX + parseFloat(el.style.left) * scale + "px";
    ipEditor.style.top = rect.top + posY + parseFloat(el.style.top) * scale + "px";

    ipInput.value = el.dataset.ip || "";
    ipEditor.classList.remove("hidden");
}


/* ================================
   LABEL PANELİ
================================ */
const labelEditor = document.getElementById("label-editor");
const labelInput = document.getElementById("label-input");

document.getElementById("label-save").onclick = () => {
    if (!selectedObject) return;
    selectedObject.querySelector(".device-label").textContent = labelInput.value;
    labelEditor.classList.add("hidden");
};

function openLabelEditor(el) {
    selectedObject = el;
    const rect = mapArea.getBoundingClientRect();

    labelEditor.style.left = rect.left + posX + parseFloat(el.style.left) * scale + "px";
    labelEditor.style.top = rect.top + posY + (parseFloat(el.style.top) + 40) * scale + "px";

    labelInput.value = el.querySelector(".device-label").textContent;
    labelEditor.classList.remove("hidden");
}


/* ================================
   KABLO BAŞLATMA
================================ */
function startCable(device) {
    const startPoint = getDeviceCenterWorld(device);

    const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tempPath.classList.add("cable-path");
    cableLayer.appendChild(tempPath);

    cableDrawing = {
        from: device,
        points: [startPoint],
        tempPath
    };
}


/* ================================
   KABLO ÇİZİMİ (CİHAZA TIKLAYINCA BİTER)
================================ */
canvas.addEventListener("click", e => {
    if (!cableDrawing) return;

    // Cihaza tıklama yakalama (icon/label dahil)
    const dev = e.target.closest(".object");

    if (dev) {
        if (dev !== cableDrawing.from) {
            const endPoint = getDeviceCenterWorld(dev);
            cableDrawing.points.push(endPoint);

            finalizeConnection(
                cableDrawing.from,
                dev,
                cableDrawing.points,
                cableDrawing.tempPath
            );
        }
        cableDrawing = null;
        return;
    }

    // Ara nokta
    const pos = screenToWorld(e.clientX, e.clientY);
    cableDrawing.points.push(pos);
    updateCablePath(cableDrawing.tempPath, cableDrawing.points);
});


/* ================================
   ESC → KABLO İPTAL ET
================================ */
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && cableDrawing) {
        if (cableDrawing.tempPath) {
            cableDrawing.tempPath.remove();
        }
        cableDrawing = null;
    }
});


/* ================================
   KABLO SHAPE GÜNCELLEME
================================ */
function updateCablePath(path, pts) {
    if (pts.length < 2) return;

    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x},${pts[i].y}`;
    }
    path.setAttribute("d", d);
}


/* ================================
   KABLOYU TAMAMLAMA
================================ */
function finalizeConnection(from, to, pts, path) {
    const conn = { from, to, points: pts, path };
    connections.push(conn);
    startPingSimulation(conn);
}


/* ================================
   CİHAZ TAŞINIRKEN KABLO GÜNCELLE
================================ */
function updateConnectionsFor(dev) {
    connections.forEach(c => {
        if (c.from === dev)
            c.points[0] = getDeviceCenterWorld(dev);

        if (c.to === dev)
            c.points[c.points.length - 1] = getDeviceCenterWorld(dev);

        updateCablePath(c.path, c.points);
    });
}


/* ================================
   KABLO SEÇME / DELETE
================================ */
cableLayer.addEventListener("click", e => {
    if (e.target.tagName !== "path") return;

    if (selectedCable) selectedCable.classList.remove("cable-selected");
    selectedCable = e.target;

    selectedCable.classList.add("cable-selected");
});

document.addEventListener("keydown", e => {
    if (e.key === "Delete" && selectedCable)
        deleteCable(selectedCable);
});

function deleteCable(path) {
    for (let i = connections.length - 1; i >= 0; i--) {
        if (connections[i].path === path) {
            path.remove();
            connections.splice(i, 1);
        }
    }
}


/* ================================
   PING SİMÜLASYONU
================================ */
function startPingSimulation(conn) {
    function pulse() {
        const ok = Math.random() < 0.8;
        conn.path.classList.toggle("cable-ok", ok);
        conn.path.classList.toggle("cable-fail", !ok);
    }
    pulse();
    conn.timerId = setInterval(pulse, 2000);
}
