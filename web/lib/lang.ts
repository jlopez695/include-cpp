export function langForFile(name: string): string {
  if (/\.(c|h|cpp|hpp|cc|cxx)$/i.test(name)) return 'cpp';
  if (/\.md$/i.test(name)) return 'markdown';
  if (/\.json$/i.test(name)) return 'json';
  if (/Makefile/i.test(name)) return 'makefile';
  if (/CMakeLists/i.test(name) || /\.cmake$/i.test(name)) return 'cmake';
  return 'cpp';
}
