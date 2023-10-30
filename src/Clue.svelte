<script>
  import scrollTo from "./helpers/scrollTo.js";
  import ZModle from './themes/modal.js'

  export let number;
  export let direction;
  export let clue;
  export let custom;
  export let isFilled;
  export let isNumberFocused = false;
  export let isDirectionFocused = false;
  export let isDisableHighlight = false;
  export let onFocus = () => {};

  let element;

  $: isFocused = isNumberFocused;
  $: clueClass = `clue--${direction}--${number}`;

  function handleShare(el) {
    console.log("分享了。。。")
    console.log(el)
    setTimeout(() => {
      el.querySelector(".modal-content-body").innerHTML = `<h1>提示答案是：xxxx</h1>`
    }, 2000);
  }

  function handleOpenHelp() {
    ZModle.getInstance(`<h1 id="xxl">345</h1>`, {
      header: "想要解锁活动提示？您需要点击下列按钮分享这个游戏到社媒",
      id: `cell_modal_${clueClass}`,
      class: "",
      cb: (el) => {
        el.querySelector("#xxl").removeEventListener("click", () => {handleShare(el)})

        setTimeout(() => {
          el.querySelector("#xxl").addEventListener("click", () => {handleShare(el)})
        }, 0);
      }
    })
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<li class="{clueClass}" bind:this="{element}" use:scrollTo="{isFocused}" on:click="{onFocus}">
  <button
    class="clue {custom}"
    class:is-disable-highlight="{isDisableHighlight}"
    class:is-number-focused="{isNumberFocused}"
    class:is-direction-focused="{isDirectionFocused}"
    class:is-filled="{isFilled}"
    on:click="{handleOpenHelp}"
    >
    <!-- <strong>{number}</strong> -->
    <!-- {clue} -->
    <!-- <svg class="modal_icon" viewBox="64 64 896 896" focusable="false" data-icon="question" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M764 280.9c-14-30.6-33.9-58.1-59.3-81.6C653.1 151.4 584.6 125 512 125s-141.1 26.4-192.7 74.2c-25.4 23.6-45.3 51-59.3 81.7-14.6 32-22 65.9-22 100.9v27c0 6.2 5 11.2 11.2 11.2h54c6.2 0 11.2-5 11.2-11.2v-27c0-99.5 88.6-180.4 197.6-180.4s197.6 80.9 197.6 180.4c0 40.8-14.5 79.2-42 111.2-27.2 31.7-65.6 54.4-108.1 64-24.3 5.5-46.2 19.2-61.7 38.8a110.85 110.85 0 00-23.9 68.6v31.4c0 6.2 5 11.2 11.2 11.2h54c6.2 0 11.2-5 11.2-11.2v-31.4c0-15.7 10.9-29.5 26-32.9 58.4-13.2 111.4-44.7 149.3-88.7 19.1-22.3 34-47.1 44.3-74 10.7-27.9 16.1-57.2 16.1-87 0-35-7.4-69-22-100.9zM512 787c-30.9 0-56 25.1-56 56s25.1 56 56 56 56-25.1 56-56-25.1-56-56-56z"></path></svg> -->

    <svg class="modal_icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 29" fill="none">
      <g clip-path="url(#clip0_1554_302)">
        <path d="M13.7995 25.7885C20.0747 25.7885 25.1615 20.7017 25.1615 14.4264C25.1615 8.15119 20.0747 3.0644 13.7995 3.0644C7.52423 3.0644 2.43745 8.15119 2.43745 14.4264C2.43745 20.7017 7.52423 25.7885 13.7995 25.7885ZM13.7995 28.0609C6.26986 28.0609 0.165039 21.9561 0.165039 14.4264C0.165039 6.89682 6.26986 0.791992 13.7995 0.791992C21.3291 0.791992 27.4339 6.89682 27.4339 14.4264C27.4339 21.9561 21.3291 28.0609 13.7995 28.0609Z" fill="#A48F86"/>
        <path d="M14.0384 6.97314C12.3796 6.97314 11.0616 7.45035 10.1072 8.42749C9.13004 9.3819 8.65283 10.6772 8.65283 12.336H11.0616C11.0616 11.3362 11.2661 10.5408 11.6751 9.99545C12.1296 9.35917 12.8795 9.04104 13.9021 9.04104C14.7202 9.04104 15.3564 9.26828 15.8109 9.72276C16.2427 10.1772 16.4699 10.7908 16.4699 11.5861C16.4699 12.177 16.2654 12.7223 15.8564 13.245L15.4701 13.6768C14.0612 14.9266 13.1976 15.8583 12.8795 16.4945C12.5841 17.0854 12.4478 17.8125 12.4478 18.6533V19.0396H14.8792V18.6533C14.8792 18.0852 14.9929 17.5853 15.2428 17.1308C15.4473 16.7218 15.7655 16.3355 16.1745 15.9719C17.2653 15.0402 17.9015 14.4494 18.1061 14.1994C18.6514 13.4722 18.9468 12.5405 18.9468 11.4271C18.9468 10.0636 18.4924 8.97286 17.6061 8.17752C16.6972 7.35945 15.5155 6.97314 14.0384 6.97314ZM13.6521 20.2667C13.1749 20.2667 12.7886 20.4031 12.4932 20.7212C12.1523 21.0166 11.9933 21.4029 11.9933 21.8801C11.9933 22.3346 12.1523 22.7209 12.4932 23.0391C12.7886 23.3572 13.1749 23.5163 13.6521 23.5163C14.1066 23.5163 14.5156 23.3572 14.8565 23.0618C15.1746 22.7437 15.3337 22.3574 15.3337 21.8801C15.3337 21.4029 15.1746 21.0166 14.8565 20.7212C14.5384 20.4031 14.1293 20.2667 13.6521 20.2667Z" fill="#A48F86"/>
      </g>
      <defs>
        <clipPath id="clip0_1554_302">
          <rect width="27.2689" height="27.2689" fill="white" transform="translate(0.165039 0.791992)"/>
        </clipPath>
      </defs>
    </svg>
  </button>
</li>

<style>
  li {
    display: inline-block;
    position: absolute;
    background-repeat: no-repeat;
    background-size: cover;

    cursor: pointer;
  }
  .clue--down--1 {
    top: 170px;
    left: 406px;
    background-image: url('https://cdn.shopify.com/s/files/1/0970/9262/files/Layer_1.png?v=1698645100');
    width: 61px;
    height: 59px;
  }
  .clue--across--2 {
    top: 260px;
    right: 46px;
    height: 78px;
    width: 50px;
    background-image: url("https://cdn.shopify.com/s/files/1/0970/9262/files/Frame.png?v=1698645099");
  }
  .clue--down--3 {
    top: 800px;
    right: 200px;
    height: 180px;
    width: 212px;
    background-image: url("https://cdn.shopify.com/s/files/1/0970/9262/files/image.png?v=1698645099");
  }
  .clue--down--4 {
    top: 800px;
    left: 180px;
    height: 116px;
    width: 126px;
    background-image: url("https://cdn.shopify.com/s/files/1/0970/9262/files/Frame_1_56182278-936d-44d5-a3b6-8cee7d1f5666.png?v=1698645100");
  }
  .clue--across--6 {
    top: 400px;
    left: -50px;
    background-image: url('https://cdn.shopify.com/s/files/1/0970/9262/files/c1495b36ce3b67e4c4a05acbcf689d20.png?v=1698645099');
    width: 108px;
    height: 122px;
  }
  .clue--across--5 {
    top: 330px;
    right: -66px;
    height: 168px;
    width: 162px;
    background-image: url("https://www.crosswords-for-kids.com/crosswords/farm-animals/donkey.png");
  }

  button {
    display: flex;
    width: 100%;
    background: none;
    text-align: left;
    appearance: none;
    outline: none;
    border: none;
    border-left: 6px solid transparent;
    padding: 0.5em;
    cursor: pointer;
    line-height: 1.325;
    color: var(--main-color);
    font-family: var(--font);
    font-size: 1em;
    cursor: pointer;



    position: absolute;
    right: 0;
    width: 20px;
    height: 20px;
    font-size: 16px;
    border: solid 2px #e9a209;
    padding: 0;
    text-align: center;
    line-height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;

    border: none;
  }

  .clue--down--1 button {
    right: -20px;
    top: 0;
  }
  .clue--across--2 button {
    top: -6px;
    right: -15px;
  }
  .clue--down--3 button {
    top: -10px;
    right: -10px;
  }
  .clue--down--4 button {
    top: -5px;
    right: -10px;
  }
  .clue--across--6 button {
    right: 5px;
    top: -25px;
  }
  .clue--across--5 button {
    left: 20px;
    top: 80px;
  }

  strong {
    min-width: 1.25em;
    display: inline-block;
    text-align: right;
    margin-right: 0.5em;


    min-width: unset;
    margin: 0;
    padding: 0;
    line-height: 20px;
    text-align: center;
    color: #e9a209;
  }

  .clue:focus:not(.is-disable-highlight) {
    border-color: #e9a209;
  }
  .is-number-focused:not(.is-disable-highlight) {
    border-left-color: #e9a209;
  }
  .is-number-focused.is-direction-focused:not(.is-disable-highlight) {
    border-color: #e9a209;
    animation: breathe 0.8s ease-in-out infinite;
  }
  .is-filled {
    opacity: 0.5;
  }

  @keyframes breathe {
    0% { transform: scale(1); }
    50% { transform: scale(1.35); }
    100% { transform: scale(1); }
  }

  .modal_icon {
    position: absolute;
    color: #333;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    color: #e9a209;
    fill: #e9a209;
    transition: all .3s;
  }
  .modal_icon path {
    fill: #e9a209;
  }
  .modal_icon:hover path {
    fill: #fd5000;
  }


  @media only screen and (max-width: 1024px) {
    .clue--down--1 {
      top: 46px;
      left: 136px;
      width: 24px;
      height: 23px;
    }
    .clue--across--2 {
      top: 82px;
      right: 16px;
      height: 27px;
      width: 18px;
    }
    .clue--down--3 {
      top: 274px;
      left: 190px;
      height: 62px;
      width: 73px;
    }
    .clue--down--4 {
      top: 274px;
      left: 55px;
      height: 40px;
      width: 44px;
    }
    .clue--across--6 {
      top: 126px;
      left: -12px;
      width: 37px;
      height: 42px;
    }
    .clue--across--5 {
      top: 130px;
      right: -10px;
      height: 42px;
      width: 40px;
    }

    button {
      width: 10px;
      height: 10px;
      font-size: 12px;
      line-height: 10px;
      border: none;
    }
    .clue--down--1 button {
      top: -6px;
      right: -10px;
    }
    .clue--across--2 button {
      top: -6px;
      right: -6px;
    }
    .clue--down--3 button {
      top: -10px;
      right: -4px;
    }
    .clue--down--4 button {
      top: -5px;
      right: -10px;
    }
    .clue--across--5 button {
      left: unset;
      right: 15px;
      top: 0;
    }
    .clue--across--6 button {
      right: px;
      top: -10px;
    }
  }
</style>
