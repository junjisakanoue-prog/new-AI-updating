// トップのヒーローイラスト（インライン SVG）。
// 外部リクエストを一切しないので、オフラインでも必ず描画される。
//
// アニメーションは SMIL ではなく CSS を使う。SMIL は要素ごとに
// タイマーを持つため描画負荷が高く、要素数が増えると重くなるため。
// 動きは「ノードの明滅」と「データパルスの流れ」の 2 種類に絞っている。

(function () {
  const NODES = [
    [90, 118], [175, 78], [175, 150], [262, 52], [262, 112], [262, 176],
    [352, 88], [352, 158], [440, 60], [440, 124], [440, 186], [528, 100], [612, 132],
  ];
  const LINKS = [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7],
    [6, 8], [6, 9], [7, 9], [7, 10], [8, 11], [9, 11], [10, 11], [11, 12],
  ];

  const links = LINKS.map(([a, b], i) => {
    const [x1, y1] = NODES[a];
    const [x2, y2] = NODES[b];
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#linkGrad)"
      stroke-width="1" class="lnk" style="--d:${(i % 6) * 0.5}s"/>`;
  }).join('');

  const nodes = NODES.map(([x, y], i) => `
    <circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 4.6 : 3}" fill="url(#nodeGrad)"
      class="nd" style="--d:${(i % 5) * 0.45}s"/>`).join('');

  // パルスは全ノードではなく 4 点のみ（負荷を抑えつつ動きは出す）
  const pulses = [1, 4, 8, 11].map((n, i) => {
    const [x, y] = NODES[n];
    return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#5eead4"
      stroke-width="0.9" class="pls" style="--d:${i * 0.9}s"/>`;
  }).join('');

  // 奥行きのあるグリッド地平線（静止）
  let grid = '';
  for (let i = 0; i <= 14; i++) {
    const x = i * 50;
    grid += `<line x1="${x}" y1="240" x2="${350 + (x - 350) * 2.6}" y2="300"
      stroke="#4c1d95" stroke-width="0.7" opacity="0.5"/>`;
  }
  for (let i = 1; i <= 6; i++) {
    const y = 240 + i * i * 1.7;
    grid += `<line x1="0" y1="${y}" x2="700" y2="${y}" stroke="#4c1d95" stroke-width="0.7" opacity="0.42"/>`;
  }

  const svg = `
  <svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="AI ニュースを表す近未来的なニューラルネットワークのイラスト"
       preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="skyGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0b1027"/>
        <stop offset="52%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#3b1d4e"/>
      </linearGradient>
      <linearGradient id="linkGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#22d3ee"/>
        <stop offset="60%" stop-color="#818cf8"/>
        <stop offset="100%" stop-color="#e0885a"/>
      </linearGradient>
      <radialGradient id="nodeGrad">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="45%" stop-color="#5eead4"/>
        <stop offset="100%" stop-color="#6366f1"/>
      </radialGradient>
      <radialGradient id="sunGrad">
        <stop offset="0%" stop-color="#fb923c" stop-opacity="0.95"/>
        <stop offset="70%" stop-color="#b35c2e" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#b35c2e" stop-opacity="0"/>
      </radialGradient>
      <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="700" height="300" fill="url(#skyGrad)"/>
    <circle cx="350" cy="242" r="105" fill="url(#sunGrad)"/>
    <g>${grid}</g>
    <line x1="0" y1="240" x2="700" y2="240" stroke="#818cf8" stroke-width="1.1" opacity="0.75"/>
    <g filter="url(#glow)">${links}${pulses}${nodes}</g>
  </svg>`;

  const mount = document.getElementById('hero');
  if (mount) mount.innerHTML = svg;
})();
