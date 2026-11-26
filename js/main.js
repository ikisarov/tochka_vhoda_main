const stage = document.querySelector('.stage');
const phone = document.querySelector('.phone');
const content = document.querySelector('#content');
const banner = document.querySelector('.banner');
const cursor = document.querySelector('.touch-cursor');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactThreshold = 250;

function fitPhone() {
  const sideInsets = 24;
  const scale = Math.min(
    1,
    Math.max(1, stage.clientWidth - sideInsets) / phone.offsetWidth,
    stage.clientHeight / phone.offsetHeight,
  );
  phone.style.setProperty('--phone-scale', scale);
}

new ResizeObserver(fitPhone).observe(stage);
fitPhone();

document.querySelectorAll('img[data-src]').forEach(image => {
  image.addEventListener('load', () => { image.hidden = false; }, { once: true });
  image.src = image.dataset.src;
});

const openedAsFile = location.protocol === 'file:';
document.querySelector('.launch-note').hidden = !openedAsFile;

const playerRuntime = openedAsFile ? null : import('./vendor/dotlottie.js')
  .then(({ DotLottie }) => {
    DotLottie.setWasmUrl(new URL('./js/vendor/dotlottie-player.wasm', document.baseURI).href);
    return DotLottie;
  });

async function readAnimation(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.arrayBuffer();
  if (data.byteLength < 4 || new DataView(data).getUint32(0) !== 0x504b0304) {
    throw new Error('Ожидался архив dotLottie. Проверь файл и его путь.');
  }
  return data;
}

function connectAnimation(canvas, isVisible) {
  if (!playerRuntime) return () => {};

  const path = new URL(canvas.dataset.lottie, document.baseURI);
  let player;

  function syncPlayback() {
    if (!player?.isLoaded) return;

    if (reducedMotion.matches) {
      player.stop();
    } else if (document.hidden || !isVisible()) {
      player.pause();
    } else {
      player.play();
    }
  }

  function reportFailure(error) {
    canvas.parentElement.classList.remove('is-lottie-ready');
    player?.destroy();
    player = undefined;
    console.error(`[dotLottie] ${path.pathname}`, error);
  }

  Promise.all([playerRuntime, readAnimation(path)]).then(([DotLottie, data]) => {
    player = new DotLottie({
      canvas,
      data,
      autoplay: false,
      loop: true,
    });

    player.addEventListener('load', () => {
      player.setFrame(0);
      if (!player) return;
      canvas.parentElement.classList.add('is-lottie-ready');
      syncPlayback();
    });
    player.addEventListener('loadError', ({ error }) => reportFailure(error));
    player.addEventListener('renderError', ({ error }) => reportFailure(error));
  }).catch(reportFailure);

  return syncPlayback;
}

const syncFullArtwork = connectAnimation(document.querySelector('.banner__art [data-lottie]'), () => true);
const syncCompactArtwork = connectAnimation(document.querySelector('.banner__chapter [data-lottie]'), () => banner.dataset.compact === 'true');

function syncMotion() {
  syncFullArtwork();
  syncCompactArtwork();
}

function updateBanner() {
  const compact = String(content.scrollTop > compactThreshold);
  if (banner.dataset.compact === compact) return;

  banner.dataset.compact = compact;
  syncCompactArtwork();
}

content.addEventListener('scroll', updateBanner, { passive: true });
window.addEventListener('pageshow', updateBanner);
document.addEventListener('visibilitychange', syncMotion);
reducedMotion.addEventListener('change', syncMotion);
updateBanner();

let drag;

content.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;

  drag = {
    pointerId: event.pointerId,
    y: event.clientY,
    scrollTop: content.scrollTop,
    scale: content.getBoundingClientRect().height / content.clientHeight,
  };
  content.setPointerCapture(event.pointerId);
});

content.addEventListener('pointermove', event => {
  if (event.pointerId !== drag?.pointerId) return;

  content.scrollTop = drag.scrollTop + (drag.y - event.clientY) / drag.scale;
});

function stopDragging(event) {
  if (event.pointerId === drag?.pointerId) drag = undefined;
}

content.addEventListener('pointerup', stopDragging);
content.addEventListener('lostpointercapture', stopDragging);

let cursorPressedUntil = 0;
let cursorReleaseTimer;

function showCursor(event) {
  if (event.pointerType !== 'mouse') return;

  cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
  cursor.hidden = false;
  phone.classList.add('has-touch-cursor');
}

function hideCursor(event) {
  if (event.pointerType && event.pointerType !== 'mouse') return;

  clearTimeout(cursorReleaseTimer);
  cursor.hidden = true;
  cursor.classList.remove('is-pressed');
  phone.classList.remove('has-touch-cursor');
}

phone.addEventListener('pointerenter', showCursor);
phone.addEventListener('pointermove', showCursor);
phone.addEventListener('pointerleave', hideCursor);
phone.addEventListener('pointercancel', hideCursor);
window.addEventListener('blur', hideCursor);

phone.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0) return;

  showCursor(event);
  clearTimeout(cursorReleaseTimer);
  cursorPressedUntil = performance.now() + 120;
  cursor.classList.add('is-pressed');
});

window.addEventListener('pointerup', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || !cursor.classList.contains('is-pressed')) return;

  cursorReleaseTimer = setTimeout(
    () => cursor.classList.remove('is-pressed'),
    Math.max(0, cursorPressedUntil - performance.now()),
  );
});
