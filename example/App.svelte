<script>
  import Crossword from "../src/Crossword.svelte";
  import jac from './data/jackery.data.json'
  export let modal_title;
  export let modal_email;
  export let modal_email_empty;
  export let modal_email_error;
  export let modal_email_noagree;
  export let modal_email_policy;
  export let modal_email_playnow;
  export let modal_correct_words;
  export let modal_incorrect_words;
  export let btn_reset;
  export let btn_check;
  export let success_title;
  export let success_couponinfo;
  export let success_copy; 
  export let success_des; 
  export let shopurl; 
  export let setting_id; 

  window.fbAsyncInit = function () {
		FB.init({
			appId: '855600322936840',
			xfbml: true,
			version: 'v2.9'
		});
		FB.AppEvents.logPageView();
	};

</script>

<article>
  <section id="default">
    <Crossword 
      modal_title="{modal_title}" 
      modal_email="{modal_email}"
      modal_email_empty="{modal_email_empty}"
      modal_email_error="{modal_email_error}"
      modal_email_noagree="{modal_email_noagree}"
      modal_email_policy="{modal_email_policy}"
      modal_email_playnow="{modal_email_playnow}"
      modal_correct_words="{modal_correct_words}"
      modal_incorrect_words="{modal_incorrect_words}"
      btn_reset="{btn_reset}"
      btn_check="{btn_check}"
      success_title="{success_title}"
      success_couponinfo="{success_couponinfo}"
      success_copy="{success_copy}"
      success_des="{success_des}"
      shopurl="{shopurl}"
      setting_id="{setting_id}"
      data="{jac}" />
  </section>
</article>

<style>
  article {
    max-width: 988px;
    margin: 0 auto;
  }
  section {
    max-width: 100%;
    margin: 0 0;
    background-image: url(https://cdn.shopify.com/s/files/1/0970/9262/files/Group_538.png?v=1698649582);
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center center;
    overflow: visible;
  }

@media screen and (max-width: 1024px) {
  article {
    max-width: 94vw;
  }
  section {
    max-width: 100%;
    width: 342px;
    margin: 0 auto;
  }
}
</style>
