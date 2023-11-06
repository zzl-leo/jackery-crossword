import App from './App.svelte';

const app = new App({
	target: document.querySelector(".crossword-main"),
	hydrate: true
});

export default app;