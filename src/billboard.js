import * as THREE from 'three';

export class Billboard {
    constructor(options = {}) {
        this.content         = options.content || '';
        this.position        = options.position || new THREE.Vector3();
        this.width           = options.width   || 0.2;
        this.height          = options.height  || 0.15;
        this.backgroundColor = options.backgroundColor || 'rgba(5, 12, 20, 0.92)';
        this.textColor       = options.textColor   || '#e0eeff';
        this.accentColor     = options.accentColor || '#00d2ff';
        this.borderColor     = options.borderColor || 'rgba(0, 210, 255, 0.4)';
        this.fontSize        = options.fontSize    || 48;
        this.padding         = options.padding     || 30;
        this.opacity         = options.opacity !== undefined ? options.opacity : 1.0;
        this.bobSpeed        = options.bobSpeed    !== undefined ? options.bobSpeed    : 1.2;
        this.bobAmplitude    = options.bobAmplitude !== undefined ? options.bobAmplitude : 0;
        this.lookAtCamera    = options.lookAtCamera !== undefined ? options.lookAtCamera : true;
        this.canvasWidth     = options.canvasWidth  || 1536;
        this.canvasHeight    = options.canvasHeight || 1152;
        this.name            = options.name        || 'billboard';
        this.onClick         = options.onClick     || null;
        this.onClickData     = options.onClickData || null;
 
        // Scroll state
        this._scrollY         = 0;
        this._scrollDirection = 1;
        this._scrollSpeed     = options.scrollSpeed !== undefined ? options.scrollSpeed : 0;
        this._contentHeight   = 0;
        this._lastScrollTime  = null;
        this._needsScroll     = false;
        this._pauseTimer      = null;

        // Per-row hit areas for TABLE_ROW clicks
        this._rowHitAreas = [];
        this._hoveredRowId = null;

        this._createCanvas();
        this._createMesh();
        this.setContent(this.content);
        this.originalY = this.position.y;
    }

    _createCanvas() {
        this.canvas       = document.createElement('canvas');
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
        this.ctx     = this.canvas.getContext('2d');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
    }

    _createMesh() {
        this.geometry = new THREE.PlaneGeometry(this.width, this.height);
        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            transparent: true,
            opacity: this.opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(this.position);
        this.mesh.userData = { isBillboard: true, billboard: this };
    }

    setContent(markdown) {
        this.content         = markdown.trim(); // Trim trailing/leading newlines
        this._scrollY        = 0;
        this._lastScrollTime = null;
        this._rowHitAreas    = [];
        this._hoveredRowId   = null;
        this._renderFrame(0);
    }

    setHover(rowId) {
        if (this._hoveredRowId !== rowId) {
            this._hoveredRowId = rowId;
            this._renderFrame(this._scrollY);
        }
    }

    _renderFrame(scrollOffsetY) {
        const ctx = this.ctx;
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const p = this.padding;

        this._rowHitAreas = [];

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = this.borderColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);

        ctx.save();
        ctx.beginPath();
        ctx.rect(p * 0.5, p * 0.5, w - p, h - p);
        ctx.clip();

        const totalH = this._measureContent(ctx, w, p);
        this._contentHeight = totalH;

        this._drawContent(ctx, w, h, p, -scrollOffsetY);
        ctx.restore();

        if (this._needsScroll) {
            const maxScroll = totalH - (h - p);
            const ratio  = Math.min(1, scrollOffsetY / maxScroll);
            const trackH = h - p * 2;
            const thumbH = Math.max(30, trackH * ((h - p) / totalH));
            const thumbY = p + ratio * (trackH - thumbH);
            ctx.fillStyle = 'rgba(0,210,255,0.15)';
            ctx.fillRect(w - 14, p, 8, trackH);
            ctx.fillStyle = 'rgba(0,210,255,0.6)';
            ctx.fillRect(w - 14, thumbY, 8, thumbH);
        }

