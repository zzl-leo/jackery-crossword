import App from './App.svelte';

const _dom = document.querySelector(".crossword-main");

const app = new App({
	target: document.querySelector(".crossword-main"),
	hydrate: true,
	props: {
		modal_title: _dom.getAttribute("data-modal-title"),
		modal_email: _dom.getAttribute("data-modal-email"),
		modal_email_empty: _dom.getAttribute("data-modal-emailEmpty"),
		modal_email_error: _dom.getAttribute("data-modal-emailError"),
		modal_email_noagree: _dom.getAttribute("data-modal-notagree"),
		modal_email_policy: _dom.getAttribute("data-modal-policy"),
		modal_email_playnow: _dom.getAttribute("data-modal-playnow"),
		modal_correct_words: _dom.getAttribute("data-correct_words"),
		modal_incorrect_words: _dom.getAttribute("data-incorrect_words"),
		btn_reset: _dom.getAttribute("data-btn_reset"),
		btn_check: _dom.getAttribute("data-btn_check"),
		success_title: _dom.getAttribute("data-success_title"),
		success_couponinfo: _dom.getAttribute("data-success_couponinfo"),
		success_copy: _dom.getAttribute("data-success_copy"),
		success_des: _dom.getAttribute("data-success_des"),
		shopurl: _dom.getAttribute("data-shopurl"),
		setting_id: _dom.getAttribute("data-setting_id"),
	}
});

export default app;