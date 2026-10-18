# Services Website

AI Content Services portfolio page for Bob Renze.

Live at: https://services.bobrenze.com

## Navigation regression tests

With Node.js 18 or newer, run `node --test tests/mobile-navigation.test.cjs`.
These offline tests execute the page's navigation handlers against a synthetic
DOM. They check menu state, section selection, Escape/focus behavior, and
breakpoint resets. Browser rendering and assistive-technology behavior still
need manual verification.
