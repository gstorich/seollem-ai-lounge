// Format generated Korean chat without changing numbers, links or quotations.
// Only new AI replies pass through here; stored/customer messages are untouched.
module.exports = function chatPunctuation(text) {
  const protectedText = /(https?:\/\/[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|"[^"\n]*"|'[^'\n]*'|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|`[^`\n]*`)/gi;
  return text.split(protectedText).map((part, i) => i % 2 ? part :
    part.replace(/([가-힣ㄱ-ㅎㅏ-ㅣ])\.(?!\.)(?=\s|$)/g, '$1')
  ).join('');
};
