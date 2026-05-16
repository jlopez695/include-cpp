import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

describe('Editor-native redesign — regression', () => {
  describe('Shared Modal wrapper still preserved', () => {
    let modalSrc: string;
    before(() => { modalSrc = read('components/Modal.tsx'); });

    it('Modal traps focus on Tab and Shift+Tab', () => {
      assert.match(modalSrc, /'Tab'/);
      assert.match(modalSrc, /e\.shiftKey/);
    });

    it('Modal closes on Escape and returns focus to opener', () => {
      assert.match(modalSrc, /e\.key === 'Escape'/);
      assert.match(modalSrc, /previouslyFocused\.current\?\.focus\?\.\(\)/);
    });

    it('Modal sets dialog ARIA attributes', () => {
      assert.match(modalSrc, /role="dialog"/);
      assert.match(modalSrc, /aria-modal="true"/);
    });

    it('Both modal callers go through the shared component', () => {
      const ks = read('components/KeyboardShortcuts.tsx');
      const pd = read('components/ProgressDashboard.tsx');
      assert.match(ks, /<Modal\b/);
      assert.match(pd, /<Modal\b/);
      assert.doesNotMatch(ks, /fixed inset-0/);
      assert.doesNotMatch(pd, /fixed inset-0/);
    });
  });

  describe('Skip link still wired', () => {
    it('ProblemWorkspace renders skip link to #editor-panel', () => {
      const src = read('app/problems/[id]/ProblemWorkspace.tsx');
      assert.match(src, /skip-link/);
      assert.match(src, /href="#editor-panel"/);
    });

    it('EditorPanel target is focusable', () => {
      const src = read('components/EditorPanel.tsx');
      assert.match(src, /id="editor-panel"/);
      assert.match(src, /tabIndex=\{-1\}/);
    });

    it('globals.css defines .skip-link visually-hidden-until-focused', () => {
      const css = read('app/globals.css');
      assert.match(css, /\.skip-link\s*\{/);
      assert.match(css, /\.skip-link:focus-visible/);
    });
  });

  describe('Editor overflow menu kbd nav', () => {
    let menuSrc: string;
    before(() => { menuSrc = read('components/EditorOverflowMenu.tsx'); });

    it('Arrow nav + Escape close + return focus', () => {
      assert.match(menuSrc, /ArrowDown/);
      assert.match(menuSrc, /ArrowUp/);
      assert.match(menuSrc, /'Escape'/);
      assert.match(menuSrc, /triggerRef\.current\?\.focus\(\)/);
    });

    it('uses menu / menuitemcheckbox ARIA roles', () => {
      assert.match(menuSrc, /role="menu"/);
      assert.match(menuSrc, /role="menuitemcheckbox"/);
    });
  });

  describe('Color palette pruned (chrome uses 2 semantic colors)', () => {
    it('Removed semantic tokens (pass / info / purple / orange) are not defined in @theme block', () => {
      const css = read('app/globals.css');
      const themeBlock = css.match(/@theme\s*\{[\s\S]*?\n\}/);
      assert.ok(themeBlock);
      assert.doesNotMatch(themeBlock![0], /--color-pass:/);
      assert.doesNotMatch(themeBlock![0], /--color-info:/);
      assert.doesNotMatch(themeBlock![0], /--color-purple:/);
      assert.doesNotMatch(themeBlock![0], /--color-orange:/);
    });

    it('Components do not reference dropped color classes', () => {
      const componentsDir = path.join(root, 'components');
      const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
      for (const f of files) {
        const src = fs.readFileSync(path.join(componentsDir, f), 'utf8');
        for (const cls of ['text-purple', 'text-pass', 'text-info', 'text-orange',
                           'bg-purple', 'bg-info', 'bg-orange']) {
          assert.doesNotMatch(src, new RegExp(cls), `${f} still uses ${cls}`);
        }
      }
    });
  });

  describe('Animation cull', () => {
    it('Decorative animations are removed from globals.css', () => {
      const css = read('app/globals.css');
      assert.doesNotMatch(css, /@keyframes pop-in/);
      assert.doesNotMatch(css, /@keyframes shimmer/);
      assert.doesNotMatch(css, /@keyframes pulse-soft/);
      assert.doesNotMatch(css, /@keyframes slide-up/);
      assert.doesNotMatch(css, /@keyframes slide-in-left/);
    });

    it('Components do not reference dropped animation classes', () => {
      const dirs = ['components', 'app', 'app/problems', 'app/problems/[id]'];
      for (const dir of dirs) {
        const full = path.join(root, dir);
        if (!fs.existsSync(full)) continue;
        const files = fs.readdirSync(full).filter(f => f.endsWith('.tsx'));
        for (const f of files) {
          const src = fs.readFileSync(path.join(full, f), 'utf8');
          for (const cls of ['animate-pop-in', 'animate-shimmer', 'animate-pulse-soft',
                             'animate-slide-in', 'animate-slide-up']) {
            assert.doesNotMatch(src, new RegExp(cls), `${dir}/${f} still uses ${cls}`);
          }
        }
      }
    });
  });

  describe('Confetti deleted', () => {
    it('Confetti.tsx no longer exists', () => {
      assert.equal(exists('components/Confetti.tsx'), false);
    });

    it('ProblemWorkspace does not import or render Confetti', () => {
      const src = read('app/problems/[id]/ProblemWorkspace.tsx');
      assert.doesNotMatch(src, /Confetti/);
    });

    it('useProblemEditor no longer exposes confetti state', () => {
      const src = read('hooks/useProblemEditor.ts');
      assert.doesNotMatch(src, /showConfetti/);
      assert.doesNotMatch(src, /dismissConfetti/);
    });
  });

  describe('Type scale (5-step hierarchy with display moments)', () => {
    it('globals.css defines the full xs → xl scale used by the redesign', () => {
      const css = read('app/globals.css');
      // Body / chrome scale
      assert.match(css, /--text-xs:\s*11px/);
      assert.match(css, /--text-sm:\s*12px/);
      assert.match(css, /--text-base:\s*13px/);
      assert.match(css, /--text-md:\s*15px/);
      // Display moments — TopBar title (lg) + hero stat (xl)
      assert.match(css, /--text-lg:\s*20px/);
      assert.match(css, /--text-xl:\s*28px/);
    });
  });

  describe('Font weights', () => {
    it('layout.tsx loads 400 + 500 + 600 weights (600 for display moments)', () => {
      const src = read('app/layout.tsx');
      const interBlock = src.match(/Inter\(\{[\s\S]*?\}\)/);
      assert.ok(interBlock);
      assert.match(interBlock![0], /weight:\s*\['400',\s*'500',\s*'600'\]/);
    });
  });

  describe('Elevation utilities (light-from-sky cues)', () => {
    it('globals.css defines .elevation-1, .elevation-button, .elevation-modal', () => {
      const css = read('app/globals.css');
      assert.match(css, /\.elevation-1\s*\{/);
      assert.match(css, /\.elevation-button\s*\{/);
      assert.match(css, /\.elevation-modal\s*\{/);
    });

    it('elevation utilities have light-mode overrides (html.light variants)', () => {
      const css = read('app/globals.css');
      assert.match(css, /html\.light\s+\.elevation-1\s*\{/);
      assert.match(css, /html\.light\s+\.elevation-button\s*\{/);
      assert.match(css, /html\.light\s+\.elevation-modal\s*\{/);
    });

    it('Modal uses .elevation-modal instead of shadow-2xl', () => {
      const src = read('components/Modal.tsx');
      assert.match(src, /elevation-modal/);
      assert.doesNotMatch(src, /shadow-2xl/);
    });
  });

  describe('TopBar reduced to navigation + identity + dot', () => {
    let topbarSrc: string;
    before(() => { topbarSrc = read('components/TopBar.tsx'); });

    it('does not render a progress pill, StatusBadge, or build-type chip', () => {
      assert.doesNotMatch(topbarSrc, /Overall progress/);
      assert.doesNotMatch(topbarSrc, /StatusBadge/);
      assert.doesNotMatch(topbarSrc, /buildType/);
    });

    it('does not re-introduce the problemIds prop', () => {
      assert.doesNotMatch(topbarSrc, /problemIds/);
    });

    it('renders a shared StatusDot (one visual vocabulary, used in two places)', () => {
      assert.match(topbarSrc, /from '\.\/StatusDot'/);
      assert.match(topbarSrc, /<StatusDot\b/);
    });
  });

  describe('Shared StatusDot component', () => {
    let dotSrc: string;
    before(() => { dotSrc = read('components/StatusDot.tsx'); });

    it('exports a StatusDot used by both Sidebar and TopBar', () => {
      assert.match(dotSrc, /export function StatusDot/);
      assert.match(read('components/Sidebar.tsx'), /from '\.\/StatusDot'/);
      assert.match(read('components/TopBar.tsx'), /from '\.\/StatusDot'/);
    });

    it('default size is 8px (w-2 h-2) — readable at scan distance', () => {
      assert.match(dotSrc, /size = 'w-2 h-2'/);
    });
  });

  describe('Sidebar simplified', () => {
    let sidebarSrc: string;
    before(() => { sidebarSrc = read('components/Sidebar.tsx'); });

    it('does not render the gradient brand block', () => {
      assert.doesNotMatch(sidebarSrc, /from-accent via-purple to-accent/);
      assert.doesNotMatch(sidebarSrc, /shadow-accent\/20/);
    });

    it('does not render the multi-tab status filter row', () => {
      assert.doesNotMatch(sidebarSrc, /FILTERS/);
      assert.doesNotMatch(sidebarSrc, /'Todo'/);
      assert.doesNotMatch(sidebarSrc, /'WIP'/);
    });

    it('active row uses an accent-tinted background (not gray-on-gray)', () => {
      // Locks in the course-correction: a future flat-pass cannot silently
      // re-revert the active state to bg-bg-3 without tripping this.
      assert.match(sidebarSrc, /bg-accent\/\[0\.(0[5-9]|10)\]/);
    });

    it('active row rail uses an inset box-shadow so it lives inside the rounded card', () => {
      // The rail must not be a left border (which would sit outside the
      // rounded corners and re-create the "no man's land" bug).
      assert.match(sidebarSrc, /inset 2px 0 0 var\(--color-accent\)/);
      assert.doesNotMatch(sidebarSrc, /border-l-accent/);
    });

    it('rows are contained cards (mx-2 + rounded-md), not edge-to-edge bars', () => {
      assert.match(sidebarSrc, /mx-2/);
      assert.match(sidebarSrc, /rounded-md/);
    });

    it('brand mark is the vertical accent bar + display-weight "CS 225" wordmark', () => {
      // New brand identity: a 1×5 accent bar acts as the logo, with "CS 225"
      // rendered at display weight (font-semibold) and 18px.
      assert.match(sidebarSrc, /w-1 h-5 bg-accent/);
      assert.match(sidebarSrc, /text-\[18px\] font-semibold/);
      assert.match(sidebarSrc, /CS 225/);
    });

    it('search renders as a real input shell (border + bg), not bare text', () => {
      // Bug B3 fix: search must read as something you can type in.
      assert.match(sidebarSrc, /bg-bg-2 border border-border-soft\/60 rounded-md/);
      assert.match(sidebarSrc, /focus-within:border-accent\/50/);
    });

    it('star is always visible (no opacity-0 until hover)', () => {
      // Bug B1 fix: the unstarred state must be visible at rest so the
      // bookmark column reads as a column.
      assert.doesNotMatch(sidebarSrc, /opacity-0[^"]*group-hover:opacity-100/);
      assert.match(sidebarSrc, /text-text-mute\/50 group-hover:text-text-base/);
    });
  });

  describe('Run button is the visual primary action', () => {
    it('Run uses filled accent fill, not the outlined ghost variant', () => {
      const src = read('components/EditorPanel.tsx');
      const idx = src.indexOf('aria-label="Run program');
      assert.notEqual(idx, -1, 'expected to find the Run button');
      // Inspect the className on the same button — search backwards from the
      // aria-label to the start of the <button tag.
      const buttonStart = src.lastIndexOf('<button', idx);
      const block = src.slice(buttonStart, idx + 50);
      assert.match(block, /bg-accent/);
      assert.match(block, /text-bg-0/);
      assert.doesNotMatch(block, /border-accent\/40/);
    });
  });

  describe('Prose h2 is no longer an eyebrow tag', () => {
    it('prose-potd h2 is not uppercase + tracked', () => {
      const css = read('app/globals.css');
      const h2 = css.match(/\.prose-potd h2\s*\{[\s\S]*?\}/);
      assert.ok(h2);
      assert.doesNotMatch(h2![0], /text-transform:\s*uppercase/);
      assert.doesNotMatch(h2![0], /letter-spacing:\s*[01]\.[0-9]+px/);
    });
  });

  describe('Light-mode mute text still passes WCAG AA', () => {
    it('--color-text-mute is darkened for AA on light bg', () => {
      const css = read('app/globals.css');
      const lightBlock = css.match(/html\.light\s*\{[\s\S]*?\}/);
      assert.ok(lightBlock);
      assert.match(lightBlock![0], /--color-text-mute:\s*#6b7280/);
    });
  });
});
