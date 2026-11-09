const cleanups = new WeakMap<HTMLElement, () => void>();

function isPrimaryView(entry: IntersectionObserverEntry) {
	const rootHeight = entry.rootBounds?.height ?? window.innerHeight;
	const visibleHeight = entry.intersectionRect.height;
	const targetHeight = entry.boundingClientRect.height;
	const mostlyOnScreen = targetHeight > 0 && visibleHeight / targetHeight >= 0.6;
	const dominatesViewport = rootHeight > 0 && visibleHeight / rootHeight >= 0.4;
	return entry.isIntersecting && (mostlyOnScreen || dominatesViewport);
}

export function destroyLandingCarousel(carousel: HTMLElement) {
	cleanups.get(carousel)?.();
	cleanups.delete(carousel);
}

export function initLandingCarousel(carousel: HTMLElement) {
	destroyLandingCarousel(carousel);

	const disposers: Array<() => void> = [];
	const on = <K extends keyof HTMLElementEventMap>(
		target: EventTarget,
		type: K,
		listener: (event: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	) => {
		target.addEventListener(type, listener as EventListener, options);
		disposers.push(() => target.removeEventListener(type, listener as EventListener, options));
	};

	function loadDeferredSlides() {
		carousel.querySelectorAll<HTMLImageElement>('img.carousel-img[data-src]').forEach((img) => {
			if (img.dataset.srcset) img.srcset = img.dataset.srcset;
			if (img.dataset.src) img.src = img.dataset.src;
			img.removeAttribute('data-src');
			img.removeAttribute('data-srcset');
		});
	}

	const scheduleDeferredSlides = () => {
		const run = () => loadDeferredSlides();
		const later = () => {
			if ('requestIdleCallback' in window) {
				window.requestIdleCallback(run, { timeout: 2000 });
			} else {
				// @ts-expect-error: window.setTimeout is not typed
				window.setTimeout(run, 200);
			}
		};
		if (document.readyState === 'complete') later();
		else {
			window.addEventListener('load', later, { once: true });
			disposers.push(() => window.removeEventListener('load', later));
		}
	};
	scheduleDeferredSlides();

	const items = Array.from(carousel.querySelectorAll<HTMLElement>('.carousel-item'));
	const dots = Array.from(carousel.querySelectorAll<HTMLButtonElement>('.carousel-dot'));
	const prevBtn = carousel.querySelector<HTMLButtonElement>('.carousel-btn--prev');
	const nextBtn = carousel.querySelector<HTMLButtonElement>('.carousel-btn--next');
	const pauseBtn = carousel.querySelector<HTMLButtonElement>('.carousel-pause');
	const pauseIcon = pauseBtn?.querySelector<HTMLElement>('.material-icons');

	if (items.length <= 1) {
		cleanups.set(carousel, () => {
			for (const dispose of disposers) dispose();
		});
		return;
	}

	let current = 0;
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let userPaused = false;
	let inViewport = true;
	const INTERVAL_MS = 4000;
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function goTo(index: number) {
		loadDeferredSlides();
		items[current].classList.remove('active');
		items[current].setAttribute('aria-hidden', 'true');
		dots[current]?.classList.remove('active');
		dots[current]?.setAttribute('aria-selected', 'false');

		current = (index + items.length) % items.length;

		items[current].classList.add('active');
		items[current].removeAttribute('aria-hidden');
		dots[current]?.classList.add('active');
		dots[current]?.setAttribute('aria-selected', 'true');
	}

	function clearAuto() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	function updatePauseButton(paused: boolean) {
		if (!pauseBtn) return;
		pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
		if (pauseIcon) pauseIcon.textContent = paused ? 'play_arrow' : 'pause';
		pauseBtn.setAttribute('aria-label', paused ? 'Play carousel' : 'Pause carousel');
	}

	function startAuto() {
		if (reduceMotion || userPaused || !inViewport) return;
		clearAuto();
		intervalId = setInterval(() => goTo(current + 1), INTERVAL_MS);
		updatePauseButton(false);
	}

	function stopAuto() {
		userPaused = true;
		clearAuto();
		updatePauseButton(true);
	}

	if (prevBtn) on(prevBtn, 'click', () => { stopAuto(); goTo(current - 1); });
	if (nextBtn) on(nextBtn, 'click', () => { stopAuto(); goTo(current + 1); });

	dots.forEach((dot, i) => {
		on(dot, 'click', () => { stopAuto(); goTo(i); });
	});

	if (pauseBtn) {
		on(pauseBtn, 'click', () => {
			if (userPaused) {
				userPaused = false;
				startAuto();
			} else {
				stopAuto();
			}
		});
	}

	on(carousel, 'keydown', (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft') { stopAuto(); goTo(current - 1); }
		if (e.key === 'ArrowRight') { stopAuto(); goTo(current + 1); }
	});

	on(carousel, 'mouseenter', clearAuto);
	on(carousel, 'focusin', clearAuto);
	on(carousel, 'mouseleave', startAuto);
	on(carousel, 'focusout', (e: FocusEvent) => {
		if (!carousel.contains(e.relatedTarget as Node)) startAuto();
	});

	const viewportObserver = new IntersectionObserver(
		(entries) => {
			const entry = entries[0];
			inViewport = entry ? isPrimaryView(entry) : false;
			if (inViewport) startAuto();
			else clearAuto();
		},
		{ threshold: [0, 0.25, 0.5, 0.75, 1] },
	);
	viewportObserver.observe(carousel);
	disposers.push(() => viewportObserver.disconnect());

	if (!reduceMotion) startAuto();

	cleanups.set(carousel, () => {
		clearAuto();
		for (const dispose of disposers) dispose();
	});
}
