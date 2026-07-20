const RAW_DATA = JSON.parse(document.getElementById('quiz-data').textContent);

const state = {
  order: [],
  pos: 0,
  score: 0,
  answered: [],
  selected: new Set(),
  locked: false,
  activeModule: 'All',
  activeSource: 'All',
  activeSection: 'All',
  choiceOrders: {},
  builtFor: null,
};

const allModules = ['All', ...new Set(RAW_DATA.map(question => question.module || 'Uncategorized'))]
  .sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    const aNumber = Number(a.match(/\d+/)?.[0]);
    const bNumber = Number(b.match(/\d+/)?.[0]);
    if (aNumber && bNumber) return aNumber - bNumber;
    if (aNumber) return -1;
    if (bNumber) return 1;
    return a.localeCompare(b);
  });
const allSources = ['All', ...new Set(RAW_DATA.flatMap(question => question.sources || [question.source || 'Original reviewer']))]
  .sort((a, b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));

function questionMatchesModuleAndSource(question) {
  const moduleMatches = state.activeModule === 'All' || (question.module || 'Uncategorized') === state.activeModule;
  const sources = question.sources || [question.source || 'Original reviewer'];
  const sourceMatches = state.activeSource === 'All' || sources.includes(state.activeSource);
  return moduleMatches && sourceMatches;
}

function filteredIndices() {
  return RAW_DATA.map((question, index) => ({ question, index }))
    .filter(({ question }) => questionMatchesModuleAndSource(question))
    .filter(({ question }) => state.activeSection === 'All' || question.section === state.activeSection)
    .map(({ index }) => index);
}

function populateSelect(id, options, selected, onChange) {
  const select = document.getElementById(id);
  select.innerHTML = options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('');
  select.value = options.includes(selected) ? selected : 'All';
  select.onchange = event => onChange(event.target.value);
}

function buildFilters() {
  populateSelect('moduleFilter', allModules, state.activeModule, value => {
    state.activeModule = value;
    state.activeSection = 'All';
    initOrder(false);
    render();
  });
  populateSelect('sourceFilter', allSources, state.activeSource, value => {
    state.activeSource = value;
    state.activeSection = 'All';
    initOrder(false);
    render();
  });

  const matching = RAW_DATA.filter(questionMatchesModuleAndSource);
  const topics = ['All', ...new Set(matching.map(question => question.section || 'Uncategorized'))].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b);
  });
  if (!topics.includes(state.activeSection)) state.activeSection = 'All';
  const row = document.getElementById('filterRow');
  row.innerHTML = '';
  for (const topic of topics) {
    const count = topic === 'All' ? matching.length : matching.filter(question => question.section === topic).length;
    const button = document.createElement('button');
    button.className = `chip${topic === state.activeSection ? ' active' : ''}`;
    button.textContent = `${topic} (${count})`;
    button.onclick = () => {
      state.activeSection = topic;
      initOrder(false);
      render();
    };
    row.appendChild(button);
  }
}

function freshAnswerState() {
  return { done: false, correct: false, revealed: false, selected: [] };
}

