import autoAnimate, { type AnimationController } from '@formkit/auto-animate';

const FILTER_DURATION_MS = 180;
const FILTER_EASING = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export function animateList(container: HTMLElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let controller: AnimationController | undefined;
  const dispose = () => {
    controller?.destroy?.();
    controller = undefined;
    // Cancelling a removal animation must also remove its inert visual remnant.
    container.querySelectorAll(':scope > [inert]').forEach(row => row.remove());
  };
  const updatePreference = () => {
    dispose();
    if (!reducedMotion.matches) controller = autoAnimate(container, { duration: FILTER_DURATION_MS, easing: FILTER_EASING });
  };
  updatePreference();
  reducedMotion.addEventListener('change', updatePreference);
  return () => { reducedMotion.removeEventListener('change', updatePreference); dispose(); };
}

// Stable record nodes let AutoAnimate recognize a move instead of replacing every row.
export function updateList(container: HTMLElement, markup: string) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const current = new Map([...container.children].filter(el => !el.hasAttribute('inert'))
    .map(el => [el.getAttribute('data-list-key'), el]));
  const next = [...template.content.children].map(el => current.get(el.getAttribute('data-list-key')) ?? el);
  const retained = new Set(next);
  for (const row of current.values()) {
    if (retained.has(row)) continue;
    // The library keeps departing rows briefly: remove them from focus and accessibility immediately.
    row.setAttribute('inert', '');
    row.setAttribute('aria-hidden', 'true');
    row.remove();
  }
  let previous: Element | undefined;
  for (const row of next) {
    const expected = previous ? previous.nextElementSibling : container.firstElementChild;
    if (row !== expected) container.insertBefore(row, expected);
    previous = row;
  }
}
