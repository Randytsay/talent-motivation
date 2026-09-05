(() => {
  const RETRY_ID = 'ai-report-retry-action';

  function findReportPanel() {
    return document.querySelector('.report-panel');
  }

  function shouldOfferRetry(panel) {
    if (!panel) return false;
    const text = panel.textContent || '';
    const hasReport = text.includes('你的三個高重複訊號');
    if (hasReport) return false;
    const hasPending = text.includes('正在為你生成專屬特質解析');
    const error = panel.querySelector('.field-error[role="alert"]');
    return hasPending || Boolean(error);
  }

  function ensureRetry() {
    const panel = findReportPanel();
    if (!shouldOfferRetry(panel) || document.getElementById(RETRY_ID)) return;

    const wrapper = document.createElement('div');
    wrapper.id = RETRY_ID;
    wrapper.className = 'reflection-card';
    wrapper.style.marginTop = '18px';

    const label = document.createElement('small');
    label.textContent = 'AI 綜合解析';

    const message = document.createElement('p');
    message.textContent = '測驗結果已保存。AI 解析若尚未完成，可以直接重新產生，不必再做一次測驗。';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button';
    button.style.marginTop = '14px';
    button.textContent = '重新產生 AI 解析';

    const status = document.createElement('p');
    status.className = 'local-note';
    status.style.marginTop = '12px';

    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = '正在重新產生…';
      status.textContent = '你的測驗結果已保存，現在只重新處理 AI 解析。';
      try {
        const latestResponse = await fetch('/api/assessments/latest', { credentials: 'same-origin' });
        const latestBody = await latestResponse.json().catch(() => null);
        const assessmentId = latestBody?.assessment?.assessmentId;
        if (!latestResponse.ok || !assessmentId) throw new Error('latest_assessment_unavailable');

        const reportResponse = await fetch('/api/reports/generate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assessmentId }),
        });
        const reportBody = await reportResponse.json().catch(() => null);
        if (!reportResponse.ok || !reportBody?.report) {
          const messageFromApi = reportBody?.error?.message;
          throw new Error(typeof messageFromApi === 'string' ? messageFromApi : 'report_generation_failed');
        }
        status.textContent = 'AI 解析已完成，正在更新畫面…';
        window.location.reload();
      } catch (error) {
        status.textContent = error instanceof Error && error.message.includes('AI')
          ? error.message
          : 'AI 解析目前仍無法完成，測驗結果已安全保存，請稍後再試。';
        button.disabled = false;
        button.textContent = '再次嘗試 AI 解析';
      }
    });

    wrapper.append(label, message, button, status);
    const error = panel.querySelector('.field-error[role="alert"]');
    if (error) error.insertAdjacentElement('afterend', wrapper);
    else panel.querySelector('.reflection-card:last-of-type')?.insertAdjacentElement('afterend', wrapper) ?? panel.appendChild(wrapper);
  }

  let pendingTimer = null;
  const observer = new MutationObserver(() => {
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(ensureRetry, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(ensureRetry, 1200);
})();