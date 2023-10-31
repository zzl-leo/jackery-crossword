<script>
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();
    export let open = false;
    export let correct_num = 0;
    export let error_num = 0;


    let modalIn = false;
    let out = false;

    $: open && openModal();
    $: !open && closeModal();

    function openModal() {
        modalIn = true
        out = false
        dispatch('checkModalEvent', true);
    }
    function closeModal() {
        out = true
        dispatch('checkModalEvent', false);
    }
</script>

<div 
    id="modal-container" 
    class:five="{modalIn}"
    class:out="{out}"
>
  <div class="modal-background">
    <div class="modal">
      <button class="check__close" on:click="{closeModal}">close</button>

      <p class="correct_text">CORRECT WORDS: {correct_num}</p>
      <p class="incorrect_text">INCORRECT WORDS: {error_num}</p>
    </div>
  </div>
</div>

<button class="check__open" on:click="{openModal}">open</button>

<style>
  #modal-container {
    position: absolute;
    display: table;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    transform: scale(0);
    z-index: 99;
  }
  #modal-container.five {
    transform: scale(1);
  }
  #modal-container.five .modal-background {
    background: transparent;
  }
  #modal-container.five .modal-background .modal {
    transform: translateX(-1500px);
    animation: bounce-in-left 1.1s cubic-bezier(0.165, 0.84, 0.44, 1) both;
  }
  #modal-container.five.out {
    animation: quickScaleDown 0s 1.1s linear forwards;
  }
  #modal-container.five.out .modal-background .modal {
    animation: bounce-out-right 1.1s both;
  }
  #modal-container .modal-background {
    display: table-cell;
    text-align: center;
    vertical-align: middle;
  }
  #modal-container .modal-background .modal {
    background: white;
    padding: 50px;
    display: inline-block;
    border-radius: 3px;
    font-weight: 300;
    position: relative;
  }
  #modal-container .modal-background .modal p {
    font-size: 18px;
    line-height: 22px;
  }

  @keyframes scaleDown {
    0% {
      transform: scale(1) translateY(0px);
      opacity: 1;
    }
    100% {
      transform: scale(0.8) translateY(1000px);
      opacity: 0;
    }
  }
  @keyframes quickScaleDown {
    0% {
      transform: scale(1);
    }
    99.9% {
      transform: scale(1);
    }
    100% {
      transform: scale(0);
    }
  }
 
    /**
    * ----------------------------------------
    * animation bounce-in-left
    * ----------------------------------------
    */
    @-webkit-keyframes bounce-in-left {
    0% {
        -webkit-transform: translateX(-600px);
                transform: translateX(-600px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
        opacity: 0;
    }
    38% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
        opacity: 1;
    }
    55% {
        -webkit-transform: translateX(-68px);
                transform: translateX(-68px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    72% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    81% {
        -webkit-transform: translateX(-28px);
                transform: translateX(-28px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    90% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    95% {
        -webkit-transform: translateX(-8px);
                transform: translateX(-8px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    100% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    }
    @keyframes bounce-in-left {
    0% {
        -webkit-transform: translateX(-600px);
                transform: translateX(-600px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
        opacity: 0;
    }
    38% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
        opacity: 1;
    }
    55% {
        -webkit-transform: translateX(-68px);
                transform: translateX(-68px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    72% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    81% {
        -webkit-transform: translateX(-28px);
                transform: translateX(-28px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    90% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    95% {
        -webkit-transform: translateX(-8px);
                transform: translateX(-8px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    100% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    }

    /* ----------------------------------------------
    * Generated by Animista on 2023-10-27 15:12:7
    * Licensed under FreeBSD License.
    * See http://animista.net/license for more info. 
    * w: http://animista.net, t: @cssanimista
    * ---------------------------------------------- */
    @-webkit-keyframes bounce-out-right {
    0% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    5% {
        -webkit-transform: translateX(30px);
                transform: translateX(30px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    15% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    25% {
        -webkit-transform: translateX(38px);
                transform: translateX(38px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    38% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    52% {
        -webkit-transform: translateX(80px);
                transform: translateX(80px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    65% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    85% {
        opacity: 1;
    }
    100% {
        -webkit-transform: translateX(1000px);
                transform: translateX(1000px);
        opacity: 0;
    }
    }
    @keyframes bounce-out-right {
    0% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    5% {
        -webkit-transform: translateX(30px);
                transform: translateX(30px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    15% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    25% {
        -webkit-transform: translateX(38px);
                transform: translateX(38px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    38% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    52% {
        -webkit-transform: translateX(80px);
                transform: translateX(80px);
        -webkit-animation-timing-function: ease-in;
                animation-timing-function: ease-in;
    }
    65% {
        -webkit-transform: translateX(0);
                transform: translateX(0);
        -webkit-animation-timing-function: ease-out;
                animation-timing-function: ease-out;
    }
    85% {
        opacity: 1;
    }
    100% {
        -webkit-transform: translateX(1000px);
                transform: translateX(1000px);
        opacity: 0;
    }
    }


  .check__open, .check__close {display: none;}
  p.correct_text, p.incorrect_text {font-weight: bold;text-align: left;}
  p.correct_text {color: skyblue;}
  p.incorrect_text {color: rgb(231, 64, 64);}
</style>
