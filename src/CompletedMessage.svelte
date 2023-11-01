<script>
  import { fade } from "svelte/transition";
  import Confetti from "./Confetti.svelte";
  import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();

  export let showConfetti = true;
  export let outClickClose = true;
  export let funcClose = false;
  export let btnShopNow = true;

  let isOpen = true;

  $: funcClose && (isOpen = false);

  function close() {
    if(outClickClose) {
      isOpen = false
    }

    dispatch('messageClose', false);
  }
</script>

{#if isOpen}
  <div class="completed" transition:fade="{{ y: 20 }}">
    <div class="content">
      <div class="message">
        <slot name="message" />
      </div>

      {#if outClickClose}
        <button on:click="{close}">
          {#if btnShopNow}
            SHOP NOW
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
    class="curtain"
    transition:fade="{{ duration: 250 }}"
    on:click="{close}"></div>
{/if}

<style>
  .completed {
    position: absolute;
    top: min(50%, 20em);
    left: 50%;
    max-width: 80%;
    width: 680px;
    transform: translate(-50%, -50%);
    border-radius: 18px;
    z-index: 1000;
    box-shadow: 0 3px 6px 3px rgba(0, 0, 0, 0.2);
    background: linear-gradient(180deg, rgba(255, 201, 92, 0.70) 0%, rgba(255, 255, 255, 0.00) 155.03%);
    backdrop-filter: blur(5.838780879974365px)
  }

  .curtain {
    position: absolute;
    top: 0;
    right: -100px;
    bottom: -50px;
    left: -100px;
    background-color: var(--bg-color);
    opacity: 0.9;
    cursor: pointer;
    z-index: 999;
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
  }

  button:active {
    opacity: 0.6;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
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

  @media only screen and (max-width: 1024px) {
    .completed {
      top: min(50%, 20em);
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
      z-index: 999;
      pointer-events: none;
    }
    button {
      cursor: pointer;
      margin-left: 1em;
      font-size: 15px;
      border-radius: 30px;
      color: #fff;
      padding: 12px 24px;
    }
  }
</style>
