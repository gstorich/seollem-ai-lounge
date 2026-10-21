// Format generated Korean chat while preserving numbers, links and quoted periods.
// Only new AI replies pass through here; stored/customer messages are untouched.
module.exports = function chatPunctuation(text) {
  const protectedText = /(https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|`[^`\n]*`)/gi;
  const formatted = text.split(protectedText).map((part, i) => i % 2 ? part :
    part.replace(/([가-힣ㄱ-ㅎㅏ-ㅣ])\.(?!\.)(?=\s|$)/g, '$1')
  ).join('');
  const protectedLinks = /(https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|`[^`\n]*`)/gi;
  return formatted.split(protectedLinks).map((part, i) => i % 2 ? part :
    part.replace(/,/g, (comma, index) =>
      /\d/.test(part[index - 1] || '') && /\d/.test(part[index + 1] || '') ? comma : '')
  ).join('');
};