        this.texture.needsUpdate = true;
    }

    _measureContent(ctx, w, p) {
        let y = p; // Start at top padding
        const lh = this.fontSize * 1.5;

        for (const rawLine of this.content.split('\n')) {
            const line = rawLine.trim();
            if (!line) { y += this.fontSize * 0.5; continue; }

            let lineCount = 0;
            if (line.startsWith('# ')) {
                ctx.font = `600 ${this.fontSize * 1.5}px 'Outfit', sans-serif`;
                lineCount = _measureWrappedLines(ctx, line.slice(2), w - p * 2 - 20);
                y += this.fontSize * 0.5 + lineCount * (this.fontSize * 1.5);
            } else if (line.startsWith('## ')) {
                ctx.font = `600 ${this.fontSize * 1.3}px 'Outfit', sans-serif`;
                lineCount = _measureWrappedLines(ctx, line.slice(3), w - p * 2 - 20);
                y += this.fontSize * 0.3 + lineCount * (this.fontSize * 1.5);
            } else if (line.startsWith('TABLE_HEADER|')) {
                y += this.fontSize * 2.0;
            } else if (line.startsWith('TABLE_ROW|')) {
                y += this.fontSize * 2.2;
            } else if (line === '---') {
                y += this.fontSize;
            } else {
                ctx.font = `300 ${this.fontSize}px 'Outfit', sans-serif`;
                const indent = line.startsWith('- ') ? 30 : 0;
                lineCount = _measureWrappedLines(ctx, line, w - p * 2 - indent - 20);
                y += lineCount * lh;
            }
        }
        
        // Use a very tight 2px buffer now that math is hyper-accurate
        this._needsScroll = (y + p * 0.5) > (this.canvasHeight - p + 2);
        return y + p * 0.5;
    }

    _drawContent(ctx, w, h, p, yOffset) {
        let y = p + this.fontSize + yOffset;
        let tableRowIdx = 0;

        for (const rawLine of this.content.split('\n')) {
            const line = rawLine.trim();
            if (!line) { y += this.fontSize * 0.5; continue; }

            if (line.startsWith('# ')) {
                ctx.font = `600 ${this.fontSize * 1.5}px 'Outfit', sans-serif`;
                ctx.fillStyle = this.accentColor;
                y += this.fontSize * 0.5;
                y = this._renderInlineText(ctx, line.slice(2), p, y, w - p * 2 - 20, h);

            } else if (line.startsWith('## ')) {
                ctx.font = `600 ${this.fontSize * 1.3}px 'Outfit', sans-serif`;
                ctx.fillStyle = this.accentColor;
                y += this.fontSize * 0.3;
                y = this._renderInlineText(ctx, line.slice(3), p, y, w - p * 2 - 20, h);

            } else if (line.startsWith('TABLE_HEADER|')) {
                tableRowIdx = 0;
                const cols  = line.slice(13).split('|');
                const rowH  = this.fontSize * 2.0;
                const rowY  = y - this.fontSize * 0.8;
                if (rowY < h && rowY + rowH > 0) {
                    ctx.fillStyle = 'rgba(0, 210, 255, 0.22)';
                    ctx.fillRect(p * 0.5, rowY, w - p, rowH);
                    ctx.font      = `600 ${this.fontSize * 0.85}px 'Outfit', sans-serif`;
                    ctx.fillStyle = this.accentColor;
                    const cw = _colWidths(cols.length, w, p);
                    let cx = p + 8;
                    for (let i = 0; i < cols.length; i++) {
                        ctx.fillText(cols[i].toUpperCase(), cx, rowY + rowH * 0.65);
                        cx += cw[i];
                    }
                }
                y += rowH;

            } else if (line.startsWith('TABLE_ROW|')) {
                const parts  = line.slice(10).split('|');
                const rowId  = parts[0];
                const cols   = parts.slice(1);
                const rowH   = this.fontSize * 2.2;
                const rowTop = y - this.fontSize * 0.8;
                const rowBot = rowTop + rowH;

                // Store hit area in virtual canvas space (without scroll offset)
                this._rowHitAreas.push({
                    id:       rowId,
                    yStartPx: rowTop - yOffset,
                    yEndPx:   rowBot - yOffset,
                });

                if (rowTop < h && rowBot > 0) {
                    if (this._hoveredRowId === rowId) {
                        ctx.fillStyle = 'rgba(0, 210, 255, 0.25)';
                    } else {
                        ctx.fillStyle = tableRowIdx % 2 === 0
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(0, 210, 255, 0.07)';
                    }
                    ctx.fillRect(p * 0.5, rowTop, w - p, rowH);

                    ctx.font = `300 ${this.fontSize * 0.85}px 'Outfit', sans-serif`;
                    const cw = _colWidths(cols.length, w, p);
                    let cx = p + 8;
                    for (let i = 0; i < cols.length; i++) {
                        ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.5)' : this.textColor;
                        let text = cols[i];
                        const maxW = cw[i] - 16;
                        while (ctx.measureText(text).width > maxW && text.length > 4) {
                            text = text.slice(0, -4) + '…';
                        }
                        ctx.fillText(text, cx, rowTop + rowH * 0.62);
                        cx += cw[i];
                    }
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(p * 0.5, rowBot);
                    ctx.lineTo(w - p * 0.5, rowBot);
                    ctx.stroke();
                }
                tableRowIdx++;
                y += rowH;

            } else if (line === '---') {
                if (y > 0 && y < h) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(p, y - this.fontSize * 0.5);
                    ctx.lineTo(w - p - 20, y - this.fontSize * 0.5);
                    ctx.stroke();
                }
                y += this.fontSize;

            } else {
                const isList = line.startsWith('- ');
                ctx.font      = `300 ${this.fontSize}px 'Outfit', sans-serif`;
                ctx.fillStyle = this.textColor;
                const indent = isList ? p + 20 : p;
                const text   = isList ? '• ' + line.slice(2) : line;
                y = this._renderInlineText(ctx, text, indent, y, w - indent - p - 20, h);
            }
        }
    }

    _renderInlineText(ctx, line, x, y, maxWidth, canvasH) {
        const baseFont  = ctx.font;
        const boldFont  = baseFont.replace(/^\d+\s/, '600 ');
        const baseColor = ctx.fillStyle;

        const tokens = [];
        for (const seg of _parseInline(line)) {
            for (const w of seg.text.split(/(\s+)/)) {
                if (w) tokens.push({ word: w, bold: seg.bold });
            }
        }

        let buf = [], bw = 0;
        const lh = this.fontSize * 1.5;

        const flush = () => {
            if (!buf.length) return;
            if (y > 0 && y < canvasH) {
                let cx = x;
                for (const { word, bold } of buf) {
                    ctx.font      = bold ? boldFont : baseFont;
                    ctx.fillStyle = bold ? this.accentColor : baseColor;
                    ctx.fillText(word, cx, y);
                    cx += ctx.measureText(word).width;
                }
            }
            buf = []; bw = 0; y += lh;
        };

        for (const tok of tokens) {
            ctx.font = tok.bold ? boldFont : baseFont;
            const tw = ctx.measureText(tok.word).width;
            if (bw + tw > maxWidth && buf.length) flush();
            buf.push(tok); bw += tw;
        }
        flush();
        return y;
    }

    /**
     * Returns the TABLE_ROW entry hit at the given UV coordinate.
     * uv.x: 0=left, 1=right | uv.y: 0=bottom, 1=top (Three.js convention)
     */
    hitTest(uv) {
        if (!this._rowHitAreas.length) return null;
        const canvasY = (1 - uv.y) * this.canvasHeight + this._scrollY;
        return this._rowHitAreas.find(r => canvasY >= r.yStartPx && canvasY <= r.yEndPx) || null;
    }

    scroll(deltaY) {
        if (!this._needsScroll) return;
        const maxScroll = this._contentHeight - (this.canvasHeight - this.padding);
        if (maxScroll <= 0) return;

        this._scrollY += deltaY * 1.5; // Sensitivity
        this._scrollY = Math.max(0, Math.min(maxScroll, this._scrollY));
        
        this._renderFrame(this._scrollY);
    }

    update(time, camera) {
        if (this.lookAtCamera && camera) {
            this.mesh.quaternion.copy(camera.quaternion);
        }
        // Removed auto-scroll logic in update() as requested
    }

    dispose() {
        if (this.material) this.material.dispose();
        if (this.geometry) this.geometry.dispose();
        if (this.texture)  this.texture.dispose();
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
}

