import type { FormatDescriptor } from './types'

function looksLikeShell(text: string): boolean {
  const first = text.trimStart().split('\n', 1)[0] ?? ''
  return /^#!\s*\/\S*\b(sh|bash|zsh|dash|ksh)\b/.test(first) || /^#!\s*\/usr\/bin\/env\s+(sh|bash|zsh|dash|ksh)\b/.test(first)
}

export const shell: FormatDescriptor = {
  id: 'shell',
  mimes: ['application/x-sh', 'application/x-shellscript', 'text/x-sh', 'text/x-shellscript'],
  extensions: ['.sh', '.bash', '.zsh'],
  filenames: ['.bashrc', '.bash_profile', '.zshrc', '.profile'],
  sniff: looksLikeShell,
  sniffDefault: true,
  view: 'static',
}
