import cvData from './cv-data-sig.json';
import QRCode from 'qrcode';
import GUI from 'lil-gui';

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('cv-container');

    // Default Settings
    const defaultSettings = {
        qrSize: 80,
        qrMarginLeft: 20,
        qrMarginTop: 0,
        qrOpacity: 1,
        showLabel: true,
        label: 'Portfolio'
    };

    // Load from localStorage
    const savedSettings = JSON.parse(localStorage.getItem('cv-qr-settings') || '{}');
    const settings = { ...defaultSettings, ...savedSettings };

    // Function to generate and update QR
    async function updateQR() {
        const qrWrapper = document.getElementById('qr-wrapper');
        if (!qrWrapper) return;

        try {
            const qrDataUrl = await QRCode.toDataURL('https://code-minion.github.io', { 
                width: settings.qrSize * 2, // Generate at 2x for high DPI
                margin: 0 
            });
            
            qrWrapper.innerHTML = `
                <div style="text-align: center; margin-left: ${settings.qrMarginLeft}px; margin-top: ${settings.qrMarginTop}px; opacity: ${settings.qrOpacity};">
                    <img src="${qrDataUrl}" alt="QR Code" width="${settings.qrSize}" height="${settings.qrSize}" />
                    ${settings.showLabel ? `<div style="font-size: 10px; color: #666; margin-top: 4px;">${settings.label}</div>` : ''}
                </div>
            `;
        } catch (err) {
            console.error('Error generating QR code', err);
        }
    }

    // Build Header
    let contactLinks = [];
    if (cvData.contact.location) contactLinks.push(`<span>${cvData.contact.location}</span>`);
    if (cvData.contact.linkedin) contactLinks.push(`<span>linkedin.com/in/codeminion</span>`);

    // Skills
    const skillsHtml = cvData.skills.map(s => {
        return `<div class="skill-item">
            <span class="skill-name">${s.name}</span>
            <span class="skill-prof">${s.proficiency}</span>
        </div>`;
    }).join('');

    // Experience
    const expHtml = cvData.experience.map(e => {
        return `
        <div class="entry">
            <div class="entry-header">
                <h3>${e.title}</h3>
                <span class="entry-date">${e.period}</span>
            </div>
            <div class="entry-subtitle">${e.company}</div>
            <div class="entry-desc">${e.description}</div>
            <div class="tags">
                ${e.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Projects
    const projHtml = cvData.projects.map(p => {
        return `
        <div class="entry">
            <div class="entry-header">
                <h3>${p.title}</h3>
                <span class="entry-date">${p.year}</span>
            </div>
            <div class="entry-desc">${p.description}</div>
            <div class="tags">
                ${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Education & Others
    const langHtml = (cvData.languages || []).map(l => typeof l === 'string' ? l : `${l.language} (${l.level})`).join(', ');
    const patentHtml = (cvData.patents || []).map(p => {
        return `<li><strong>${p.title}</strong> (${p.status}, ${p.year}) - ${p.description}</li>`;
    }).join('');

    // Compile entire HTML
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <h1>${cvData.contact.name}</h1>
                <div class="header-contact">
                    ${contactLinks.join(' <span style="color:#ccc;">|</span> ')}
                </div>
            </div>
            <div id="qr-wrapper"></div>
        </div>
        
        <div class="summary">
            ${cvData.summary}
        </div>

        <h2>Experience</h2>
        ${expHtml}

        <h2>Skills and Technologies</h2>
        <div class="skills-grid">
            ${skillsHtml}
        </div>

        <div class="page-break"></div>

        <h2>Projects</h2>
        ${projHtml}

        <h2>Education</h2>
        ${cvData.education.map(ed => `
        <div class="entry">
            <div class="entry-header">
                <h3>${ed.degree}</h3>
                <span class="entry-date">${ed.year}</span>
            </div>
            <div class="entry-subtitle">${ed.institution}</div>
        </div>`).join('')}

        ${patentHtml ? `<h2>Patents & Publications</h2>
        <ul style="color: var(--text-secondary); font-size: 14px;">
            ${patentHtml}
        </ul>` : ''}

        ${langHtml ? `<h2>Languages</h2>
        <p style="color: var(--text-secondary);">${langHtml}</p>` : ''}
    `;

    // Initialize QR
    updateQR();

    // Setup GUI
    const gui = new GUI({ title: 'QR Code Settings', container: document.body });
    gui.domElement.classList.add('no-print');
    
    const saveSettings = () => localStorage.setItem('cv-qr-settings', JSON.stringify(settings));

    gui.add(settings, 'qrSize', 40, 200, 1).name('Size (px)').onChange(() => { updateQR(); saveSettings(); });
    gui.add(settings, 'qrMarginLeft', -100, 200, 1).name('Margin Left').onChange(() => { updateQR(); saveSettings(); });
    gui.add(settings, 'qrMarginTop', -50, 100, 1).name('Margin Top').onChange(() => { updateQR(); saveSettings(); });
    gui.add(settings, 'qrOpacity', 0, 1, 0.01).name('Opacity').onChange(() => { updateQR(); saveSettings(); });
    gui.add(settings, 'showLabel').name('Show Label').onChange(() => { updateQR(); saveSettings(); });
    gui.add(settings, 'label').name('Label Text').onFinishChange(() => { updateQR(); saveSettings(); });
    
    gui.add({ reset: () => {
        Object.assign(settings, defaultSettings);
        saveSettings();
        updateQR();
        gui.controllers.forEach(c => c.updateDisplay());
    }}, 'reset').name('Reset to Defaults');

    // Position GUI
    gui.domElement.style.position = 'fixed';
    gui.domElement.style.top = '80px';
    gui.domElement.style.right = '20px';
    gui.domElement.style.zIndex = '1000';
});
