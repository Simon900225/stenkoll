<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children, data } = $props();

	onMount(() => {
		if (!data.supabase) return;
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((_event, _session) => {
			invalidate('supabase:auth');
		});
		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Figtree:wght@400;500;600&display=swap"
		rel="stylesheet"
	/>
	<title>Fornsök Boulder Finder</title>
</svelte:head>

{@render children()}
