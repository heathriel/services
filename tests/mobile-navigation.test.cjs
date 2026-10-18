// Offline unit tests: node --test tests/mobile-navigation.test.cjs
// Executes the page's actual handlers against a minimal synthetic DOM.
// This verifies event/state logic, not browser rendering or accessibility output.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const html = readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
function fixture() {
    const state = { focused: null, hash: '', desktop: false };
    function element(tag) {
        const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const classes = new Set((attributes.class || '').split(' '));
        const listeners = {};
        return {
            attributes, listeners,
            getAttribute: key => attributes[key],
            setAttribute: (key, value) => { attributes[key] = value; },
            classList: {
                contains: key => classes.has(key),
                toggle(key, force) {
                    const add = force === undefined ? !classes.has(key) : force;
                    if (add) classes.add(key); else classes.delete(key);
                    return add;
                },
            },
            addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
            dispatch(name, event = {}) { for (const callback of listeners[name] || []) callback(event); },
            focus() { state.focused = this; },
        };
    }
    const toggle = element(html.match(/<button\b[^>]*class="menu-toggle"[^>]*>/)[0]);
    const menu = element(html.match(/<ul\b[^>]*class="nav-links"[^>]*>/)[0]);
    const navHtml = html.match(/<ul\b[^>]*class="nav-links"[^>]*>([\s\S]*?)<\/ul>/)[1];
    const links = [...navHtml.matchAll(/<a\b[^>]*>/g)].map(m => element(m[0]));
    menu.querySelectorAll = selector => { assert.equal(selector, 'a'); return links; };
    const document = element('');
    document.querySelector = selector => {
        if (selector === '.menu-toggle') return toggle;
        if (selector === '.nav-links') return menu;
        throw new Error(`Unexpected selector: ${selector}`);
    };
    const breakpoint = element('');
    breakpoint.matches = true;
    const context = vm.createContext({ document, window: {
        matchMedia(query) { assert.equal(query, '(max-width: 768px)'); return breakpoint; },
    } });
    for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(script[1], context);
    return {
        state, toggle, menu, links, document,
        clickToggle() {
            if (toggle.attributes.onclick) vm.runInContext(toggle.attributes.onclick, context);
            toggle.dispatch('click');
        },
        select(link) { link.dispatch('click'); state.hash = link.attributes.href; },
        resize(desktop) { state.desktop = desktop; breakpoint.matches = !desktop; breakpoint.dispatch('change', { matches: !desktop }); },
    };
}

test('toggle has accessible name, control target, and synchronized repeated state', () => {
    const f = fixture();
    assert.equal(f.toggle.attributes['aria-label'], 'Toggle navigation');
    assert.ok(f.menu.attributes.id);
    assert.equal(f.toggle.attributes['aria-controls'], f.menu.attributes.id);
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    for (let i = 0; i < 4; i++) {
        f.clickToggle();
        assert.equal(f.menu.classList.contains('active'), i % 2 === 0);
        assert.equal(f.toggle.attributes['aria-expanded'], String(i % 2 === 0));
    }
});

test('each section selection closes the menu without cancelling the link', () => {
    const f = fixture();
    assert.equal(f.links.length, 5);
    for (const link of f.links) {
        f.clickToggle();
        assert.equal(f.menu.classList.contains('active'), true);
        f.select(link);
        assert.equal(f.menu.classList.contains('active'), false);
        assert.equal(f.toggle.attributes['aria-expanded'], 'false');
        assert.equal(f.state.hash, link.attributes.href);
    }
});

test('Escape closes an open menu and restores focus; closed Escape leaves focus alone', () => {
    const f = fixture();
    f.clickToggle();
    f.links[0].focus();
    f.document.dispatch('keydown', { key: 'Escape' });
    assert.equal(f.menu.classList.contains('active'), false);
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    assert.equal(f.state.focused, f.toggle);
    f.links[0].focus();
    f.document.dispatch('keydown', { key: 'Escape' });
    assert.equal(f.state.focused, f.links[0]);
    f.clickToggle();
    f.document.dispatch('keydown', { key: 'Tab' });
    assert.equal(f.menu.classList.contains('active'), true);
});

test('crossing desktop breakpoint resets mobile state without moving focus', () => {
    const f = fixture();
    f.clickToggle();
    f.links[0].focus();
    f.resize(true);
    assert.equal(f.menu.classList.contains('active'), false);
    assert.equal(f.toggle.attributes['aria-expanded'], 'false');
    assert.equal(f.state.focused, f.links[0]);
    f.resize(false);
    assert.equal(f.menu.classList.contains('active'), false);
    f.clickToggle();
    assert.equal(f.menu.classList.contains('active'), true);
});

test('desktop link selection does not move focus or cancel navigation', () => {
    const f = fixture();
    f.resize(true);
    f.links[0].focus();
    f.select(f.links[0]);
    assert.equal(f.state.focused, f.links[0]);
    assert.equal(f.state.hash, '#how-it-works');
    assert.equal(f.menu.classList.contains('active'), false);
});
