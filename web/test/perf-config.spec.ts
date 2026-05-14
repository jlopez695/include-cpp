import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Performance configuration', () => {
  describe('API fetch revalidation', () => {
    let apiSource: string;

    before(() => {
      apiSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'lib', 'api.ts'),
        'utf8',
      );
    });

    it('fetchProblems uses revalidate >= 3600', () => {
      // Extract revalidate value from fetchProblems function
      const match = apiSource.match(/fetchProblems[\s\S]*?revalidate:\s*(\d+)/);
      assert.ok(match, 'fetchProblems should have a revalidate option');
      const value = Number(match[1]);
      assert.ok(value >= 3600,
        `fetchProblems revalidate should be >= 3600 (got ${value})`);
    });

    it('fetchProblem uses revalidate >= 3600', () => {
      // Extract revalidate value from fetchProblem (singular) function
      const match = apiSource.match(/fetchProblem\([\s\S]*?revalidate:\s*(\d+)/);
      assert.ok(match, 'fetchProblem should have a revalidate option');
      const value = Number(match[1]);
      assert.ok(value >= 3600,
        `fetchProblem revalidate should be >= 3600 (got ${value})`);
    });

    it('fetchHealth uses a shorter revalidation than problems', () => {
      const match = apiSource.match(/fetchHealth[\s\S]*?revalidate:\s*(\d+)/);
      assert.ok(match, 'fetchHealth should have a revalidate option');
      const healthRevalidate = Number(match[1]);
      assert.ok(healthRevalidate < 3600,
        `fetchHealth revalidate should be < 3600 (got ${healthRevalidate})`);
    });
  });

  describe('loading.tsx exists for instant navigation', () => {
    it('loading.tsx exists in /app/problems/[id]/', () => {
      const loadingPath = path.join(
        import.meta.dirname, '..', 'app', 'problems', '[id]', 'loading.tsx',
      );
      assert.ok(fs.existsSync(loadingPath),
        'loading.tsx should exist for instant navigation feedback');
    });

    it('loading.tsx exports a default function', () => {
      const loadingPath = path.join(
        import.meta.dirname, '..', 'app', 'problems', '[id]', 'loading.tsx',
      );
      const source = fs.readFileSync(loadingPath, 'utf8');
      assert.ok(source.includes('export default function'),
        'loading.tsx should export a default function');
    });
  });

  describe('next/font is configured for self-hosted fonts', () => {
    let layoutSource: string;

    before(() => {
      layoutSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'app', 'layout.tsx'),
        'utf8',
      );
    });

    it('imports Inter from next/font/google', () => {
      assert.ok(layoutSource.includes("from 'next/font/google'"),
        'layout should import from next/font/google');
      assert.ok(layoutSource.includes('Inter'),
        'layout should import Inter font');
    });

    it('imports JetBrains_Mono from next/font/google', () => {
      assert.ok(layoutSource.includes('JetBrains_Mono'),
        'layout should import JetBrains_Mono font');
    });

    it('applies font CSS variables to html element', () => {
      assert.ok(layoutSource.includes('inter.variable'),
        'html should include inter CSS variable');
      assert.ok(layoutSource.includes('jetbrains.variable'),
        'html should include jetbrains CSS variable');
    });
  });

  describe('TopBar uses Link for prefetching', () => {
    let topBarSource: string;

    before(() => {
      topBarSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'components', 'TopBar.tsx'),
        'utf8',
      );
    });

    it('imports Link from next/link', () => {
      assert.ok(topBarSource.includes("from 'next/link'"),
        'TopBar should import Link from next/link');
    });

    it('does not use router.push for navigation', () => {
      assert.ok(!topBarSource.includes('router.push'),
        'TopBar should not use router.push — use <Link> for prefetching');
    });

    it('uses prefetch on Link components', () => {
      assert.ok(topBarSource.includes('prefetch'),
        'TopBar Link components should enable prefetch');
    });
  });

  describe('EditorPanel uses dynamic import for Monaco', () => {
    let editorSource: string;

    before(() => {
      editorSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'components', 'EditorPanel.tsx'),
        'utf8',
      );
    });

    it('uses next/dynamic instead of static import', () => {
      assert.ok(editorSource.includes("from 'next/dynamic'"),
        'EditorPanel should import from next/dynamic');
    });

    it('does not have a static Editor import from @monaco-editor/react', () => {
      // It should use dynamic() not a direct import
      const staticImport = /^import\s+Editor\s.*from\s+'@monaco-editor\/react'/m;
      assert.ok(!staticImport.test(editorSource),
        'EditorPanel should NOT have a static default import of Editor from @monaco-editor/react');
    });

    it('configures ssr: false for Monaco', () => {
      assert.ok(editorSource.includes('ssr: false'),
        'Monaco dynamic import should have ssr: false');
    });
  });

  describe('Markdown pre-rendered server-side', () => {
    let descSource: string;
    let serverSource: string;

    before(() => {
      descSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'components', 'ProblemDescription.tsx'),
        'utf8',
      );
      serverSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'lib', 'markdown-server.ts'),
        'utf8',
      );
    });

    it('client component does not import react-markdown', () => {
      assert.ok(!/from\s+['"]react-markdown['"]/.test(descSource),
        'ProblemDescription must not pull react-markdown into the client bundle');
    });

    it('client component does not import remark/rehype/highlight.js', () => {
      const banned = ['remark-gfm', 'rehype-highlight', 'highlight.js/lib/languages'];
      for (const dep of banned) {
        assert.ok(!descSource.includes(dep),
          `ProblemDescription must not import ${dep} (now server-side only)`);
      }
    });

    it('server-side renderer is marked server-only', () => {
      assert.ok(/['"]server-only['"]/.test(serverSource),
        'markdown-server.ts should import "server-only" to prevent client bundling');
    });

    it('server-side renderer restricts highlight.js to cpp + makefile', () => {
      assert.ok(serverSource.includes('highlight.js/lib/languages/cpp'),
        'should import cpp grammar specifically');
      assert.ok(serverSource.includes('highlight.js/lib/languages/makefile'),
        'should import makefile grammar specifically');
      assert.ok(/languages:\s*\{\s*cpp\s*,\s*makefile\s*\}/.test(serverSource),
        'rehypeHighlight should be configured with only cpp + makefile');
    });
  });

  describe('Lazy-loaded modal components', () => {
    let workspaceSource: string;

    before(() => {
      workspaceSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'app', 'problems', '[id]', 'ProblemWorkspace.tsx'),
        'utf8',
      );
    });

    it('uses React.lazy for Confetti', () => {
      assert.ok(workspaceSource.includes("lazy(() => import('@/components/Confetti')"),
        'Confetti should be lazy-loaded');
    });

    it('uses React.lazy for KeyboardShortcuts', () => {
      assert.ok(workspaceSource.includes("lazy(() => import('@/components/KeyboardShortcuts')"),
        'KeyboardShortcuts should be lazy-loaded');
    });

    it('wraps lazy components in Suspense', () => {
      assert.ok(workspaceSource.includes('<Suspense'),
        'Lazy components should be wrapped in Suspense');
    });
  });

  describe('HealthBanner accepts warnings as props', () => {
    let bannerSource: string;

    before(() => {
      bannerSource = fs.readFileSync(
        path.join(import.meta.dirname, '..', 'components', 'HealthBanner.tsx'),
        'utf8',
      );
    });

    it('does not fetch health data client-side', () => {
      assert.ok(!bannerSource.includes('useEffect'),
        'HealthBanner should not use useEffect for fetching');
      assert.ok(!bannerSource.includes("fetch("),
        'HealthBanner should not call fetch()');
    });

    it('accepts warnings as a prop', () => {
      assert.ok(bannerSource.includes('warnings'),
        'HealthBanner should accept warnings prop');
      assert.ok(bannerSource.includes('HealthBannerProps'),
        'HealthBanner should have a typed props interface');
    });
  });
});
