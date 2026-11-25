const easing = 'cubic-bezier(.2,.78,.22,1)';
const translate = (axis, pixels) => `translate${axis}(${pixels}px)`;

export function mealReader(dialog, body, { render, activate, reducedMotion }) {
  const bar = dialog.querySelector('.detail-bar');
  const counter = bar.querySelector('[data-reader-remaining]');
  const navigation = bar.querySelector('[data-reader-navigation]');
  const closeButton = bar.querySelector('[type="submit"]');
  let state;
  let pull;

  function panel(current, index) {
    if (current.panels.has(index)) return current.panels.get(index);
    const element = document.createElement('div');
    element.className = 'reader-page';
    element.innerHTML = render(current.meals[index]);
    current.track.append(element);
    const cover = element.querySelector('.detail-photo');
    const entry = { element, cover, decoded: false };
    entry.ready = cover.decode().then(() => { entry.decoded = true; }, () => {
      const error = document.createElement('p');
      error.className = 'reader-photo-error';
      error.textContent = '照片暫時無法載入';
      cover.after(error);
    });
    current.panels.set(index, entry);
    return entry;
  }

  function show(current) {
    for (const [index, entry] of current.panels) {
      if (Math.abs(index - current.index) > 1) {
        entry.element.remove();
        current.panels.delete(index);
      }
    }
    for (let index = Math.max(0, current.index - 1); index <= Math.min(current.meals.length - 1, current.index + 1); index++) {
      const { element } = panel(current, index);
      const active = index === current.index;
      element.style.transform = `translateX(${(index - current.index) * 100}%)`;
      element.inert = !active;
      if (active) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
    }
    current.track.style.transform = '';
    current.heading.textContent = current.meals[current.index].restaurant;
    const remaining = current.meals.length - current.index - 1;
    counter.textContent = `${remaining} 餐`;
    counter.setAttribute('aria-label', `剩餘 ${remaining} 餐`);
    navigation.querySelector('[data-reader-step="-1"]').disabled = current.index === 0;
    navigation.querySelector('[data-reader-step="1"]').disabled = remaining === 0;
    activate(current.panels.get(current.index).element.firstElementChild, current.meals[current.index]);
  }

  function originTile(current) {
    if (current.origin.isConnected) return current.origin;
    const tile = Array.from(document.querySelectorAll('.tile[data-meal]')).find(button => button.dataset.meal === current.origin.dataset.meal);
    if (tile) tile.closest('.tile-grid').scrollLeft = current.scrollLeft;
    return tile;
  }

  function fly(current, leaving) {
    const cover = current.panels.get(current.index).cover;
    const tile = originTile(current)?.querySelector('img');
    const frame = cover?.getBoundingClientRect();
    const bounds = tile?.getBoundingClientRect();
    if (reducedMotion.matches || !cover?.naturalWidth || !frame?.height || !bounds?.width || !bounds.height
      || bounds.bottom <= 0 || bounds.top >= innerHeight) return;
    const scale = Math.min(frame.width / cover.naturalWidth, frame.height / cover.naturalHeight);
    const width = cover.naturalWidth * scale;
    const height = cover.naturalHeight * scale;
    const left = frame.left + (frame.width - width) / 2;
    const top = frame.top + (frame.height - height) / 2;
    const ghost = document.createElement('img');
    ghost.className = 'reader-flight';
    ghost.src = cover.currentSrc || cover.src;
    ghost.alt = '';
    Object.assign(ghost.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    if (leaving) dialog.style.removeProperty('transform');
    dialog.append(ghost);
    const small = {
      transform: `translate(${bounds.left - left}px, ${bounds.top - top}px) scale(${bounds.width / width}, ${bounds.height / height})`,
      borderRadius: '10px',
    };
    const large = { transform: 'none', borderRadius: '0px' };
    const animation = ghost.animate(leaving ? [large, small] : [small, large], {
      duration: leaving ? 270 : 370, easing, fill: 'both',
    });
    cover.style.visibility = 'hidden';
    if (leaving) dialog.classList.add('reader-leaving');
    current.flight = animation;
    return animation.finished.catch(() => {}).finally(() => {
      cover.style.visibility = '';
      ghost.remove();
      if (current.flight === animation) current.flight = undefined;
    });
  }

  function open(meals, index, origin) {
    if (dialog.open) return;
    const heading = document.createElement('h2');
    heading.id = 'detail-title';
    heading.className = 'visually-hidden';
    const track = document.createElement('div');
    track.className = 'reader-track';
    state = { meals, index, origin, heading, track, panels: new Map(), scrollY: window.scrollY,
      scrollLeft: origin.closest('.tile-grid').scrollLeft };
    dialog.classList.add('meal-reader');
    counter.hidden = navigation.hidden = false;
    body.replaceChildren(heading, track);
    show(state);
    dialog.showModal();
    const current = state;
    const cover = current.panels.get(index);
    void cover.ready.then(() => {
      if (state === current && dialog.open && !current.busy && !pull && current.index === index) void fly(current, false);
    });
  }

  async function settle(step, from = 0) {
    const current = state;
    if (!current || current.busy) return;
    current.busy = true;
    current.flight?.cancel();
    const next = current.panels.get(current.index + step);
    if (next && !next.decoded) await next.ready;
    if (state !== current || !dialog.open) return;
    const width = dialog.clientWidth;
    const end = next ? -step * width : 0;
    if (!reducedMotion.matches && from !== end) {
      const animation = current.track.animate([{ transform: translate('X', from) }, { transform: translate('X', end) }], {
        duration: next ? 245 : 185, easing, fill: 'forwards',
      });
      await animation.finished.catch(() => {});
      animation.cancel();
    }
    if (state !== current || !dialog.open) return;
    if (next) {
      current.index += step;
      if (current.track.contains(document.activeElement)) closeButton.focus({ preventScroll: true });
      show(current);
    } else current.track.style.transform = '';
    current.busy = false;
  }

  async function close(from = 0) {
    const current = state;
    if (!current || current.busy) return;
    current.busy = true;
    current.flight?.cancel();
    const animation = fly(current, true);
    if (animation) await animation;
    else if (!reducedMotion.matches) await dialog.animate([
      { transform: translate('Y', from), opacity: 1 },
      { transform: translate('Y', from + 36), opacity: 0 },
    ], { duration: 160, easing }).finished.catch(() => {});
    if (state === current && dialog.open) dialog.close();
  }

  function release(cancelled) {
    const gesture = pull;
    pull = undefined;
    if (!gesture?.active || !state || state.busy) return;
    if (gesture.axis === 'X') {
      const threshold = Math.min(84, dialog.clientWidth * .22);
      void settle(!cancelled && Math.abs(gesture.distance) >= threshold ? gesture.step : 0, gesture.offset);
    } else if (!cancelled && gesture.distance >= 72) void close(gesture.offset);
    else {
      if (gesture.offset) dialog.animate([
        { transform: translate('Y', gesture.offset) }, { transform: 'none' },
      ], { duration: 185, easing });
      dialog.style.transform = '';
    }
  }

  dialog.addEventListener('touchstart', event => {
    pull = undefined;
    if (!state || state.busy || event.touches.length !== 1 || event.target.closest('button, input, textarea, a')) return;
    const { clientX: x, clientY: y } = event.touches[0];
    const bounds = dialog.getBoundingClientRect();
    if (bar.contains(event.target)) pull = { x, y, axis: 'Y' };
    else if (y >= bounds.top + bounds.height * .5) {
      const fromLeft = x - bounds.left;
      const fromRight = bounds.right - x;
      if (fromLeft >= 14 && fromLeft <= 52) pull = { x, y, axis: 'X', step: -1 };
      else if (fromRight >= 14 && fromRight <= 52) pull = { x, y, axis: 'X', step: 1 };
    }
  }, { passive: true });

  dialog.addEventListener('touchmove', event => {
    if (!pull || !state) return;
    if (event.touches.length !== 1) return release(true);
    const dx = event.touches[0].clientX - pull.x;
    const dy = event.touches[0].clientY - pull.y;
    const horizontal = pull.axis === 'X';
    const along = horizontal ? dx : dy;
    if (!pull.active) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(along) <= Math.abs(horizontal ? dy : dx) || (horizontal ? along * pull.step >= 0 : along < 0)) {
        pull = undefined;
        return;
      }
      if (!event.cancelable) { pull = undefined; return; }
      state.flight?.cancel();
      pull.active = true;
    }
    event.preventDefault();
    pull.distance = horizontal ? Math.min(0, dx * pull.step) * pull.step : Math.max(0, dy);
    let offset = Math.min(dialog.clientHeight, pull.distance) * .68;
    if (horizontal) {
      const ready = state.panels.get(state.index + pull.step)?.decoded;
      const distance = Math.abs(pull.distance);
      offset = Math.sign(pull.distance) * (ready ? Math.min(dialog.clientWidth, distance) : Math.min(24, distance * .2));
    }
    pull.offset = reducedMotion.matches ? 0 : offset;
    (horizontal ? state.track : dialog).style.transform = translate(pull.axis, pull.offset);
  }, { passive: false });
  dialog.addEventListener('touchend', () => release(false), { passive: true });
  dialog.addEventListener('touchcancel', () => release(true), { passive: true });

  bar.addEventListener('submit', event => { if (state) { event.preventDefault(); void close(); } });
  navigation.addEventListener('click', event => {
    const step = Number(event.target.closest('[data-reader-step]')?.dataset.readerStep);
    if (step) void settle(step);
  });
  dialog.addEventListener('cancel', event => { if (state) { event.preventDefault(); void close(); } });
  dialog.addEventListener('keydown', event => {
    if (!state || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || event.target.closest('input, textarea, .story-gallery')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      void settle(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  function fitViewport() {
    if (!state || !window.visualViewport) return;
    const viewport = window.visualViewport;
    if (viewport.scale !== 1) return;
    dialog.style.setProperty('--reader-height', `${viewport.height}px`);
    dialog.style.setProperty('--reader-top', `${viewport.offsetTop}px`);
  }
  window.visualViewport?.addEventListener('resize', fitViewport);
  window.visualViewport?.addEventListener('scroll', fitViewport);

  dialog.addEventListener('close', () => {
    if (!state || dialog.open) return;
    const focus = originTile(state);
    const { scrollY, flight } = state;
    state = pull = undefined;
    flight?.cancel();
    dialog.classList.remove('meal-reader', 'reader-leaving');
    dialog.style.removeProperty('transform');
    dialog.style.removeProperty('--reader-height');
    dialog.style.removeProperty('--reader-top');
    counter.hidden = navigation.hidden = true;
    if (focus) {
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
      focus.focus({ preventScroll: true });
    }
  });
  return open;
}