// ---- helpers ----

function _parseInline(line) {
    const segs = [], re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0, m;
    while ((m = re.exec(line)) !== null) {
        if (m.index > last) segs.push({ text: line.slice(last, m.index), bold: false });
        segs.push(m[0].startsWith('**') ? { text: m[1], bold: true } : { text: m[2], bold: false });
        last = m.index + m[0].length;
    }
    if (last < line.length) segs.push({ text: line.slice(last), bold: false });
    return segs.length ? segs : [{ text: line, bold: false }];
}

function _strip(line) {
    return line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
}

function _measureWrappedLines(ctx, text, maxWidth, baseFontSize) {
    const tokens = [];
    for (const seg of _parseInline(text)) {
        for (const w of seg.text.split(/(\s+)/)) {
            if (w) tokens.push({ word: w, bold: seg.bold });
        }
    }

    const baseFont = ctx.font;
    const boldFont = baseFont.replace(/^\d+\s/, '600 ');

    let count = 1, bw = 0;
    for (const tok of tokens) {
        ctx.font = tok.bold ? boldFont : baseFont;
        const tw = ctx.measureText(tok.word).width;
        if (bw + tw > maxWidth && bw > 0) {
            count++;
            bw = tw;
        } else {
            bw += tw;
        }
    }
    ctx.font = baseFont; // Reset
    return count;
}

/** Returns column widths for n columns within a canvas of given width/padding. */
function _colWidths(n, canvasW, padding) {
    const avail = canvasW - padding * 1.5;
    // Tuned proportions for 3-col project table; equal split otherwise
    if (n === 3) return [avail * 0.14, avail * 0.44, avail * 0.42];
    return Array(n).fill(avail / n);
}
