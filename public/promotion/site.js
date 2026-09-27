(() => {
  const cases = {
    cross: { low: -8, high: 18, label: '前提の確認が必要', title: '赤字か黒字かが、\n前提によって変わる。', body: 'NPVは−800万円〜＋1,800万円。費用に見合うかは前提次第です。想定した水利用量やコストなど、結果を左右する条件を確認します。', action: '水利用量やコストの前提を確認', color: '#2864dc', description: '承認基準の0をまたぎます。' },
    above: { low: 8, high: 22, label: 'この試算範囲では基準を上回る', title: 'この試算では、\n費用に見合う。', body: 'NPVは＋800万円〜＋2,200万円。試算の範囲では社内の承認基準を満たします。実行前に、設備の安全性や他の承認条件も確認します。', action: '他の承認条件を確認し、判断理由を記録', color: '#2054bd', description: '全体が承認基準の0を上回ります。' },
    below: { low: -18, high: -4, label: 'この試算範囲では基準を下回る', title: 'この試算では、\n費用に見合わない。', body: 'NPVは−1,800万円〜−400万円。設備費や対策案を見直す材料になります。法令対応など、収益性とは別に必要な対策かも確認します。', action: '対策案・費用・財務以外の必要性を検討', color: '#697586', description: '全体が承認基準の0を下回ります。' }
  };
  const signed = n => n < 0 ? '−' + Math.abs(n) : '+' + n;
  document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
    const item = cases[button.dataset.case];
    document.querySelectorAll('[data-case]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    const bar = document.getElementById('range-bar');
    bar.style.left = ((item.low + 30) / 60 * 100) + '%';
    bar.style.width = ((item.high - item.low) / 60 * 100) + '%';
    bar.style.background = item.color;
    document.getElementById('range-low').textContent = signed(item.low);
    document.getElementById('range-high').textContent = signed(item.high);
    document.getElementById('verdict-label').textContent = item.label;
    document.getElementById('verdict-title').replaceChildren(...item.title.split('\n').flatMap((text, i) => i ? [document.createElement('br'), document.createTextNode(text)] : [document.createTextNode(text)]));
    document.getElementById('verdict-body').textContent = item.body;
    document.getElementById('next-action').textContent = item.action;
    document.getElementById('range-chart').setAttribute('aria-label', `NPVの幅は${item.low}から${item.high}百万円。${item.description}`);
  }));
  const contact = window.PRISM_PROMOTION?.contactUrl;
  if (contact) {
    try {
      const url = new URL(contact);
      if (url.protocol !== 'https:') return;
      const link = document.getElementById('contact-link');
      link.href = url.href;
      link.removeAttribute('download');
      link.textContent = '検証について相談する ↗';
      document.getElementById('contact-note').textContent = '相談窓口へ移動します。対象案件や検討状況をお聞かせください。';
    } catch { /* 設定不備では資料ダウンロードを維持する。 */ }
  }
})();