function initOrder(shuffle) {
  const indices = filteredIndices();
  if (shuffle) shuffleArray(indices);
  state.order = indices;
  state.pos = 0;
  state.score = 0;
  state.answered = indices.map(freshAnswerState);
  state.selected = new Set();
  state.locked = false;
  state.choiceOrders = {};
  state.builtFor = null;
  document.getElementById('sourceLabel').textContent = `${indices.length} unique question${indices.length === 1 ? '' : 's'}`;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function shuffleChoices(question) {
  return shuffleArray(question.choices.map((choice, index) => index));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderImages(question) {
  if (!question.images?.length) return '';
  return `<div class="exhibit-grid">${question.images.map((source, index) =>
    `<img src="${escapeHtml(source)}" alt="Question exhibit ${index + 1}" loading="lazy">`
  ).join('')}</div>`;
}

function render() {
  buildFilters();
  updateProgress();
  const area = document.getElementById('quizArea');

  if (!state.order.length) {
    area.innerHTML = '<div class="card"><p style="color:var(--text-dim)">No questions match these filters.</p></div>';
    return;
  }
  if (state.pos >= state.order.length) {
    renderResults();
    return;
  }

  const question = RAW_DATA[state.order[state.pos]];
  const answerState = state.answered[state.pos];
  const isReveal = question.type === 'reveal';
  const correctCount = isReveal ? 0 : question.choices.filter(choice => choice.correct).length;
  const isMulti = correctCount > 1;

  if (!isReveal && !state.choiceOrders[state.pos]) state.choiceOrders[state.pos] = shuffleChoices(question);
  if (state.builtFor !== state.pos) {
    state.selected = new Set(answerState.selected || []);
    state.builtFor = state.pos;
  }

  let choicesHtml = '';
  if (!isReveal) {
    choicesHtml = state.choiceOrders[state.pos].map(choiceIndex => {
      const choice = question.choices[choiceIndex];
      let className = 'choice';
      if (answerState.done) {
        className += ' locked';
        if (choice.correct) className += ' correct';
        else if (state.selected.has(choiceIndex)) className += ' incorrect';
        else className += ' dimmed';
      } else if (state.selected.has(choiceIndex)) {
        className += ' selected';
      }
      const symbol = answerState.done
        ? (choice.correct ? '✓' : (state.selected.has(choiceIndex) ? '✕' : ''))
        : (state.selected.has(choiceIndex) ? '✓' : '');
      return `<div class="${className}" onclick="onChoiceClick(${choiceIndex}, ${isMulti})">
        <div class="box">${symbol}</div>
        <div class="choice-text">${escapeHtml(choice.text)}</div>
      </div>`;
    }).join('');
  }

  let feedbackHtml = '';
  if (!isReveal && answerState.done) {
    feedbackHtml = `<div class="feedback show ${answerState.correct ? 'right' : 'wrong'}">
      <div class="feedback-head">${answerState.correct ? '✓ CORRECT' : '✕ INCORRECT'}</div>
      <div class="feedback-body">${escapeHtml(question.explanation || 'No explanation provided.')}</div>
    </div>`;
  } else if (isReveal && answerState.revealed) {
    const heading = answerState.done ? (answerState.correct ? '✓ MARKED AS KNOWN' : 'REVIEW AGAIN') : 'ANSWER REVEALED';
    feedbackHtml = `<div class="feedback show ${answerState.done && !answerState.correct ? 'wrong' : 'right'}">
      <div class="feedback-head">${heading}</div>
      <div class="feedback-answer">${escapeHtml(question.answer)}</div>
      <div class="feedback-body">${escapeHtml(question.explanation || 'No explanation provided.')}</div>
    </div>`;
  }

  let actionHtml;
  if (isReveal && !answerState.revealed) {
    actionHtml = '<button class="btn primary" onclick="revealAnswer()">Reveal answer</button>';
  } else if (isReveal && !answerState.done) {
    actionHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn primary" onclick="markReveal(true)">I got it</button>
      <button class="btn" onclick="markReveal(false)">Review again</button>
    </div>`;
  } else if (answerState.done) {
    actionHtml = `<button class="btn primary" onclick="goNext()">${state.pos === state.order.length - 1 ? 'See results' : 'Next question'} →</button>`;
  } else {
    actionHtml = `<button class="btn primary" onclick="submitAnswer()" ${state.selected.size === 0 ? 'disabled' : ''}>Submit answer</button>`;
  }

  const sourceText = question.sources?.length > 1 ? question.sources.join(' · ') : (question.source || 'Original reviewer');
  area.innerHTML = `<div class="card">
    <div class="card-meta">
      <span class="q-index">QUESTION ${state.pos + 1} / ${state.order.length}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
        ${isReveal ? '<span class="multi-tag">SELF-CHECK</span>' : (isMulti ? `<span class="multi-tag">SELECT ${correctCount}</span>` : '')}
        <span class="section-tag">${escapeHtml(question.module || 'Uncategorized')} · ${escapeHtml(question.section || 'Uncategorized')}</span>
      </div>
    </div>
    <div class="q-text">${escapeHtml(question.question)}</div>
    ${renderImages(question)}
    ${isReveal ? '' : `<div class="choices">${choicesHtml}</div>`}
    ${feedbackHtml}
    <div class="source-note">Source: ${escapeHtml(sourceText)}${question.sourcePage ? ` · PDF page ${question.sourcePage}` : ''}</div>
    <div class="action-row">
      <button class="btn" ${state.pos === 0 ? 'disabled' : ''} onclick="goPrev()">← Previous</button>
      ${actionHtml}
    </div>
  </div>`;
}

function onChoiceClick(choiceIndex, isMulti) {
  const answerState = state.answered[state.pos];
  if (answerState.done) return;
  if (isMulti) {
    if (state.selected.has(choiceIndex)) state.selected.delete(choiceIndex);
    else state.selected.add(choiceIndex);
    render();
  } else {
    state.selected = new Set([choiceIndex]);
    submitAnswer();
  }
}

function submitAnswer() {
  const question = RAW_DATA[state.order[state.pos]];
  const answerState = state.answered[state.pos];
  if (answerState.done || !state.selected.size) return;
  const correctSet = new Set(question.choices.map((choice, index) => choice.correct ? index : null).filter(index => index !== null));
  let correct = correctSet.size === state.selected.size;
  if (correct) {
    for (const index of state.selected) {
      if (!correctSet.has(index)) correct = false;
    }
  }
  answerState.done = true;
  answerState.correct = correct;
  answerState.selected = [...state.selected];
  if (correct) state.score += 1;
  render();
}

function revealAnswer() {
  state.answered[state.pos].revealed = true;
  render();
}

function markReveal(correct) {
  const answerState = state.answered[state.pos];
  if (answerState.done) return;
  answerState.done = true;
  answerState.correct = correct;
  if (correct) state.score += 1;
  render();
}

function goNext() {
  state.pos += 1;
  state.builtFor = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goPrev() {
  if (state.pos > 0) {
    state.pos -= 1;
    state.builtFor = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updateProgress() {
  const total = state.order.length;
  const done = state.answered.filter(answer => answer.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = `${percent}%`;
  document.getElementById('progressLabel').textContent = `${done} / ${total}`;
  document.getElementById('scoreChip').textContent = `Score: ${state.score}`;
}

function renderResults() {
  const total = state.order.length;
  const percent = total ? Math.round((state.score / total) * 100) : 0;
  const bySection = {};
  state.order.forEach((questionIndex, index) => {
    const section = RAW_DATA[questionIndex].section || 'Uncategorized';
    if (!bySection[section]) bySection[section] = { correct: 0, total: 0 };
    bySection[section].total += 1;
    if (state.answered[index].correct) bySection[section].correct += 1;
  });
  const breakdown = Object.entries(bySection)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([section, value]) => `<div class="breakdown-row"><span>${escapeHtml(section)}</span><span>${value.correct} / ${value.total}</span></div>`)
    .join('');
  document.getElementById('quizArea').innerHTML = `<div class="card results">
    <div style="font-family:var(--mono);color:var(--text-dim);font-size:12px;letter-spacing:1px;">QUIZ COMPLETE</div>
    <div class="big-score">${state.score}<span style="font-size:24px;color:var(--text-dim);">/${total}</span></div>
    <div class="sub">${percent}% correct</div>
    <div class="results-actions">
      <button class="btn primary" onclick="retryAll()">Retry (same order)</button>
      <button class="btn" onclick="retryShuffled()">Retry shuffled</button>
    </div>
    <div class="breakdown">${breakdown}</div>
  </div>`;
}

function retryAll() {
  state.pos = 0;
  state.score = 0;
  state.answered = state.order.map(freshAnswerState);
  state.selected = new Set();
  state.choiceOrders = {};
  state.builtFor = null;
  render();
}

function retryShuffled() {
  initOrder(true);
  render();
}

document.getElementById('shuffleBtn').onclick = () => {
  initOrder(true);
  render();
};
document.getElementById('restartBtn').onclick = () => {
  initOrder(false);
  render();
};

initOrder(false);
render();
