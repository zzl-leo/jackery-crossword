<script>
  import { fade } from "svelte/transition";
  import Confetti from "./Confetti.svelte";
  import {handleGameGTM} from "./helpers/gtm-event.js"
  import {copyString} from "./helpers/utils"

  import { createEventDispatcher, onMount } from "svelte";
    const dispatch = createEventDispatcher();

  export let showConfetti = true;
  export let outClickClose = true;
  export let funcClose = false;
  export let btnShopNow = true;
  export let showCloseBtn = false;
  export let success_copy;
  export let shopurl;
  export let subscribeModal = false;

  let isOpen = true;

  $: funcClose && (isOpen = false);

  function close() {
    if(outClickClose) {
      isOpen = false
    }

    dispatch('messageClose', false);
  }
  
  function handleGTM_shopnow() {
    const code = document.querySelector(".coupone_info .coupone_info_title").innerText.replace("CODE:", "") || ""
    copyString(code.trim())

    handleGameGTM({
      button_name: success_copy
    })

    setTimeout(() => {
      window.location.href = shopurl
    }, 20);
  }

  onMount(async () => {
    setTimeout(() => {
      document.querySelector(".confetti").style.display ="none"
    }, 1200);
  })
</script>

{#if isOpen}
  <div 
    class="completed" 
    class:issubscribeModal="{subscribeModal}"
    transition:fade="{{ y: 20 }}"
  >
    {#if showCloseBtn}
    <svg on:click="{close}" class="close_icon" fill-rule="evenodd" viewBox="64 64 896 896" focusable="false" data-icon="close" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z"></path></svg>
    {/if}

    <div class="content">
      <div class="message">
        <slot name="message" />
      </div>

      {#if showConfetti}
        <button on:click="{close}">
          {#if btnShopNow}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <span on:click="{handleGTM_shopnow}">{success_copy}</span>
          {/if}

          {#if !btnShopNow}
            CLOSE
          {/if}
        </button>
      {/if}
    </div>

    <div class="footer">
      <slot name="footer" />
    </div>

    {#if showConfetti}
      <div class="confetti">
        <Confetti />
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="curtain 888"
    transition:fade="{{ duration: 250 }}"
    on:click="{(e) => {e.stopPropagation();e.preventDefault();close()}}"></div>
{/if}

<style>
  .completed {
    position: absolute;
    top: min(50%, 40em);
    left: 50%;
    max-width: 80%;
    width: 680px;
    transform: translate(-50%, -50%);
    border-radius: 18px;
    z-index: 998;
    box-shadow: 0 3px 6px 3px rgba(0, 0, 0, 0.2);
    background: linear-gradient(180deg, rgba(255, 201, 92, 1) 0%, rgba(255, 255, 255, 1) 155.03%);
  }

  .curtain {
    position: absolute;
    top: 0;
    right: -100px;
    bottom: -50px;
    left: -100px;
    background-color: var(--bg-color);
    opacity: 0.96;
    cursor: pointer;
    z-index: 997;
  }

  button {
    cursor: pointer;
    margin-left: 1em;
    font-size: 1em;
    background-color: rgb(253, 80, 0);
    border-radius: 30px;
    color: #fff;
    padding: 12px 24px;
    border: none;
    font-weight: 600;
    transition: all .3s;
    position: relative;
  }
  button span {
    text-decoration: none;
    color: #fff;
    display: block;
    margin: -12px -24px;
    padding: 12px 24px;
  }

  button:active {
    opacity: 0.6;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
  }

  .message {
    margin-bottom: 1em;
  }

  .confetti {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .close_icon {
    display: none;
  }

  @media only screen and (max-width: 1024px) {
    .completed {
      top: min(50%, 40em);
      left: 50%;
      max-width: 100%;
      width: 100%;
      transform: translate(-50%, -36%);
    }
    .curtain {
      right: -4.8%;
      bottom: -180px;
      left: -4.8%;
      top: -20px;
      background-color: var(--bg-color);
      opacity: 0.9;
      cursor: pointer;
      z-index: 996;
    }
    button {
      cursor: pointer;
      margin-left: 1em;
      font-size: 15px;
      border-radius: 30px;
      color: #fff;
      padding: 12px 24px;
    }

    .close_icon {
      display: block;
      position: absolute;
      right: 12px;
      top: 12px;
      fill: #666;
      transition: all .3s;
      z-index: 99;
    }
    .close_icon:active {
      color: #000;
    }
  }
</style>
