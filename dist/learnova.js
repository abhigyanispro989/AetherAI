const lessonForm = document.querySelector('#lesson-form');
const topicField = document.querySelector('#topic');
const output = document.querySelector('#lesson-output');
const welcome = document.querySelector('#welcome');
const history = [];
let pending = false;

function addTurn(role, text, level = '') {
  const node = document.createElement(role === 'user' ? 'div' : 'article');
  node.className = role === 'user' ? 'chat-user-message' : 'chat-answer';
  if (role === 'assistant') {
    const mark = document.createElement('span');
    mark.className = 'answer-mark';
    mark.textContent = 'L';
    const content = document.createElement('div');
    content.className = 'answer-content';
    const label = document.createElement('div');
    label.className = 'answer-label';
    label.textContent = `LEARNOVA · ${level.toUpperCase()}`;
    content.append(label);
    text.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
      const p = document.createElement('p');
      p.textContent = paragraph;
      content.append(p);
    });
    node.append(mark, content);
  } else node.textContent = text;
  output.append(node);
  output.hidden = false;
  welcome.hidden = true;
  output.scrollTop = output.scrollHeight;
}

async function askLearnova(question, level) {
  if (!question || pending) return;
  pending = true;
  lessonForm.querySelector('button[type="submit"]').disabled = true;
  addTurn('user', question);
  if (history.length > 14) history.splice(0, 2);
  history.push({ role: 'user', content: question });
  const thinking = document.createElement('article');
  thinking.className = 'chat-answer';
  thinking.textContent = 'Learnova is thinking…';
  thinking.setAttribute('aria-live', 'polite');
  output.append(thinking);
  let assistantNode = null;
  let assistantParagraph = null;
  let answerText = '';
  const showAssistant = () => {
    if (assistantNode) return assistantParagraph;
    assistantNode = document.createElement('article');
    assistantNode.className = 'chat-answer';
    const mark = document.createElement('span'); mark.className = 'answer-mark'; mark.textContent = 'L';
    const content = document.createElement('div'); content.className = 'answer-content';
    const label = document.createElement('div'); label.className = 'answer-label'; label.textContent = `LEARNOVA · ${level.toUpperCase()}`;
    assistantParagraph = document.createElement('p'); assistantParagraph.className = 'streamed-answer';
    content.append(label, assistantParagraph); assistantNode.append(mark, content);
    thinking.remove(); output.append(assistantNode);
    return assistantParagraph;
  };
  try {
    const response = await fetch('/api/chat/learnova', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history, level }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Please try again in a moment.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const handleLine = (line) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const event = JSON.parse(payload);
        const text = (event.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
        if (!text) return;
        answerText += text;
        const paragraph = showAssistant();
        paragraph.textContent = answerText;
        output.scrollTop = output.scrollHeight;
      } catch { /* Ignore incomplete SSE data lines. */ }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(handleLine);
      if (done) break;
    }
    if (buffer) handleLine(buffer);
    if (!answerText) throw new Error('Learnova did not receive an answer. Please try again.');
    history.push({ role: 'assistant', content: answerText });
  } catch (error) {
    if (assistantNode) {
      const p = assistantNode.querySelector('.streamed-answer');
      p.textContent = `${answerText}${answerText ? '\n\n' : ''}${error.message || 'The response was interrupted.'}`;
      assistantNode.classList.add('chat-error');
    } else {
      thinking.textContent = error.message || 'Learnova could not connect just now. Please try again.';
      thinking.classList.add('chat-error');
    }
    history.pop();
  } finally {
    pending = false;
    lessonForm.querySelector('button[type="submit"]').disabled = false;
  }
}

lessonForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = topicField.value.trim();
  if (!question) return;
  topicField.value = '';
  askLearnova(question, document.querySelector('#level').value);
});

document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => {
  topicField.value = button.dataset.prompt;
  topicField.focus();
  if (button.closest('.suggestion-grid')) lessonForm.requestSubmit();
}));

document.querySelector('#new-chat').addEventListener('click', () => {
  history.length = 0;
  output.replaceChildren();
  output.hidden = true;
  welcome.hidden = false;
  topicField.value = '';
  topicField.focus();
});
