import cvData from './cv-data.json';

const p2 = cvData.plain2 || {};

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderBullets(items) {
    if (!items?.length) return '';
    return `<ul class="p2-bullets">${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function linkedinHref() {
    const raw = cvData.contact.linkedin || '';
    if (raw.startsWith('http')) return raw;
    return `https://${raw.replace(/^\/+/, '')}`;
}

/** Turn paragraph descriptions into short bullets for page 2. */
function descriptionToBullets(text) {
    if (!text) return [];
    return text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);
}

function experienceBullets(exp) {
    if (exp.bullets?.length) return exp.bullets;
    const fromDesc = descriptionToBullets(exp.description);
    if (fromDesc.length) return fromDesc;
    return (exp.tags || []).map((t) => t);
}

function buildTimelineRows() {
    return (cvData.experience || [])
        .map((exp) => {
            const note = (exp.tags || []).slice(0, 3).join(' · ');
            return `
        <tr>
            <td class="col-when">${escapeHtml(exp.period)}</td>
            <td class="col-what">${escapeHtml(exp.title)} · ${escapeHtml(exp.company)}</td>
            <td class="col-note">${escapeHtml(note)}</td>
        </tr>`;
        })
        .join('');
}

function buildSkillGroups() {
    const groups = p2.skillGroups || [];
    return groups
        .map(
            (g) => `
        <div class="p2-skill-group">
            <h3>${escapeHtml(g.label)}</h3>
            <ul>${(g.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>`
        )
        .join('');
}

function buildInterests() {
    const items = p2.interests || [];
    if (!items.length) return '';
    return `
        <h2 class="p2-section-title">Interests (lighter experience)</h2>
        <div class="p2-interests">
            <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
        </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('cv-container');
    const contact = cvData.contact || {};

    const contactParts = [];
    if (contact.location) contactParts.push(escapeHtml(contact.location));
    if (contact.linkedin) {
        contactParts.push(
            `<a href="${linkedinHref()}">${escapeHtml(contact.linkedin.replace(/^https?:\/\//, ''))}</a>`
        );
    }
    contactParts.push('<a href="https://code-minion.github.io">code-minion.github.io</a>');

    const langLine = (cvData.languages || [])
        .map((l) => `${l.language} (${l.level})`)
        .join(' · ');

    const eduLine = (cvData.education || [])
        .map((e) => `${e.degree} — ${e.institution} (${e.year})`)
        .join(' · ');

    const certLine = (p2.certifications || []).join(' · ');
    const openLine = (p2.openTo || cvData.targetRoles?.slice(0, 4) || []).join(' · ');

    const pageOne = `
        <section class="p2-page-one">
            <header class="p2-header">
                <div>
                    <h1>${escapeHtml(contact.name)}</h1>
                    <p class="p2-role">${escapeHtml(contact.role || '')}</p>
                    <p class="p2-contact">${contactParts.join(' · ')}</p>
                </div>
            </header>

            <p class="p2-summary">${escapeHtml(cvData.summary)}</p>

            <h2 class="p2-section-title">Core skills</h2>
            <div class="p2-skills-grid">${buildSkillGroups()}</div>

            ${buildInterests()}

            <h2 class="p2-section-title">Career timeline</h2>
            <table class="p2-timeline"><tbody>${buildTimelineRows()}</tbody></table>

            <div class="p2-footer-lines">
                <p><strong>Education:</strong> ${escapeHtml(eduLine)}</p>
                ${certLine ? `<p><strong>Certifications:</strong> ${escapeHtml(certLine)}</p>` : ''}
                <p><strong>Languages:</strong> ${escapeHtml(langLine)}</p>
                <p><strong>Open to:</strong> ${escapeHtml(openLine)}</p>
            </div>
        </section>
    `;

    const experienceHtml = (cvData.experience || [])
        .map((exp) => {
            const bullets = experienceBullets(exp);
            return `
        <article class="p2-entry">
            <div class="p2-entry-header">
                <h3>${escapeHtml(exp.title)}</h3>
                <span class="p2-entry-date">${escapeHtml(exp.period)}</span>
            </div>
            <div class="p2-entry-company">${escapeHtml(exp.company)}</div>
            ${renderBullets(bullets)}
        </article>`;
        })
        .join('');

    const projectsHtml = (cvData.projects || [])
        .filter((p) => p.featured !== false)
        .map((p) => {
            const bullets = p.bullets?.length
                ? p.bullets
                : [p.summary || p.description].filter(Boolean);
            return `
        <article class="p2-proj-entry">
            <h3>${escapeHtml(p.title)}</h3>
            <span class="p2-proj-year">${escapeHtml(String(p.year))}</span>
            ${renderBullets(bullets)}
            ${
                p.tags?.length
                    ? `<div class="p2-inline-tags">${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>`
                    : ''
            }
        </article>`;
        })
        .join('');

    container.innerHTML = `
        ${pageOne}
        <div class="page-break"></div>
        <section class="p2-detail">
            <h2>Experience (detail)</h2>
            ${experienceHtml}
            <h2 style="margin-top: 20px;">Selected projects</h2>
            ${projectsHtml}
        </section>
    `;
});
