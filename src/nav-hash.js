/** Scene sections that can be opened with a URL fragment on the home page. */
export const SCENE_SECTIONS = ['home', 'projects', 'skills', 'experience', 'contact'];

/**
 * @param {string} hash location.hash, with or without the leading '#'
 * @returns {string|null} a scene section, or null when the fragment is empty or unknown
 */
export function sectionFromHash(hash) {
    const raw = String(hash ?? '').replace(/^#/, '').trim().toLowerCase();
    return SCENE_SECTIONS.includes(raw) ? raw : null;
}
