<script lang="ts">
	import type { Snippet } from 'svelte';

	// Grid wrapper for StatCard children, breakpoints per desain 11
	// (design/dashboard/index.html): 4 columns desktop, 2 columns at
	// <=1180px, STILL 2 columns at <=760px (gap 10px), gap 8px at
	// <=420px — never 1 column.
	let { children }: { children?: Snippet } = $props();
</script>

<div class="stats">
	{@render children?.()}
</div>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 14px;
	}
	@media (max-width: 1180px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 760px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
			gap: 10px;
		}
	}
	@media (max-width: 420px) {
		.stats {
			gap: 8px;
		}
	}
</style>
