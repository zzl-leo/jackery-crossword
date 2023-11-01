<script>
  import { onMount } from "svelte";
  import Toolbar from "./Toolbar.svelte";
  import Puzzle from "./Puzzle.svelte";
  import Clues from "./Clues.svelte";
  import CompletedMessage from "./CompletedMessage.svelte";
  import CheckModal from "./CheckModal.svelte";
  import {footerPhoneSubs, createCoupons} from "./themes/fetch.js"

  import createClues from "./helpers/createClues.js";
  import createCells from "./helpers/createCells.js";
  import validateClues from "./helpers/validateClues.js";
  import { fromPairs } from "./helpers/utils.js";
  import themeStyles from "./helpers/themeStyles.js";

  export let data = [];
  export let actions = ["clear", "reveal", "check"];
  export let theme = "classic";
  export let revealDuration = 1000;
  export let breakpoint = 720;
  export let revealed = false;
  export let disableHighlight = false;
  export let showCompleteMessage = true;
  export let showConfetti = true;
  export let showKeyboard;
  export let keyboardStyle = "outline";

  let checkModal = false
  let error_num = 0
  let correct_num = 0

  let width = 0;
  let focusedDirection = "across";
  let focusedCellIndex = 0;
  let isRevealing = false;
  let isLoaded = false;
  let isChecking = false;
  let revealTimeout;
  let clueCompletion;

  let originalClues = [];
  let validated = [];
  let clues = [];
  let cells = [];

  // 订阅相关
  let isSubscribe = window.localStorage.getItem("__jky_cwd") || false
  let subscribe_email = ''
  let subscribe_error = false
  let subscribe_error_txt = ''
  let subscribeModalClose = false
  let subscribeLoading = false
  let coupons_api_error = ""
  let coupons_code = ""

  const onDataUpdate = () => {
    originalClues = createClues(data);
    validated = validateClues(originalClues);
    clues = originalClues.map((d) => ({ ...d }));
    cells = createCells(originalClues);
    reset();
  };

  $: data, onDataUpdate();
  $: focusedCell = cells[focusedCellIndex] || {};
  $: cellIndexMap = fromPairs(cells.map((cell) => [cell.id, cell.index]));
  $: percentCorrect =
    cells.filter((d) => d.answer === d.value).length / cells.length;
  $: isComplete = percentCorrect == 1;
  $: isDisableHighlight = isComplete && disableHighlight;
  $: cells, (clues = checkClues());
  $: cells, (revealed = !clues.filter((d) => !d.isCorrect).length);
  $: stacked = width < breakpoint;
  $: inlineStyles = themeStyles[theme];

  $: isComplete, handleComplete();

  onMount(() => {
    isLoaded = true;
  });

  function checkClues() {
    return clues.map((d) => {
      const index = d.index;
      const cellChecks = d.cells.map((c) => {
        const { value } = cells.find((e) => e.id === c.id);
        const hasValue = !!value;
        const hasCorrect = value === c.answer;
        const isError = value && (value !== c.answer);

        return { hasValue, hasCorrect, isError };
      });

      const isCorrect = cellChecks.filter((c) => c.hasCorrect).length === d.answer.length;
      const hasError = cellChecks.filter(c => c.isError).length > 0

      return {
        ...d,
        isCorrect,
        hasError,
      };
    });
  }

  function getCheckRes() { // 返回错误 and 正确的单词数量
    const list = checkClues()
    return {
      error: list.filter((item) => {
        return item.hasError
      }),
      correct: list.filter((item) => {
        return item.isCorrect
      })
    }
  }

  function reset() {
    isRevealing = false;
    isChecking = false;
    focusedCellIndex = 0;
    focusedDirection = "across";
  }

  function onClear() {
    reset();
    if (revealTimeout) clearTimeout(revealTimeout);
    cells = cells.map((cell) => ({
      ...cell,
      value: cell.show ? cell.answer : "",
    }));
  }

  function onReveal() {
    if (revealed) return true;
    reset();
    cells = cells.map((cell) => ({
      ...cell,
      value: cell.answer,
    }));
    startReveal();
  }

  function onCheck() {
    isChecking = true;
    const res = getCheckRes() || {error: '', correct: ''}
    console.info("check resaults: 错误单词数：", res.error.length, "正确单词数：", res.correct.length)
    error_num = res.error.length
    correct_num = res.correct.length
    checkModal = true
    setTimeout(() => {
      isChecking = false
      checkModal = false
    }, 3500);
  }

  function startReveal() {
    isRevealing = true;
    isChecking = false;
    if (revealTimeout) clearTimeout(revealTimeout);
    revealTimeout = setTimeout(() => {
      isRevealing = false;
    }, revealDuration + 250);
  }

  function onToolbarEvent({ detail }) {
    if (detail === "clear") onClear();
    else if (detail === "reveal") onReveal();
    else if (detail === "check") onCheck();
  }

  function verifyEmail(str) {
    const reg = /^[A-Za-z0-9._%+!`#$^-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,8}$/;
    return reg.test(str)
  }

  function handleEmail() {
    subscribe_error = !verifyEmail(subscribe_email)
    if(subscribe_error) {
      subscribe_error_txt = subscribe_email === "" ? "The phone field is required when email is not present." : "The email must be a valid email address."
    }
    return subscribe_error
  }

  function handSubscribe() {
    if(!handleEmail()) {
      subscribeLoading = true
      footerPhoneSubs({
        email: subscribe_email,
        tags: "CP_games"
      }).then(() => {
        subscribeModalClose = true
        subscribeLoading = false
        window.localStorage.setItem("__jky_cwd", '1')
        window.localStorage.setItem("__jky_cwd_email", subscribe_email)
      }).catch(e => {
        subscribe_error_txt = e.message || 'Server Error'
        subscribeLoading = false
      })
    }
  }

  function handleComplete() {
    const email = window.localStorage.getItem("__jky_cwd_email") || false
    if(!isComplete || !email) return
    createCoupons({
      email
    }).then(res => {
      coupons_code = res.data
      console.log(res)
    }).catch(e => {
      coupons_api_error = e.message
    })
  }
</script>

{#if validated}
  <article
    class="svelte-crossword"
    bind:offsetWidth="{width}"
    style="{inlineStyles}">

    <slot
      name="toolbar"
      onClear="{onClear}"
      onReveal="{onReveal}"
      onCheck="{onCheck}">
      <Toolbar actions="{actions}" on:event="{onToolbarEvent}" />
      <CheckModal open="{checkModal}" error_num = "{error_num}" correct_num="{correct_num}"></CheckModal>
    </slot>

    <div class="play" class:stacked class:is-loaded="{isLoaded}">
      <Clues
        clues="{clues}"
        cellIndexMap="{cellIndexMap}"
        stacked="{stacked}"
        isDisableHighlight="{isDisableHighlight}"
        isLoaded="{isLoaded}"
        bind:focusedCellIndex
        bind:focusedCell
        bind:focusedDirection />
      <Puzzle
        clues="{clues}"
        focusedCell="{focusedCell}"
        isRevealing="{isRevealing}"
        isChecking="{isChecking}"
        isDisableHighlight="{isDisableHighlight}"
        revealDuration="{revealDuration}"
        showKeyboard="{showKeyboard}"
        stacked="{stacked}"
        isLoaded="{isLoaded}"
        keyboardStyle="{keyboardStyle}"
        bind:cells
        bind:focusedCellIndex
        bind:focusedDirection>
      </Puzzle>
    </div>

    {#if isComplete && !isRevealing && showCompleteMessage}
      <CompletedMessage showConfetti="{showConfetti && !coupons_api_error}" btnShopNow="{!coupons_api_error}">
        <slot name="message" slot="message">
          {#if coupons_api_error === ""}
          <h3 class="title_gameend">Congratulations 🎉 You have successfully filled in the word:</h3>
          <div class="coupon_gameend">
            <img src="https://cdn.shopify.com/s/files/1/0970/9262/files/Group_552.png?v=1698821612" alt="coupon">
            <div class="coupone_info">
              <div class="coupone_info_title">CODE: {coupons_code}</div>
              <div class="coupone_info_des">2% off stackable coupon</div>
            </div>
          </div>
          {/if}

          {#if coupons_api_error !== ""}
            <h3 class="title_gameend">{coupons_api_error}</h3>
          {/if}
        </slot>
        
        <slot name="footer" slot="footer">
          {#if coupons_api_error === ""}
          <div class="footer_gameend">
            This code will be sent to the email you provided.<br>
            Use the stackable coupon code to earn up to 52% off during the Black Friday Sale.
          </div>
          {/if}
        </slot>
      </CompletedMessage>
    {/if}

    {#if !isComplete && !isRevealing && !isSubscribe}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <CompletedMessage showConfetti="{false}" outClickClose="{false}" funcClose="{subscribeModalClose}">
        <slot name="message" slot="message">
          <div class="crossword_subscribe_container">
            <h3>
              Subscribe to solve the crossword puzzle<br>
              Win up to <strong>52% </strong> off
            </h3>
            <input on:input="{handleEmail}" on:change="{handleEmail}" bind:value="{subscribe_email}" type="text" placeholder="Email">
            <div class="error__tips" class:active="{subscribe_error}">{subscribe_error_txt}</div>
            <div 
              class="crossword_subscribe_submit" 
              class:loading="{subscribeLoading}"
              on:click="{handSubscribe}"
            >
              PLAY NOW
              {#if subscribeLoading}
              <span class="crossword_submit_loading">
                <svg class="anticon-loading" viewBox="0 0 1024 1024" focusable="false" data-icon="loading" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"></path></svg>
                Loading
              </span>
              {/if}
            </div>

            <svg class="crossword_subscribe_icon" xmlns="http://www.w3.org/2000/svg" width="101" height="178" viewBox="0 0 101 178" fill="none">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M84.3672 20.2232C83.8654 19.3658 83.8488 18.3209 84.1549 17.3752C86.6335 9.69678 75.7514 8.42302 72.3299 7.30917C68.7595 6.14569 70.4909 0.0332954 63.6727 0.00021073C56.8572 -0.0328739 55.9226 3.84079 55.5973 3.84079C55.1203 3.84079 58.3047 9.53687 58.3047 9.53687C58.3047 9.53687 61.6931 9.51757 63.6534 15.6713C65.6164 21.8278 65.0402 25.5499 70.4137 29.1285C75.7872 32.7072 88.7757 21.5356 88.7757 21.5356C86.2668 22.3296 84.9985 21.3067 84.3644 20.2232H84.3672Z" fill="#5C3420"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M56.0108 171.39C56.0108 171.39 61.1059 137.324 54.5275 123.842L58.12 77.6279L36.5791 79.114L51.095 171.66L56.0108 171.393V171.39Z" fill="#E3633D"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M50.935 170.053L46.6588 173.166C45.8179 173.935 41.2329 175.429 41.2329 175.429C40.7752 176.386 41.6685 176.888 42.4267 177.014L55.9611 176.73C55.9611 176.73 59.0849 176.082 56.314 170.058C53.852 171.145 51.5774 171.925 50.935 170.05V170.053Z" fill="#4A2A1A"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M35.0793 86.3373L39.4879 125.383L46.6176 164.712H59.0685C59.0685 164.712 58.3654 157.05 58.5391 154.886C58.7128 152.722 61.0012 133.24 56.1956 123.795L57.406 85.116L35.0793 86.3401V86.3373Z" fill="#C9D9B9"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M71.9355 128.234L91.8746 165.242C95.7455 166.642 95.9909 164.392 94.8991 160.795C90.3251 145.187 92.3322 135.661 79.4568 121.746L71.9355 128.234Z" fill="#E3633D"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M52.7629 83.2027L64.5218 121.746C65.0043 123.555 66.0988 126.152 66.959 127.815L85.9303 161.404L95.9164 155.664C95.9164 155.664 94.0388 151.013 93.628 148.961C91.2322 137.04 88.6516 131.848 79.3134 118.642L75.1916 79.114L65.0015 79.5221L52.7657 83.2027H52.7629Z" fill="#C9D9B9"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M91.6815 165.145L91.5299 170.433C91.6264 171.569 90.0024 176.113 90.0024 176.113C90.4794 177.058 91.4251 176.659 91.9875 176.137L100.038 165.255C100.038 165.255 101.436 162.385 94.9734 160.896C94.3283 163.51 93.5535 165.785 91.6787 165.148L91.6815 165.145Z" fill="#4A2A1A"/>
              <path d="M23.7476 34.957C18.2225 28.5634 16.4139 25.8615 11.0128 19.3135L5.20093 20.0027C14.0731 34.764 14.3213 40.7303 20.6542 44.4303C28.0073 41.8414 24.6906 36.7105 23.7449 34.9543L23.7476 34.957Z" fill="#C95836"/>
              <path d="M10.9964 19.3326L7.82308 16.4846C7.18896 15.9166 6.37287 15.5913 5.52094 15.5748L2.07186 15.5031C0.869781 15.4783 0.0123394 16.661 0.412113 17.7969L4.60008 21.1523C5.5237 21.8912 6.76989 22.2854 8.09052 22.2496L10.2879 22.1917L10.9964 19.3354V19.3326Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M44.8721 19.6499C44.8721 19.6499 17.1995 37.2565 18.6277 40.9206L19.2149 42.5555C19.9786 44.6785 22.5344 45.5194 24.4092 44.2621L38.3764 34.8937L41.1363 33.1347L44.8721 19.6499Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M67.3973 54.7278L37.9574 56.9693C33.1684 58.7283 35.0818 86.3374 35.0818 86.3374L54.4391 87.2335C63.4326 87.046 74.0694 94.0986 75.1887 79.114C76.468 61.9844 67.3973 54.7278 67.3973 54.7278Z" fill="#C9D9B9"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M44.8723 19.6498L55.6717 18.2686L58.6383 18.354L69.9478 22.1615C73.7635 23.9977 75.5694 28.3897 74.1633 32.3985L71.5441 45.3235C74.5769 55.0201 76.1649 61.8218 75.7624 71.8382C59.8514 77.9423 37.886 77.8871 32.7661 70.6113C33.4002 50.5647 37.2298 32.6273 44.8723 19.6498Z" fill="#8CA671"/>
              <path d="M49.7797 19.0515C49.7797 19.0515 46.3307 27.8575 52.3548 28.1801C58.379 28.4999 61.5744 19.3492 61.5744 19.3492L57.1576 17.4441L49.7797 19.0515Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M7.07593 24.2623L12.6921 20.3639L23.304 32.7458L41.2359 21.089C41.2359 21.089 43.1686 19.8648 44.8724 19.647C46.5763 19.4292 39.4686 35.1306 39.4686 35.1306L25.9949 45.0175C25.9949 45.0175 19.9845 48.7726 16.869 42.9028C13.7563 37.033 7.07593 24.2623 7.07593 24.2623Z" fill="#8CA671"/>
              <path d="M38.0513 35.9827L40.5409 29.6084" stroke="#3A6B26" stroke-width="0.725106" stroke-linecap="round" stroke-linejoin="round"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M80.1929 55.4225C84.0059 54.0826 87.8244 55.1606 89.6854 59.3789L94.3779 81.6063L89.7406 80.9694L83.5868 65.1577L80.1929 55.4225Z" fill="#C95836"/>
              <path d="M89.5588 80.3603L90.8519 84.2698C91.1111 85.05 91.6404 85.7007 92.3462 86.1032L95.2025 87.7299C96.1978 88.2951 97.4826 87.6554 97.6922 86.4892L95.7898 81.6781C95.3707 80.6167 94.5133 79.7124 93.3912 79.1444L91.5219 78.1987L89.5588 80.3575V80.3603Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M73.4851 25.4011L87.6205 51.2044L93.7549 74.882L86.3605 78.3338L78.0728 55.8583L69.7024 41.6126L73.4851 25.4011Z" fill="#8CA671"/>
              <path d="M56.7191 97.0735C56.3718 95.0305 53.3555 85.334 53.3555 85.334H50.3035" stroke="#939C89" stroke-width="0.675479" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M71.1361 43.6003L67.1494 34.1574L67.4334 32.2495" stroke="#3A6B26" stroke-width="0.725106" stroke-linecap="round" stroke-linejoin="round"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M52.9118 3.25635C52.9118 3.25635 47.0035 3.25635 48.5502 10.0966C50.0803 16.8569 56.7882 9.61688 56.7882 9.61688L52.9118 3.25635Z" fill="#5C3420"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M51.572 12.5394C51.572 12.5394 51.9497 16.8239 52.2613 20.3722C52.344 21.3179 52.9092 22.1478 53.7418 22.542C54.5717 22.939 55.5394 22.837 56.2728 22.2801C56.5127 22.0981 56.747 21.9189 56.9676 21.7508C57.9712 20.9871 58.4564 19.6857 58.2138 18.4064C57.5907 15.1311 56.4575 9.16479 56.4575 9.16479L51.572 12.5367V12.5394Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M51.7043 14.4665L52.0104 17.0361C53.8107 16.606 54.8722 15.0152 55.7793 13.179L51.7043 14.4665Z" fill="#873B24"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M58.1172 8.67659C58.4287 7.52138 57.7836 6.32206 56.678 5.99673C55.4952 5.64934 54.0064 5.21373 52.8236 4.8691C51.7153 4.54376 50.7338 5.28265 50.254 6.37445C49.6888 7.66199 49.1319 10.5155 48.972 12.6385C48.881 13.835 49.4572 15.1309 50.5656 15.4562C51.7484 15.8036 55.6055 15.6657 56.5429 13.5593C57.257 11.9575 57.6595 10.3777 58.1172 8.67659Z" fill="#C95836"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M49.6612 11.8997L51.5939 12.4235C51.5939 12.4235 51.2135 13.791 50.3119 13.4243C49.4103 13.0576 49.6612 11.8997 49.6612 11.8997Z" fill="white"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M51.2246 4.60457C51.2246 4.60457 53.1518 10.9017 55.3905 11.5468C56.5402 11.8777 56.3748 13.5678 57.2433 14.2708C58.8175 15.5446 61.8503 11.0892 61.6077 9.07927C61.2493 6.11543 60.5131 4.96298 57.1688 3.46039C55.1258 2.54229 52.7493 1.38984 51.2246 4.60457Z" fill="#5C3420"/>
              <path fill-rule="evenodd" clip-rule="evenodd" d="M58.1087 13.6255C57.5573 14.4278 56.5951 14.6897 55.961 14.2155C55.3269 13.7385 55.258 12.7046 55.8094 11.9023C56.3608 11.1 57.323 10.8381 57.9571 11.3123C58.5912 11.7893 58.6602 12.8232 58.1087 13.6255Z" fill="#C95836"/>
              <path d="M56.7083 2.90063C57.5436 3.52649 58.7126 4.70926 58.7126 4.70926" stroke="#BFAB9E" stroke-width="0.802303" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </slot>
      </CompletedMessage>
    {/if}
  </article>
{/if}

<style>
  article {
    position: relative;
    background-color: transparent;
    font-size: 16px;
  }

  .play {
    display: flex;
    flex-direction: var(--order, row);

    flex-direction: column-reverse;
    position: relative;
    height: 100%;
    width: 100%;
    margin: 0 auto;
  }

  .play.is-loaded.stacked {
    flex-direction: column;
  }

  h3 {
    margin: 0;
    margin-bottom: 0.5em;
  }

  @media only screen and (max-width: 1024px) {
    .play:not(.is-loaded) {
      flex-direction: column;
    }
  }




  /* crossword subscribe */
  .crossword_subscribe_container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    position: relative;
  }
  .crossword_subscribe_container h3 {
    text-align: center;
    color: #000;
    text-align: center;
    font-family: Gilroy;
    font-size: 26px;
    font-style: normal;
    font-weight: 600;
    line-height: 1.11;
  }
  .crossword_subscribe_container h3 strong {
    color: #EB8D21;
    font-size: 36px;
    font-weight: 700;
  }
  .crossword_subscribe_container input {
    outline: none;
    border: none;
    border-radius: 120.639px;
    background: #FFF;
    box-shadow: 0px 2.4px 2.4px 0px rgba(0, 0, 0, 0.25);
    height: 42px;
    width: 80%;
    margin: 20px auto 0;
    padding: 0 24px;
    box-sizing: border-box;
    color: #333;
    font-size: 18px;
  }
  .error__tips {
    font-size: 14px;
    width: 80%;
    color: #ff4d4f;
    padding: 4px 0 0 18px;
    opacity: 0;
    pointer-events: none;
  }
  .error__tips.active {
    opacity: 1;
  }
  .crossword_subscribe_submit {
    padding: 12px 16px;
    border-radius: 41.738px;
    background: #FD5000;
    box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.25);
    color: #FFF;
    position: relative;

    font-family: Gilroy;
    font-size: 24px;
    font-weight: 500;
    line-height: 1;
    text-transform: uppercase;
    cursor: pointer;
    transition: all .3s;
    margin-top: 40px;
    user-select: none;
    overflow: hidden;
  }
  .crossword_subscribe_submit:active {
    opacity: .6;
  }
  .crossword_subscribe_submit.loading {
    pointer-events: none;
  }

  .crossword_subscribe_icon {
    position: absolute;
    right: -45px;
    height: 140px;
    top: 120px;
  }

  .anticon-loading {
    animation: loadingCircle 1s infinite linear;
  }
  @keyframes loadingCircle {
    100% {
      transform: rotate(360deg);
    }
  }
  .crossword_submit_loading {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    font-size: 18px;
    justify-content: center;
    background: #FD5000;
    pointer-events: none;
    z-index: 9;
  }
  .crossword_submit_loading svg {
    margin-right: 4px;
  }

  @media only screen and (max-width: 1024px) {
    .crossword_subscribe_container {
      padding: 30px 0;
    }
    .crossword_subscribe_container h3 {
      font-size: 16px;
    }
    .crossword_subscribe_container h3 strong {
      font-size: 28px;
    }
    .crossword_subscribe_container input {
      border-radius: 30px;
      height: 34px;
      width: 85%;
      margin: 10px auto 0;
      padding: 0 12px;
      font-size: 15px;
    }
    .crossword_subscribe_submit {
      padding: 10px 16px;
      border-radius: 36px;
      font-size: 18px;
      margin-top: 20px;
    }
    .crossword_submit_loading {
      font-size: 14px;
    }
    .crossword_submit_loading svg {
      margin-right: 4px;
    }
    .crossword_subscribe_icon {
      position: absolute;
      right: -45px;
      height: 94px;
      top: 90px;
    }
  }
  /* crossword subscribe */


  /* game over modal */
  .coupon_gameend {
    margin: 40px 12px 20px;
    position: relative;
  }
  .coupon_gameend .coupone_info {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .coupon_gameend .coupone_info .coupone_info_title {
    color: #754C08;
    text-align: center;
    font-family: Gilroy;
    font-size: 24px;
    font-weight: bold;
  }
  .coupon_gameend .coupone_info .coupone_info_des {
    color: #000;
    text-align: center;
    font-family: Gilroy;
    font-size: 16px;
    font-weight: 700;
  }
  .coupon_gameend img {
    height: 280px;
  }
  .footer_gameend {
    padding: 20px 60px;
    color: #000;
    text-align: center;
    font-family: Gilroy;
    font-size: 14px;
    font-weight: 500;
    display: flex;
  }

  @media only screen and (max-width: 1024px) {
    .title_gameend {
      font-size: 18px;
      text-align: center;
    }
    .coupon_gameend {
      margin: 20px 8px 10px;
      display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    }
    .footer_gameend {
      padding: 10px 20px;
    }
    .coupon_gameend .coupone_info .coupone_info_title {
      font-size: 16px;
    }
    .coupon_gameend .coupone_info .coupone_info_des {
      font-size: 12px;
      font-weight: 500;
    }
    .coupon_gameend img {
      height: unset;
      width: 100%;
    }
  }
  /* game over modal */
</style>
