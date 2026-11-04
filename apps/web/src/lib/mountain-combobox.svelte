<script lang="ts">
	import { filterComboOptions, type ComboOption } from './combobox-filter';

	// Combobox cari gunung (tambahan B, 1 Nov 2026): pengganti <select>
	// native untuk daftar 125 gunung — ketik untuk filter, bukan scroll.
	// allLabel = null berarti tanpa opsi "semua" (dipakai picker gunung
	// di modal tambah jalur); bila diisi, opsi itu selalu tampil paling
	// atas agar selalu bisa dipilih kembali. Semua string user-facing
	// masuk lewat props (induk memakai $t), komponen ini tanpa i18n.
	interface Props {
		value: string;
		options: ComboOption[];
		allLabel: string | null;
		ariaLabel: string;
		emptyLabel: string;
		onchange: (id: string) => void;
	}
	let {
		value,
		options,
		allLabel,
		ariaLabel,
		emptyLabel,
		onchange
	}: Props = $props();

	let open = $state(false);
	// Nilai awal langsung dari label pilihan (efek tidak jalan di SSR,
	// jadi tanpa ini input SSR tampil kosong).
	let query = $state(labelFor(value));
	let active = $state(0);
	let listboxEl: HTMLElement | undefined = $state();
	let inputEl: HTMLInputElement | undefined = $state();

	function labelFor(id: string): string {
		if (allLabel !== null && id === 'all') return allLabel;
		return options.find((o) => o.id === id)?.label ?? '';
	}

	// Sinkronkan teks input dengan pilihan aktif saat dropdown
	// TERTUTUP (termasuk saat induk mengubah value dari luar, dan
	// saat blur membatalkan ketikan yang tidak jadi dipilih). Saat
	// terbuka, ketikan user tidak boleh ditimpa render induk.
	$effect(() => {
		void value;
		void options;
		if (!open) query = labelFor(value);
	});

	const visible = $derived.by(() => {
		const filtered = filterComboOptions(query, options);
		const all = allLabel !== null ? [{ id: 'all', label: allLabel }] : [];
		// Opsi "semua" selalu di atas (reset selalu terjangkau); opsi
		// gunung di bawahnya mengikuti filter ketikan.
		return [...all, ...filtered];
	});

	function pick(id: string) {
		open = false;
		active = 0;
		query = labelFor(id);
		onchange(id);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			open = true;
			if (visible.length === 0) return;
			active =
				e.key === 'ArrowDown'
					? (active + 1) % visible.length
					: (active - 1 + visible.length) % visible.length;
			listboxEl
				?.querySelector('[data-active="true"]')
				?.scrollIntoView({ block: 'nearest' });
			return;
		}
		if (e.key === 'Enter' && open && visible[active]) {
			e.preventDefault();
			pick(visible[active].id);
		}
	}
</script>

<div class="mountain-combobox">
	<input
		bind:this={inputEl}
		type="text"
		role="combobox"
		aria-label={ariaLabel}
		aria-expanded={open}
		aria-controls="mountain-combobox-list"
		aria-activedescendant={open && visible[active]
			? `mountain-combobox-opt-${visible[active].id}`
			: undefined}
		autocomplete="off"
		spellcheck={false}
		bind:value={query}
		onfocus={() => {
			open = true;
			active = 0;
		}}
		oninput={() => {
			open = true;
			active = 0;
		}}
		onblur={() => {
			open = false;
		}}
		onkeydown={onKeyDown}
	/>
	{#if open}
		<!-- mousedown dicegah supaya klik opsi tidak membuat input blur
		     (dan listbox tertutup) sebelum onclick memilih. -->
		<ul
			bind:this={listboxEl}
			id="mountain-combobox-list"
			role="listbox"
			class="mountain-combobox-list"
			onmousedown={(e) => e.preventDefault()}
		>
			{#if visible.length === 0}
				<li class="muted mountain-combobox-empty">{emptyLabel}</li>
			{:else}
				{#each visible as opt, i (opt.id)}
					<li
						id="mountain-combobox-opt-{opt.id}"
						role="option"
						aria-selected={opt.id === value}
						data-active={i === active ? 'true' : undefined}
						class:active={i === active}
					>
						<button type="button" onclick={() => pick(opt.id)}>
							{opt.label}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.mountain-combobox {
		position: relative;
		width: 100%;
	}
	.mountain-combobox input {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		color: var(--ink);
	}
	.mountain-combobox-list {
		position: absolute;
		z-index: 10;
		left: 0;
		right: 0;
		max-height: 280px;
		overflow: auto;
		overscroll-behavior: contain;
		margin: 4px 0 0;
		padding: 4px;
		list-style: none;
		background: var(--card);
		color: var(--ink);
		border: 1px solid var(--line);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
	}
	.mountain-combobox-list button {
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		border-radius: 6px;
		padding: 8px 10px;
		color: var(--ink);
	}
	.mountain-combobox-list li.active button,
	.mountain-combobox-list button:hover {
		background: var(--card2);
	}
	.mountain-combobox-empty {
		padding: 8px 10px;
	}
</style>
