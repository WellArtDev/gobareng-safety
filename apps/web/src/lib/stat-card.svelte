<script lang="ts">
	// Generic statistic card for dashboard pages. It renders only what
	// it is given — label, value, icon and tone are all props, so the
	// card itself never contains demo or placeholder numbers.
	// Colors come from the layout tokens so dark mode follows along
	// (desain 11 .stat); at <=760px the card stacks vertically with the
	// reference's compact sizes.
	let {
		icon,
		label,
		value,
		hint = '',
		delta = '',
		tone = 'green'
	}: {
		/** Glyph or short text shown in the coloured icon tile. */
		icon: string;
		/** Card label (already translated by the caller). */
		label: string;
		/** Card value (already formatted by the caller). */
		value: string;
		/** Optional small note under the value. */
		hint?: string;
		/** Optional growth delta ("↑ 12%") shown green/bold before the hint. */
		delta?: string;
		tone?: 'green' | 'blue' | 'orange' | 'purple';
	} = $props();
</script>

<div class="stat">
	<span class="stat-ic {tone}" aria-hidden="true">{icon}</span>
	<div class="stat-text">
		<small>{label}</small>
		<strong>{value}</strong>
		{#if delta || hint}
			<em>
				{#if delta}<span class="up">{delta}</span>{/if}{delta && hint ? ' ' : ''}{hint}
			</em>
		{/if}
	</div>
</div>

<style>
	.stat {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		gap: 14px;
		align-items: flex-start;
		box-shadow: var(--shadow);
		text-align: left;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	.stat:hover {
		border-color: #bfe8d6;
	}
	.stat-ic {
		width: 48px;
		height: 48px;
		flex: 0 0 48px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		font-size: 22px;
		/* Icon tiles keep white glyphs in both themes, as in desain 11. */
		color: #fff;
	}
	.green {
		background: var(--stat-green);
	}
	.blue {
		background: var(--blue);
	}
	.orange {
		background: var(--orange);
	}
	.purple {
		background: var(--purple);
	}
	.stat-text small {
		color: var(--muted);
		font-weight: 700;
		font-size: 12px;
		display: block;
	}
	.stat-text strong {
		font-size: 22px;
		letter-spacing: -0.03em;
		display: block;
		margin: 2px 0;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.stat-text em {
		font-style: normal;
		font-size: 12px;
		color: var(--muted);
		display: block;
	}
	.stat-text em .up {
		color: var(--green-d);
		font-weight: 800;
	}
	@media (max-width: 760px) {
		.stat {
			flex-direction: column;
			padding: 12px;
			gap: 8px;
		}
		.stat-ic {
			width: 36px;
			height: 36px;
			flex-basis: 36px;
			font-size: 17px;
			border-radius: 10px;
		}
		.stat-text strong {
			font-size: 20px;
		}
		.stat-text small {
			font-size: 11px;
		}
		.stat-text em {
			font-size: 10.5px;
			line-height: 1.4;
		}
	}
	@media (max-width: 420px) {
		.stat {
			padding: 10px;
		}
		.stat-text strong {
			font-size: 18px;
		}
	}
</style>
