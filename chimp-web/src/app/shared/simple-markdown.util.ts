export function renderSimpleMarkdown(content: string): string {
  let html = content;
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, language, code) => {
    const escaped = escapeHtml(code.trim());
    const languageClass = language ? ` class="language-${language}"` : '';
    return `<pre><code${languageClass}>${escaped}</code></pre>`;
  });

  html = html.replace(/^### (.*$)/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*$)/gm, '<h2>$1</h2>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const isExternal = url.startsWith('http') && !url.includes('compliancechimp.com');
    if (isExternal) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    return `<a href="${url}">${text}</a>`;
  });

  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/^\d+\. (.*)$/gm, '<li>$1</li>');

  const lines = html.split('\n');
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('<h') &&
      !trimmed.startsWith('<ul') &&
      !trimmed.startsWith('<li') &&
      !trimmed.startsWith('<hr') &&
      !trimmed.startsWith('<pre') &&
      !trimmed.startsWith('</pre')
    ) {
      return `<p>${trimmed}</p>`;
    }
    return line;
  });

  html = processedLines.join('\n');
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

function escapeHtml(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
