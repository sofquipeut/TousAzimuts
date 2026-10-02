// Reconnaît [texte](https://...) et les URLs brutes dans le texte d'un
// commentaire, sans jamais rendre de HTML arbitraire : on ne construit
// que des noeuds texte et des liens <a>.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()"']+)/g;

export function renderCommentBody(container: HTMLElement, text: string) {
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const label = match[1];
    const url = match[2] || match[3];
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label || url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.appendChild(link);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
