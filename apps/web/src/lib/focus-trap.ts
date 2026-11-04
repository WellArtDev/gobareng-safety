// Aksi focus trap untuk dialog dashboard (Tugas 1.4).
// Saat dialog dipasang: fokus awal ke elemen focusable pertama,
// Tab/Shift+Tab bersiklus di dalam dialog, scroll body dikunci.
// Saat dialog dilepas: fokus dikembalikan ke elemen sebelumnya dan
// scroll body dipulihkan. Escape sudah ditangani dialog masing-masing
// (onkeydown di backdrop), jadi aksi ini tidak ikut menutup dialog.
const FOCUSABLE =
	'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement) {
	const previouslyFocused = document.activeElement as HTMLElement | null;
	const previousOverflow = document.body.style.overflow;
	document.body.style.overflow = 'hidden';

	const focusables = () =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => !el.hasAttribute('disabled') && el.offsetParent !== null
		);
	const first = focusables()[0];
	if (first) first.focus();
	else {
		node.setAttribute('tabindex', '-1');
		node.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const items = focusables();
		if (items.length === 0) return;
		const firstItem = items[0];
		const lastItem = items[items.length - 1];
		if (event.shiftKey && document.activeElement === firstItem) {
			event.preventDefault();
			lastItem.focus();
		} else if (!event.shiftKey && document.activeElement === lastItem) {
			event.preventDefault();
			firstItem.focus();
		}
	}
	node.addEventListener('keydown', onKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			document.body.style.overflow = previousOverflow;
			if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
				previouslyFocused.focus();
			}
		}
	};
}
