const adjectives = ['swift', 'silent', 'bold', 'neon', 'cosmic', 'hyper', 'quantum', 'stellar', 'lunar', 'solar'];
const nouns = ['ocean', 'tiger', 'eagle', 'rocket', 'pulse', 'wave', 'spark', 'flare', 'echo', 'nexus'];

export const generateRoomCode = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10 to 99
  return `${adj}-${noun}-${num}`;
};
